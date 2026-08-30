import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { renderApp, screen, userEvent, waitFor } from "../../test/render";
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
    expect(screen.getByRole("button", { name: /A1\/1\+1/i })).toBeInTheDocument();
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

  it("saves a new work order after Ctrl-W confirm", async () => {
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
    await user.click(screen.getByRole("button", { name: /Cntr_W Save/i }));
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
    expect(screen.getByDisplayValue(220)).toBeInTheDocument();
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
