import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderApp, screen, userEvent, waitFor, within } from "../test/render";
import { WorkOrderBrowse } from "./WorkOrderBrowse";
import { api, emptyCompany, emptyProperty, emptyWorkOrder, emptyWorkType } from "../api";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    api: {
      ...actual.api,
      listWorkOrders: vi.fn(),
      listCompanies: vi.fn(),
      listWorkTypes: vi.fn(),
      listProperties: vi.fn(),
      saveWorkOrder: vi.fn(),
    },
  };
});

const order = {
  ...emptyWorkOrder(),
  companyNo: "1000",
  proNo: "01",
  orderDate: "2026-02-01",
  orderNo: 7,
  orderUnit: "A1",
  orderSize: "1+1",
  orderBy: "ROSA",
  propertyName: "Bldg A",
};
const second = { ...order, orderNo: 8, orderUnit: "B2", orderSize: "", orderBy: "", orderMan: "MGR" };

async function openList() {
  const user = userEvent.setup();
  const onBack = vi.fn();
  renderApp(<WorkOrderBrowse onBack={onBack} />);
  await screen.findByText(/2 work orders/);
  return { user, onBack };
}

async function openNewOrder(user: ReturnType<typeof userEvent.setup>) {
  await user.keyboard("{Insert}");
  await screen.findByText("Enter Job Order Information");
  await screen.findByRole("option", { name: "1000 ACME" });
}

