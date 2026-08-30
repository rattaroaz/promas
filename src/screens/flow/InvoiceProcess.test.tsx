import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { renderApp, screen, userEvent, waitFor } from "../../test/render";
import { InvoiceProcess } from "./InvoiceProcess";
import { api, emptyCompany, emptyInvoice, emptyProperty } from "../../api";

vi.mock("../../api", async () => {
  const actual = await vi.importActual<typeof import("../../api")>("../../api");
  return {
    ...actual,
    api: {
      ...actual.api,
      listInvoices: vi.fn(),
      getInvoice: vi.fn(),
      listEmployees: vi.fn(),
      listWorkTypes: vi.fn(),
      getSysdata: vi.fn(),
      findWorkOrder: vi.fn(),
      saveInvoice: vi.fn(),
      voidInvoice: vi.fn(),
    },
  };
});

const company = { ...emptyCompany(), companyNo: "1000", name: "ACME" };
const property = { ...emptyProperty("1000"), proNo: "01", name: "Bldg A" };

const fixture = {
  ...emptyInvoice(),
  companyNo: "1000",
  proNo: "01",
  salesDate: "2026-01-15",
  invoice: 1,
  salesUnit: "A1",
  salesSize: "1+1",
  salesTotal: 250,
  balance: 250,
  custPoNo: "PO-441",
};

describe("InvoiceProcess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listInvoices).mockResolvedValue([fixture]);
    vi.mocked(api.listEmployees).mockResolvedValue([]);
    vi.mocked(api.listWorkTypes).mockResolvedValue([]);
    vi.mocked(api.getSysdata).mockResolvedValue({
      company: "Test",
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
    vi.mocked(api.getInvoice).mockResolvedValue({ invoice: fixture, lines: [] });
    vi.mocked(api.findWorkOrder).mockResolvedValue(null);
    vi.mocked(api.saveInvoice).mockResolvedValue(1);
  });

  it("loads invoices for the selected property", async () => {
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    expect(await screen.findByText(/1 invoices/i)).toBeInTheDocument();
    expect(screen.getByText(/Inv#\s+PO/i)).toBeInTheDocument();
    expect(screen.getByText(/Unit\s+Size/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /PO-441/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /A1\s+1\+1/i })).toBeInTheDocument();
    expect(api.listInvoices).toHaveBeenCalledWith(
      expect.objectContaining({ companyNo: "1000" })
    );
  });

  it("opens existing invoice for edit", async () => {
    const user = userEvent.setup();
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/1 invoices/i);
    await user.click(screen.getByRole("button", { name: /A1/i }));
    expect(await screen.findByText(/Invoice No\.\.\.\.\.\.\.\. 1\s+PO-441/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(api.getInvoice).toHaveBeenCalled();
    });
  });

  it("starts new invoice flow with Ins", async () => {
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/1 invoices/i);
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Insert", bubbles: true })
      );
    });
    expect(await screen.findByText(/Enter Invoice Date/i)).toBeInTheDocument();
  });

  it("autopopulates the next invoice number on a new invoice", async () => {
    const user = userEvent.setup();
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/1 invoices/i);
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Insert", bubbles: true })
      );
    });
    const order = await screen.findByLabelText(/Invoice Number/i);
    await user.click(order);
    await user.keyboard("{Enter}");
    expect(await screen.findAllByText(/Manual Invoice/i)).not.toHaveLength(0);
    await user.click(screen.getByRole("button", { name: /^Y$/i }));
    expect(await screen.findByText(/Invoice No\.\.\.\.\.\.\.\. 2/i)).toBeInTheDocument();
    expect(api.getSysdata).toHaveBeenCalled();
  });
});
