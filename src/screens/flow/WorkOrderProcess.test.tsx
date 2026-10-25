import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { fireEvent, renderApp, screen, userEvent, waitFor } from "../../test/render";
import { WorkOrderProcess } from "./WorkOrderProcess";
import { api, emptyCompany, emptyProperty, emptyWorkOrder } from "../../api";

vi.mock("../../api", async () => {
  const actual = await vi.importActual<typeof import("../../api")>("../../api");
  return {
    ...actual,
    api: {
      ...actual.api,
      listWorkOrders: vi.fn(),
      listWorkTypes: vi.fn(),
      getWorkOrder: vi.fn(),
      saveWorkOrder: vi.fn(),
      voidWorkOrder: vi.fn(),
      saveWorkType: vi.fn(),
    },
  };
});

const company = { ...emptyCompany(), companyNo: "1000", name: "ACME" };
const property = { ...emptyProperty("1000"), proNo: "01", name: "Bldg A" };
const order = {
  ...emptyWorkOrder(),
  companyNo: "1000",
  proNo: "01",
  orderDate: "2026-02-01",
  orderNo: 7,
  orderUnit: "A1",
  orderSize: "1+1",
  orderBy: "MGR",
};

describe("WorkOrderProcess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listWorkOrders).mockResolvedValue([order]);
    vi.mocked(api.listWorkTypes).mockResolvedValue([]);
    vi.mocked(api.getWorkOrder).mockResolvedValue({ order, lines: [] });
    vi.mocked(api.saveWorkOrder).mockResolvedValue(8);
    vi.mocked(api.voidWorkOrder).mockResolvedValue(undefined);
    vi.mocked(api.saveWorkType).mockResolvedValue(undefined);
  });

  it("lists work orders for the selected property", async () => {
    renderApp(
      <WorkOrderProcess company={company} property={property} onBack={vi.fn()} />
    );
    expect(await screen.findByText(/Ord#/i)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /A1\/1\+1/i })).toBeInTheDocument();
    expect(api.listWorkOrders).toHaveBeenCalledWith(
      expect.objectContaining({ companyNo: "1000" })
    );
  });

  it("opens an existing work order for edit", async () => {
    const user = userEvent.setup();
    renderApp(
      <WorkOrderProcess company={company} property={property} onBack={vi.fn()} />
    );
    await user.click(await screen.findByRole("button", { name: /A1\/1\+1/i }));
    expect(await screen.findByText(/Order No/i)).toBeInTheDocument();
    expect(api.getWorkOrder).toHaveBeenCalled();
  });

  it("saves a new work order after Ctrl-S confirm", async () => {
    const user = userEvent.setup();
    renderApp(
      <WorkOrderProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByRole("button", { name: /A1\/1\+1/i });
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Insert", bubbles: true })
      );
    });
    expect(
      (await screen.findAllByText(/Enter Job Order Information/i)).length
    ).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /Cntr_S Save/i }));
    await user.click(screen.getByRole("button", { name: /^Y$/i }));
    await waitFor(() => {
      expect(api.saveWorkOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          order: expect.objectContaining({
            companyNo: "1000",
            proNo: "01",
          }),
        })
      );
    });
    expect(await screen.findByRole("button", { name: /A1\/1\+1/i })).toBeInTheDocument();
  });

  it("voids the selected work order after Del confirm", async () => {
    const user = userEvent.setup();
    renderApp(
      <WorkOrderProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByRole("button", { name: /A1\/1\+1/i });
    await user.click(screen.getByRole("button", { name: /^Del$/i }));
    expect(screen.getByText(/Do you want Void/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Y$/i }));
    await waitFor(() => {
      expect(api.voidWorkOrder).toHaveBeenCalledWith(
        "1000",
        "01",
        "2026-02-01",
        7
      );
    });
  });

  it("shows an empty-state when the property has no work orders", async () => {
    vi.mocked(api.listWorkOrders).mockResolvedValue([]);
    renderApp(
      <WorkOrderProcess company={company} property={property} onBack={vi.fn()} />
    );
    expect(await screen.findByText(/no work orders/i)).toBeInTheDocument();
  });

  it("fills a line from a known work-type code", async () => {
    const user = userEvent.setup();
    vi.mocked(api.listWorkTypes).mockResolvedValue([
      {
        codeNo: "P1",
        workType: "P",
        description: "Interior Paint",
        price: 220,
        voided: false,
      },
    ]);
    renderApp(
      <WorkOrderProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByRole("button", { name: /A1\/1\+1/i });
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Insert", bubbles: true })
      );
    });
    const code = await screen.findByTitle(/Enter Job Code No/i);
    await user.clear(code);
    await user.type(code, "P1");
    await user.tab();
    expect(screen.getByDisplayValue("Interior Paint")).toBeInTheDocument();
    expect(screen.getByDisplayValue("220.00")).toBeInTheDocument();
  });

  it("offers to add an unknown work-type code", async () => {
    const user = userEvent.setup();
    renderApp(
      <WorkOrderProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByRole("button", { name: /A1\/1\+1/i });
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Insert", bubbles: true })
      );
    });
    const code = await screen.findByTitle(/Enter Job Code No/i);
    await user.clear(code);
    await user.type(code, "ZZ");
    await user.tab();
    expect(
      (await screen.findAllByText(/does not exist !! Do you want Add Worktype/i))
        .length
    ).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /^Y$/i }));
    await waitFor(() => {
      expect(api.saveWorkType).toHaveBeenCalledWith(
        expect.objectContaining({ codeNo: "ZZ", workType: "P" })
      );
    });
  });
});