describe("WorkOrderBrowse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listWorkOrders).mockResolvedValue([order, second]);
    vi.mocked(api.listCompanies).mockResolvedValue([{ ...emptyCompany(), companyNo: "1000", name: "ACME" }]);
    vi.mocked(api.listWorkTypes).mockResolvedValue([
      { ...emptyWorkType(), codeNo: "P1", description: "Interior Paint", price: 220 },
      { ...emptyWorkType(), codeNo: "C1", workType: "C", description: "Clean", price: 95 },
    ]);
    vi.mocked(api.listProperties).mockResolvedValue([
      { ...emptyProperty("1000"), proNo: "01", name: "Bldg A" },
      { ...emptyProperty("1000"), proNo: "02", name: "Shop" },
    ]);
    vi.mocked(api.saveWorkOrder).mockResolvedValue(9);
  });

  it("lists orders with who ordered them and searches", async () => {
    const { user } = await openList();
    const first = screen.getByRole("button", { name: /A1\/1\+1/ });
    expect(first).toHaveTextContent("02/01/2026");
    expect(first).toHaveTextContent("ROSA");
    expect(screen.getByRole("button", { name: /B2/ })).toHaveTextContent("MGR");
    await user.type(screen.getByPlaceholderText(/Order#, Company/), "acme");
    await waitFor(() =>
      expect(api.listWorkOrders).toHaveBeenLastCalledWith({ search: "acme", limit: 300 })
    );
  });

  it("explains an empty list and shows a load error", async () => {
    vi.mocked(api.listWorkOrders).mockResolvedValueOnce([]);
    const { unmount } = renderApp(<WorkOrderBrowse onBack={vi.fn()} />);
    expect(await screen.findByText(/No work orders\. Press Ins to add/)).toBeInTheDocument();
    unmount();
    vi.mocked(api.listWorkOrders).mockRejectedValueOnce(new Error("database is locked"));
    renderApp(<WorkOrderBrowse onBack={vi.fn()} />);
    expect(await screen.findByText(/database is locked/)).toBeInTheDocument();
  });

  it("enters a new order: company picks properties, codes fill lines, and lines are numbered on save", async () => {
    const { user } = await openList();
    await openNewOrder(user);
    expect(api.listCompanies).toHaveBeenCalledWith({ limit: 2000 });

    await user.selectOptions(screen.getByRole("combobox", { name: "Company NO" }), "1000");
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Property NO" })).toHaveValue("01")
    );
    expect(api.listProperties).toHaveBeenCalledWith({ companyNo: "1000", limit: 500 });
    await user.selectOptions(screen.getByRole("combobox", { name: "Property NO" }), "02");
    await user.type(screen.getByRole("textbox", { name: "Unit #" }), "C3");
    await user.type(screen.getByRole("textbox", { name: "Size" }), "2+1");
    await user.type(screen.getByRole("textbox", { name: "Order By" }), "ROSA");
    await user.type(screen.getByRole("textbox", { name: "Customer P.O" }), "PO-77");
    await user.type(screen.getByLabelText(/Service Date/), "2026-02-10");

    const codes = () => screen.getAllByRole("combobox").filter((el) => within(el).queryByRole("option", { name: "*" }));
    await user.selectOptions(codes()[0], "P1");
    expect(screen.getByRole("textbox", { name: "Price 1" })).toHaveValue("220.00");
    await user.click(screen.getByRole("button", { name: "+ Line" }));
    await user.selectOptions(codes()[1], "C1");
    expect(screen.getByText(/Total:\s*315\.00/)).toBeInTheDocument();

    await user.keyboard("{Control>}s{/Control}");
    await waitFor(() => expect(api.saveWorkOrder).toHaveBeenCalledTimes(1));
    const saved = vi.mocked(api.saveWorkOrder).mock.calls[0][0];
    expect(saved.order).toMatchObject({
      companyNo: "1000",
      proNo: "02",
      orderUnit: "C3",
      orderSize: "2+1",
      orderBy: "ROSA",
      custPoNo: "PO-77",
      workDate: "2026-02-10",
    });
    expect(saved.lines.map((l) => [l.lineNo, l.codeNo, l.description, l.workType, l.price, l.companyNo, l.proNo])).toEqual([
      [1, "P1", "Interior Paint", "P", 220, "1000", "02"],
      [2, "C1", "Clean", "C", 95, "1000", "02"],
    ]);
    expect(await screen.findByText("Work Order #9 saved.")).toBeInTheDocument();
    expect(screen.queryByText("Enter Job Order Information")).not.toBeInTheDocument();
  });

  it("edits a line by hand", async () => {
    const { user } = await openList();
    await openNewOrder(user);
    await user.selectOptions(screen.getByRole("combobox", { name: "Company NO" }), "1000");
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Property NO" })).toHaveValue("01"));
    const row = screen.getByRole("textbox", { name: "Price 1" }).closest(".browse-grid") as HTMLElement;
    await user.type(within(row).getAllByRole("textbox")[0], "Touch-up");
    await user.selectOptions(within(row).getAllByRole("combobox")[1], "F");
    const price = screen.getByRole("textbox", { name: "Price 1" });
    await user.clear(price);
    await user.type(price, "40");
    await user.keyboard("{Control>}s{/Control}");
    await waitFor(() => expect(api.saveWorkOrder).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.saveWorkOrder).mock.calls[0][0].lines[0]).toMatchObject({
      codeNo: "*",
      description: "Touch-up",
      workType: "F",
      price: 40,
    });
  });

  it("needs a company and property, and shows a failed save", async () => {
    vi.mocked(api.saveWorkOrder).mockRejectedValue(new Error("order number taken"));
    const { user } = await openList();
    await openNewOrder(user);
    await user.keyboard("{Control>}s{/Control}");
    expect(await screen.findByText("--> Company and Property required !!")).toBeInTheDocument();
    expect(api.saveWorkOrder).not.toHaveBeenCalled();
    await user.selectOptions(screen.getByRole("combobox", { name: "Company NO" }), "1000");
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Property NO" })).toHaveValue("01"));
    await user.keyboard("{Control>}s{/Control}");
    expect(await screen.findByText(/order number taken/)).toBeInTheDocument();
    expect(screen.getByText("Enter Job Order Information")).toBeInTheDocument();
  });

  it("moves through the list, shows help, and steps back with Esc", async () => {
    const { user, onBack } = await openList();
    const first = () => screen.getByRole("button", { name: /A1\/1\+1/ });
    const last = () => screen.getByRole("button", { name: /B2/ });
    await user.keyboard("{ArrowDown}");
    expect(last()).toHaveClass("selected");
    await user.keyboard("{Home}");
    expect(first()).toHaveClass("selected");
    await user.keyboard("{End}");
    expect(last()).toHaveClass("selected");
    await user.keyboard("{PageUp}");
    expect(first()).toHaveClass("selected");
    await user.keyboard("{PageDown}{ArrowUp}");
    expect(first()).toHaveClass("selected");

    await user.keyboard("{F1}");
    expect(screen.getByText(/Function Key Description/)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await openNewOrder(user);
    await user.keyboard("{Escape}");
    expect(screen.getByText("Ins=Add Work Order Esc=Exit")).toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
