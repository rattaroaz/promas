import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderApp, screen, userEvent, waitFor } from "../test/render";
import { InvoiceBrowse } from "./InvoiceBrowse";
import { api, emptyInvoice } from "../api";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    api: {
      ...actual.api,
      listInvoices: vi.fn(),
      getInvoice: vi.fn(),
      listCompanies: vi.fn(),
      listEmployees: vi.fn(),
      listWorkTypes: vi.fn(),
      listProperties: vi.fn(),
      saveInvoice: vi.fn(),
      voidInvoice: vi.fn(),
      getSysdata: vi.fn(),
    },
  };
});

const fixture = {
  ...emptyInvoice(),
  companyNo: "1000",
  proNo: "01",
  salesDate: "2026-01-15",
  invoice: 1,
  salesUnit: "A1",
  custPoNo: "PO-441",
  salesTotal: 250,
  payTotal: 0,
  balance: 250,
  companyName: "ACME",
};

describe("InvoiceBrowse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listInvoices).mockResolvedValue([fixture]);
    vi.mocked(api.listCompanies).mockResolvedValue([]);
    vi.mocked(api.listEmployees).mockResolvedValue([]);
    vi.mocked(api.listWorkTypes).mockResolvedValue([]);
    vi.mocked(api.listProperties).mockResolvedValue([]);
    vi.mocked(api.getInvoice).mockResolvedValue({
      invoice: fixture,
      lines: [],
    });
    vi.mocked(api.saveInvoice).mockResolvedValue(1);
    vi.mocked(api.getSysdata).mockResolvedValue({
      company: "Test",
      address1: "",
      address2: "",
      city: "",
      zip: "",
      closeDate: null,
      nextInvoice: 8,
      nextOrder: 1,
      nextEstimate: 1,
      termsDays: 7,
      interestRate: 1.5,
    });
  });

  it("loads invoice list and opens edit on row click", async () => {
    const user = userEvent.setup();
    renderApp(<InvoiceBrowse onBack={vi.fn()} />);
    expect(await screen.findByText(/1 invoices/i)).toBeInTheDocument();
    expect(screen.getByText(/Inv#\s+PO/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /PO-441/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /1000/ }));
    expect(await screen.findByText(/Invoice No\.\.\.\.\.\.\.\. 1\s+PO-441/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(api.getInvoice).toHaveBeenCalledWith(
        "1000",
        "01",
        "2026-01-15",
        1
      );
    });
  });

  it("saves from edit dialog via Ctrl-W", async () => {
    const user = userEvent.setup();
    renderApp(<InvoiceBrowse onBack={vi.fn()} />);
    await screen.findByText(/1 invoices/i);
    await user.click(screen.getByRole("button", { name: /1000/ }));
    await screen.findByText(/Invoice No\.\.\.\.\.\.\.\. 1\s+PO-441/i);
    await user.keyboard("{Control>}w{/Control}");
    await waitFor(() => {
      expect(api.saveInvoice).toHaveBeenCalled();
    });
    // Edit dialog closes; load() refreshes the browse list
    await waitFor(() => {
      expect(screen.queryByText(/Invoice No/i)).not.toBeInTheDocument();
    });
    expect(screen.getByText(/1 invoices/i)).toBeInTheDocument();
  });

  it("autopopulates the next invoice number when adding", async () => {
    renderApp(<InvoiceBrowse onBack={vi.fn()} />);
    await screen.findByText(/1 invoices/i);
    const { act } = await import("@testing-library/react");
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Insert", bubbles: true })
      );
    });
    expect(await screen.findByText(/Invoice No\.\.\.\.\.\.\.\. 8/i)).toBeInTheDocument();
  });
});