describe("WorkOrderProcess editing", () => {
  const orders = [
    order,
    { ...order, orderNo: 8, orderUnit: "B2", orderSize: "", orderBy: "", orderMan: "LEE" },
    { ...order, orderNo: 9, orderUnit: "C3", status: "DONE" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listWorkOrders).mockResolvedValue(orders);
    vi.mocked(api.listWorkTypes).mockResolvedValue([
      { codeNo: "P1", workType: "C", description: "Interior Paint", price: 220, voided: false },
    ]);
    vi.mocked(api.getWorkOrder).mockImplementation(async (_co, _pro, _date, no) => ({
      order: orders.find((o) => o.orderNo === no) ?? order,
      lines: [],
    }));
    vi.mocked(api.saveWorkOrder).mockResolvedValue(10);
    vi.mocked(api.voidWorkOrder).mockResolvedValue(undefined);
    vi.mocked(api.saveWorkType).mockResolvedValue(undefined);
  });

  async function openList() {
    const user = userEvent.setup();
    const onBack = vi.fn();
    renderApp(<WorkOrderProcess company={company} property={property} onBack={onBack} />);
    await screen.findByRole("button", { name: /A1\/1\+1/ });
    return { user, onBack };
  }

  async function openNew(user: ReturnType<typeof userEvent.setup>) {
    await user.keyboard("{Insert}");
    return screen.findByRole("textbox", { name: "Line 1 code" });
  }

  it("shows the property, who ordered, and each order's status", async () => {
    await openList();
    expect(screen.getByText(/ACME — Bldg A/)).toBeInTheDocument();
    const rows = screen.getAllByRole("button", { name: /\d{2}\/\d{2}\/2026/ });
    expect(rows.map((r) => r.textContent)).toEqual([
      "702/01/2026A1/1+1MGROK",
      "802/01/2026B2LEEOK",
      "902/01/2026C3/1+1MGRDONE",
    ]);
  });

  it("moves through the list and opens the selected order with Enter or Ctrl-Home", async () => {
    const { user } = await openList();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: /B2/ })).toHaveClass("selected");
    await user.keyboard("{End}");
    expect(screen.getByRole("button", { name: /C3/ })).toHaveClass("selected");
    await user.keyboard("{PageUp}");
    expect(screen.getByRole("button", { name: /A1/ })).toHaveClass("selected");
    await user.keyboard("{PageDown}{Home}{ArrowDown}{Enter}");
    expect(await screen.findByText(/Order No\.+ 8/)).toBeInTheDocument();
    expect(screen.getByText("Order #8 Ctrl-S=Save Esc=Exit")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.getByText("Ins=Add Enter=Edit Del=Void Esc=Back")).toBeInTheDocument();
    await user.keyboard("{ArrowUp}{Control>}{Home}{/Control}");
    expect(await screen.findByText(/Order No\.+ 7/)).toBeInTheDocument();
  });

  it("fills in an order, asks before saving, and saves on Y", async () => {
    const { user } = await openList();
    await openNew(user);
    fireEvent.change(screen.getByLabelText(/^Order Date/), { target: { value: "2026-02-03" } });
    fireEvent.change(screen.getByLabelText(/^Service Date/), { target: { value: "2026-02-05" } });
    const person = screen.getByRole("textbox", { name: "Order Person" });
    expect(person).toHaveValue("MGR");
    await user.clear(person);
    await user.type(person, "KIM");
    await user.type(screen.getByRole("textbox", { name: "Unit #" }), "D4");
    await user.type(screen.getByRole("textbox", { name: "Size" }), "2+2");
    await user.type(screen.getByRole("textbox", { name: "Order By" }), "Tenant");
    await user.type(screen.getByRole("textbox", { name: "Customer P.O" }), "PO-9");
    await user.type(screen.getByRole("textbox", { name: "Remarks" }), "Gate code 1234");

    await user.type(screen.getByRole("textbox", { name: "Line 1 description" }), "Patch walls");
    await user.selectOptions(screen.getByRole("combobox", { name: "Line 1 work type" }), "F");
    const price1 = screen.getByRole("textbox", { name: "Price 1" });
    await user.clear(price1);
    await user.type(price1, "75");
    await user.click(screen.getByRole("button", { name: "+ Line (* = free text)" }));
    const code2 = screen.getByRole("textbox", { name: "Line 2 code" });
    await user.clear(code2);
    await user.type(code2, "p1");
    await user.tab();
    expect(screen.getByRole("textbox", { name: "Line 2 description" })).toHaveValue("Interior Paint");
    expect(screen.getByRole("combobox", { name: "Line 2 work type" })).toHaveValue("C");
    expect(screen.getByText("Total: 295.00")).toBeInTheDocument();

    await user.keyboard("{Control>}s{/Control}");
    expect(screen.getByRole("dialog", { name: "Is This Data Correct ? (Y/N)" })).toBeInTheDocument();
    await user.keyboard("n");
    expect(screen.queryByRole("dialog", { name: "Is This Data Correct ? (Y/N)" })).not.toBeInTheDocument();
    expect(api.saveWorkOrder).not.toHaveBeenCalled();
    await user.keyboard("{Control>}s{/Control}");
    await user.keyboard("y");

    await waitFor(() => expect(api.saveWorkOrder).toHaveBeenCalledTimes(1));
    const saved = vi.mocked(api.saveWorkOrder).mock.calls[0][0];
    expect(saved.order).toMatchObject({
      companyNo: "1000",
      proNo: "01",
      orderDate: "2026-02-03",
      workDate: "2026-02-05",
      orderMan: "KIM",
      orderUnit: "D4",
      orderSize: "2+2",
      orderBy: "Tenant",
      custPoNo: "PO-9",
      remark1: "Gate code 1234",
    });
    expect(saved.lines.map((l) => [l.lineNo, l.codeNo, l.description, l.workType, l.price, l.orderDate])).toEqual([
      [1, "*", "Patch walls", "F", 75, "2026-02-03"],
      [2, "P1", "Interior Paint", "C", 220, "2026-02-03"],
    ]);
    expect(await screen.findByText("Work Order #10 saved.")).toBeInTheDocument();
  });

  it("drops a deleted line, keeps a blank code as free text, and clears the service date", async () => {
    vi.mocked(api.getWorkOrder).mockResolvedValue({
      order: { ...order, workDate: "2026-02-04" },
      lines: [
        { companyNo: "1000", proNo: "01", orderDate: "2026-02-01", orderNo: 7, lineNo: 1, codeNo: "P1", description: "Paint", workType: "P", price: 100 },
        { companyNo: "1000", proNo: "01", orderDate: "2026-02-01", orderNo: 7, lineNo: 2, codeNo: "P1", description: "Trim", workType: "P", price: 40 },
      ],
    });
    const { user } = await openList();
    await user.click(screen.getByRole("button", { name: /A1\/1\+1/ }));
    const code1 = await screen.findByRole("textbox", { name: "Line 1 code" });
    await user.clear(code1);
    await user.tab();
    expect(code1).toHaveValue("*");
    fireEvent.change(screen.getByLabelText(/^Service Date/), { target: { value: "" } });
    await user.click(screen.getAllByRole("button", { name: "Del" })[0]);
    expect(screen.getByText("Total: 40.00")).toBeInTheDocument();
    await user.keyboard("{Control>}s{/Control}Y");
    await waitFor(() => expect(api.saveWorkOrder).toHaveBeenCalledTimes(1));
    const saved = vi.mocked(api.saveWorkOrder).mock.calls[0][0];
    expect(saved.order.workDate).toBeNull();
    expect(saved.lines).toEqual([expect.objectContaining({ lineNo: 1, description: "Trim", price: 40 })]);
  });

  it("keeps the form and shows a failed save", async () => {
    vi.mocked(api.saveWorkOrder).mockRejectedValue(new Error("order 7 is locked"));
    const { user } = await openList();
    await user.click(screen.getByRole("button", { name: /A1\/1\+1/ }));
    await screen.findByText(/Order No\.+ 7/);
    await user.keyboard("{Control>}s{/Control}y");
    expect(await screen.findByText(/order 7 is locked/)).toBeInTheDocument();
    expect(screen.getByText(/Order No\.+ 7/)).toBeInTheDocument();
  });

  it("declines an unknown code on N or Esc without adding it", async () => {
    const { user } = await openList();
    const code = await openNew(user);
    await user.clear(code);
    await user.type(code, "QQ");
    await user.tab();
    expect(screen.getByRole("dialog", { name: /QQ --> does not exist/ })).toBeInTheDocument();
    await user.keyboard("n");
    expect(screen.queryByRole("dialog", { name: /does not exist/ })).not.toBeInTheDocument();
    code.focus();
    await user.tab();
    expect(screen.getByRole("dialog", { name: /QQ --> does not exist/ })).toBeInTheDocument();
    await user.keyboard("{Insert}");
    expect(screen.getAllByRole("textbox", { name: /^Line \d code$/ })).toHaveLength(1);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: /does not exist/ })).not.toBeInTheDocument();
    expect(code).toBeInTheDocument();
    expect(api.saveWorkType).not.toHaveBeenCalled();
  });

  it("adds an unknown code as a work type on Y and reloads the codes", async () => {
    const { user } = await openList();
    const code = await openNew(user);
    await user.clear(code);
    await user.type(code, "zz");
    await user.tab();
    await user.keyboard("y");
    await waitFor(() => expect(api.saveWorkType).toHaveBeenCalledWith(expect.objectContaining({ codeNo: "ZZ" })));
    expect(await screen.findByText("Worktype added — enter description on line")).toBeInTheDocument();
    expect(api.listWorkTypes).toHaveBeenCalledTimes(2);
  });

  it("keeps the form and shows a failed work-type add", async () => {
    vi.mocked(api.saveWorkType).mockRejectedValue(new Error("code ZZ already exists"));
    const { user } = await openList();
    const code = await openNew(user);
    await user.clear(code);
    await user.type(code, "zz");
    await user.tab();
    await user.keyboard("y");
    expect(await screen.findByText(/code ZZ already exists/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /does not exist/ })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Line 1 code" })).toBeInTheDocument();
  });

  it("shows a failed load", async () => {
    vi.mocked(api.listWorkOrders).mockRejectedValue(new Error("database is locked"));
    renderApp(<WorkOrderProcess company={company} property={property} onBack={vi.fn()} />);
    expect(await screen.findByText(/database is locked/)).toBeInTheDocument();
  });

  it("stays on the list and shows the error when an order or a new form cannot open", async () => {
    const { user } = await openList();
    vi.mocked(api.getWorkOrder).mockRejectedValueOnce(new Error("order 7 cannot be read"));
    await user.keyboard("{Enter}");
    expect(await screen.findByText(/order 7 cannot be read/)).toBeInTheDocument();
    expect(screen.queryByText(/Order No\.+ 7/)).not.toBeInTheDocument();
    vi.mocked(api.listWorkTypes).mockRejectedValueOnce(new Error("work types cannot be read"));
    await user.keyboard("{Insert}");
    expect(await screen.findByText(/work types cannot be read/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Line 1 code" })).not.toBeInTheDocument();
  });

  it("shows a voided order as void and will not void it again", async () => {
    const voided = { ...order, voided: true };
    vi.mocked(api.listWorkOrders).mockResolvedValue([voided]);
    vi.mocked(api.getWorkOrder).mockResolvedValue({ order: voided, lines: [] });
    const { user } = await openList();
    const row = screen.getByRole("button", { name: /A1\/1\+1/ });
    expect(row).toHaveClass("voided");
    expect(row).toHaveTextContent(/VOID$/);
    await user.keyboard("{Delete}");
    expect(screen.queryByRole("dialog", { name: /Do you want Void/ })).not.toBeInTheDocument();
    await user.click(row);
    expect(await screen.findByText("*** V O I D W O R K O R D E R ***", { selector: ".dos-messagebar" })).toBeInTheDocument();
  });

  it("asks before voiding, keeps the order on N, and confirms the void on Y", async () => {
    const { user } = await openList();
    await user.keyboard("{Delete}");
    expect(screen.getByRole("dialog", { name: /Do you want Void \(Y\/N\) \? Order #7/ })).toBeInTheDocument();
    await user.keyboard("N");
    await user.keyboard("{Delete}{Escape}");
    expect(api.voidWorkOrder).not.toHaveBeenCalled();
    await user.keyboard("{Delete}y");
    await waitFor(() => expect(api.voidWorkOrder).toHaveBeenCalledWith("1000", "01", "2026-02-01", 7));
    expect(await screen.findByText("Void Work Order")).toBeInTheDocument();
  });

  it("closes the void question and shows a failed void", async () => {
    vi.mocked(api.voidWorkOrder).mockRejectedValue(new Error("order 7 is locked"));
    const { user } = await openList();
    await user.keyboard("{Delete}y");
    expect(await screen.findByText(/order 7 is locked/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /Do you want Void/ })).not.toBeInTheDocument();
  });

  it("closes help, then the save question, then the form, then leaves on Esc", async () => {
    const { user, onBack } = await openList();
    await openNew(user);
    await user.keyboard("{Control>}s{/Control}");
    await user.keyboard("{F1}");
    expect(screen.getByText(/Function Key Description/)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Is This Data Correct ? (Y/N)" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Is This Data Correct ? (Y/N)" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Line 1 code" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox", { name: "Line 1 code" })).not.toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
