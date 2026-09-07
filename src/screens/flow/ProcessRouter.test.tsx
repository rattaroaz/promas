import { describe, expect, it, vi } from "vitest";
import { renderApp, screen, userEvent, waitFor } from "../../test/render";
import { ProcessRouter } from "./ProcessRouter";
import { api, emptyCompany, emptyInvoice, emptyProperty } from "../../api";
import { getAppState, resetObservabilityForTests } from "../../lib/observability";

vi.mock("../../api", async () => {
  const actual = await vi.importActual<typeof import("../../api")>("../../api");
  return {
    ...actual,
    api: {
      ...actual.api,
      listCompanies: vi.fn(),
      listProperties: vi.fn(),
      listInvoices: vi.fn(),
      listWorkOrders: vi.fn(),
      listEstimates: vi.fn(),
      getCompany: vi.fn(),
      getSysdata: vi.fn(),
      listWorkPersons: vi.fn(),
      listPaintSupplyCos: vi.fn(),
    },
  };
});

describe("ProcessRouter observability", () => {
  it("sets screen to invoice/gate then invoice/process", async () => {
    resetObservabilityForTests();
    vi.mocked(api.listCompanies).mockResolvedValue([
      { ...emptyCompany(), companyNo: "1000", name: "ACME" },
    ]);
    vi.mocked(api.listProperties).mockResolvedValue([
      { ...emptyProperty("1000"), proNo: "01", name: "Bldg A" },
    ]);
    vi.mocked(api.listInvoices).mockResolvedValue([]);
    vi.mocked(api.getCompany).mockResolvedValue({
      ...emptyCompany(),
      companyNo: "1000",
      name: "ACME",
    });

    const user = userEvent.setup();
    renderApp(<ProcessRouter process="invoice" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(getAppState().currentScreen).toBe("invoice/gate");
    });

    await user.type(screen.getByPlaceholderText("? = first"), "?{Enter}");
    await user.click(await screen.findByRole("button", { name: /1000\s+ACME/i }));
    await user.click(await screen.findByRole("button", { name: /01\s+Bldg A/i }));

    await waitFor(() => {
      expect(getAppState().currentScreen).toBe("invoice/process");
    });
  });

  it("Esc from the invoice list returns to the property list, not company search", async () => {
    vi.mocked(api.listCompanies).mockResolvedValue([
      { ...emptyCompany(), companyNo: "1000", name: "ACME" },
    ]);
    vi.mocked(api.listProperties).mockResolvedValue([
      { ...emptyProperty("1000"), proNo: "01", name: "Bldg A" },
    ]);
    vi.mocked(api.listInvoices).mockResolvedValue([]);
    vi.mocked(api.getCompany).mockResolvedValue({
      ...emptyCompany(),
      companyNo: "1000",
      name: "ACME",
    });

    const user = userEvent.setup();
    renderApp(<ProcessRouter process="invoice" onBack={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("? = first"), "?{Enter}");
    await user.click(await screen.findByRole("button", { name: /1000\s+ACME/i }));
    await user.click(await screen.findByRole("button", { name: /01\s+Bldg A/i }));
    expect(await screen.findByRole("button", { name: /New Invoice/i })).toBeInTheDocument();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(await screen.findByRole("button", { name: /01\s+Bldg A/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /New Invoice/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Company NO" })).not.toBeInTheDocument();
  });

  it("Ins on the invoice list opens a new invoice form", async () => {
    vi.mocked(api.listCompanies).mockResolvedValue([
      { ...emptyCompany(), companyNo: "1000", name: "ACME" },
    ]);
    vi.mocked(api.listProperties).mockResolvedValue([
      { ...emptyProperty("1000"), proNo: "01", name: "Bldg A" },
    ]);
    vi.mocked(api.listInvoices).mockResolvedValue([]);
    vi.mocked(api.getCompany).mockResolvedValue({
      ...emptyCompany(),
      companyNo: "1000",
      name: "ACME",
    });
    vi.mocked(api.getSysdata).mockResolvedValue({
      company: "Test Co",
      address1: "",
      address2: "",
      city: "",
      zip: "",
      closeDate: null,
      nextInvoice: 2,
      nextOrder: 1,
      nextEstimate: 1,
      termsDays: 7,
      interestRate: 1.5,
    });
    vi.mocked(api.listWorkPersons).mockResolvedValue([]);
    vi.mocked(api.listPaintSupplyCos).mockResolvedValue([]);

    const user = userEvent.setup();
    renderApp(<ProcessRouter process="invoice" onBack={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("? = first"), "?{Enter}");
    await user.click(await screen.findByRole("button", { name: /1000\s+ACME/i }));
    await user.click(await screen.findByRole("button", { name: /01\s+Bldg A/i }));
    expect(await screen.findByRole("button", { name: /New Invoice/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Ins Add$/i }));
    expect(await screen.findByLabelText("Invoice Number")).toHaveValue(2);
  });

  it.each([
    ["workorder", "workorder/process", "Work Order Process"],
    ["estimate", "estimate/process", "Estimate Process"],
  ] as const)("routes %s after company and property", async (process, screenName, title) => {
    resetObservabilityForTests();
    vi.mocked(api.listCompanies).mockResolvedValue([
      { ...emptyCompany(), companyNo: "1000", name: "ACME" },
    ]);
    vi.mocked(api.listProperties).mockResolvedValue([
      { ...emptyProperty("1000"), proNo: "01", name: "Bldg A" },
    ]);
    vi.mocked(api.listInvoices).mockResolvedValue([]);
    vi.mocked(api.listWorkOrders).mockResolvedValue([]);
    vi.mocked(api.listEstimates).mockResolvedValue([]);
    vi.mocked(api.getCompany).mockResolvedValue({
      ...emptyCompany(),
      companyNo: "1000",
      name: "ACME",
    });

    const user = userEvent.setup();
    renderApp(<ProcessRouter process={process} onBack={vi.fn()} />);
    await user.type(screen.getByPlaceholderText("? = first"), "?{Enter}");
    await user.click(await screen.findByRole("button", { name: /1000\s+ACME/i }));
    await user.click(await screen.findByRole("button", { name: /01\s+Bldg A/i }));

    await waitFor(() => {
      expect(getAppState().currentScreen).toBe(screenName);
    });
    expect(screen.getByText(new RegExp(title, "i"))).toBeInTheDocument();
  });

  it("routes cash after company only", async () => {
    resetObservabilityForTests();
    vi.mocked(api.listCompanies).mockResolvedValue([
      { ...emptyCompany(), companyNo: "1000", name: "ACME" },
    ]);
    vi.mocked(api.listInvoices).mockResolvedValue([]);
    vi.mocked(api.getCompany).mockResolvedValue({
      ...emptyCompany(),
      companyNo: "1000",
      name: "ACME",
    });

    const user = userEvent.setup();
    renderApp(<ProcessRouter process="cash" onBack={vi.fn()} />);
    await user.type(screen.getByPlaceholderText("? = first"), "?{Enter}");
    await user.click(await screen.findByRole("button", { name: /1000\s+ACME/i }));

    await waitFor(() => {
      expect(getAppState().currentScreen).toBe("cash/process");
    });
    expect(screen.getByText(/Cash Receipts Process/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Customer Ledger/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /01\s+Bldg A/i })).not.toBeInTheDocument();
    expect(api.listInvoices).toHaveBeenCalledWith(
      expect.objectContaining({ companyNo: "1000" })
    );
  });

  it("opens previous invoices when searching by invoice number", async () => {
    vi.mocked(api.listCompanies).mockResolvedValue([
      { ...emptyCompany(), companyNo: "1000", name: "ACME" },
    ]);
    vi.mocked(api.listProperties).mockResolvedValue([
      { ...emptyProperty("1000"), proNo: "01", name: "Bldg A" },
    ]);
    vi.mocked(api.getCompany).mockResolvedValue({
      ...emptyCompany(),
      companyNo: "1000",
      name: "ACME",
    });
    const found = {
      ...emptyInvoice(),
      companyNo: "1000",
      proNo: "01",
      salesDate: "2026-01-15",
      invoice: 42,
      custPoNo: "PO-42",
      salesTotal: 100,
      balance: 100,
    };
    vi.mocked(api.listInvoices).mockImplementation(async (params) => {
      if (params.search === "42" || params.companyNo === "1000") {
        return [found];
      }
      return [];
    });

    const user = userEvent.setup();
    renderApp(<ProcessRouter process="invoice" onBack={vi.fn()} />);
    await user.type(
      screen.getByRole("textbox", { name: "Invoice Number" }),
      "42{Enter}"
    );
    expect(await screen.findByRole("button", { name: /New Invoice/i })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /PO-42/i })).toBeInTheDocument();
  });
});
