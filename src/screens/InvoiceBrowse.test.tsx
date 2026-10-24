import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { fireEvent, renderApp, screen, userEvent, waitFor } from "../test/render";
import { InvoiceBrowse } from "./InvoiceBrowse";
import {
  api,
  emptyCompany,
  emptyEmployee,
  emptyInvoice,
  emptyInvoiceLine,
  emptyProperty,
  emptyWorkType,
} from "../api";

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
      listPaintSupplyCos: vi.fn(),
      savePaintSupplyCo: vi.fn(),
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
    vi.mocked(api.voidInvoice).mockResolvedValue(undefined);
    vi.mocked(api.listPaintSupplyCos).mockResolvedValue(["Dunn-Edwards"]);
    vi.mocked(api.savePaintSupplyCo).mockImplementation(async (name: string) =>
      ["Dunn-Edwards", name].filter((v, i, a) => a.indexOf(v) === i).sort()
    );
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
    const header = document.querySelector(".browse-grid-header");
    expect(header?.textContent).toContain("Inv#");
    expect(header?.textContent).toContain("PO");
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

  it("saves from edit dialog via Ctrl-S", async () => {
    const user = userEvent.setup();
    renderApp(<InvoiceBrowse onBack={vi.fn()} />);
    await screen.findByText(/1 invoices/i);
    await user.click(screen.getByRole("button", { name: /1000/ }));
    await screen.findByText(/Invoice No\.\.\.\.\.\.\.\. 1\s+PO-441/i);
    await user.keyboard("{Control>}s{/Control}");
    await waitFor(() => {
      expect(api.saveInvoice).toHaveBeenCalled();
    });
    expect(await screen.findByText("Invoice #1 saved.")).toBeInTheDocument();
    expect(screen.queryByText(/Invoice No/i)).not.toBeInTheDocument();
    expect(api.listInvoices).toHaveBeenCalledTimes(2);
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

  it("requires company and property before saving a new invoice", async () => {
    const user = userEvent.setup();
    renderApp(<InvoiceBrowse onBack={vi.fn()} />);
    await screen.findByText(/1 invoices/i);
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Insert", bubbles: true })
      );
    });
    expect(await screen.findByText(/Invoice No\.\.\.\.\.\.\.\. 8/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Cntr_S Save/i }));
    expect(
      await screen.findByText(/Company, Property, Date required/i)
    ).toBeInTheDocument();
    expect(api.saveInvoice).not.toHaveBeenCalled();
  });

  it("saves a new invoice after company and property are chosen", async () => {
    const user = userEvent.setup();
    vi.mocked(api.listCompanies).mockResolvedValue([
      { ...emptyCompany(), companyNo: "1000", name: "ACME" },
    ]);
    vi.mocked(api.listProperties).mockResolvedValue([
      { ...emptyProperty("1000"), proNo: "01", name: "Bldg A" },
    ]);
    renderApp(<InvoiceBrowse onBack={vi.fn()} />);
    await screen.findByText(/1 invoices/i);
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Insert", bubbles: true })
      );
    });
    await screen.findByText(/Invoice No\.\.\.\.\.\.\.\. 8/i);
    const [companySelect] = screen.getAllByRole("combobox");
    await user.selectOptions(companySelect, "1000");
    await waitFor(() => {
      expect(api.listProperties).toHaveBeenCalledWith(
        expect.objectContaining({ companyNo: "1000" })
      );
    });
    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[1], "01");
    await user.click(screen.getByRole("button", { name: /Cntr_S Save/i }));
    await waitFor(() => {
      expect(api.saveInvoice).toHaveBeenCalledWith(
        expect.objectContaining({
          invoice: expect.objectContaining({
            companyNo: "1000",
            proNo: "01",
            invoice: 8,
          }),
        })
      );
    });
  });

  it("voids the selected invoice after Del confirm", async () => {
    const user = userEvent.setup();
    renderApp(<InvoiceBrowse onBack={vi.fn()} />);
    await screen.findByText(/1 invoices/i);
    await user.click(screen.getByRole("button", { name: /^Del$/i }));
    expect(screen.getByText(/Do you want Void/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Y$/i }));
    await waitFor(() => {
      expect(api.voidInvoice).toHaveBeenCalledWith(
        "1000",
        "01",
        "2026-01-15",
        1
      );
    });
  });

  it("shows an empty-state when there are no invoices", async () => {
    vi.mocked(api.listInvoices).mockResolvedValue([]);
    renderApp(<InvoiceBrowse onBack={vi.fn()} />);
    expect(await screen.findByText(/No invoices/i)).toBeInTheDocument();
  });

  it("filters by search text and invoice date range", async () => {
    const user = userEvent.setup();
    renderApp(<InvoiceBrowse onBack={vi.fn()} />);
    await screen.findByText(/1 invoices/i);
    await user.type(screen.getByRole("textbox", { name: "Search" }), "PO-441");
    fireEvent.change(screen.getByLabelText("From:"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("To:"), { target: { value: "2026-01-31" } });
    await waitFor(() =>
      expect(api.listInvoices).toHaveBeenLastCalledWith({
        search: "PO-441",
        fromDate: "2026-01-01",
        toDate: "2026-01-31",
        limit: 500,
      })
    );
  });

  it("shows a failed load", async () => {
    vi.mocked(api.listInvoices).mockRejectedValue(new Error("database is locked"));
    renderApp(<InvoiceBrowse onBack={vi.fn()} />);
    expect(await screen.findByText(/database is locked/)).toBeInTheDocument();
  });

  it("moves with the arrow keys and opens the selected invoice with Enter or Ctrl-Home", async () => {
    const second = { ...fixture, invoice: 2, salesDate: "2026-01-20", custPoNo: "PO-442" };
    vi.mocked(api.listInvoices).mockResolvedValue([fixture, second]);
    vi.mocked(api.getInvoice).mockImplementation(async (_co, _pro, _date, no) => ({
      invoice: no === 2 ? second : fixture,
      lines: [],
    }));
    const user = userEvent.setup();
    renderApp(<InvoiceBrowse onBack={vi.fn()} />);
    await screen.findByText(/2 invoices/i);
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: /PO-442/ })).toHaveClass("selected");
    await user.keyboard("{Enter}");
    expect(await screen.findByText(/Invoice No\.+ 2\s+PO-442/)).toBeInTheDocument();
    expect(api.getInvoice).toHaveBeenLastCalledWith("1000", "01", "2026-01-20", 2);
    expect(screen.getByText("Invoice #2 — Esc=Exit Ctrl-S=Save")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.getByText("Ins=Add Enter=View Del=Void Esc=Exit")).toBeInTheDocument();
    await user.keyboard("{ArrowUp}{Control>}{Home}{/Control}");
    expect(await screen.findByText(/Invoice No\.+ 1\s+PO-441/)).toBeInTheDocument();
  });

  it("marks a voided invoice and will not void it again", async () => {
    const voided = { ...fixture, voided: true };
    vi.mocked(api.listInvoices).mockResolvedValue([voided]);
    vi.mocked(api.getInvoice).mockResolvedValue({ invoice: voided, lines: [] });
    const user = userEvent.setup();
    renderApp(<InvoiceBrowse onBack={vi.fn()} />);
    const row = await screen.findByRole("button", { name: /PO-441/ });
    expect(row).toHaveClass("voided");
    expect(row.lastElementChild).toHaveTextContent("V");
    await user.keyboard("{Delete}");
    expect(screen.queryByText(/Do you want Void/)).not.toBeInTheDocument();
    await user.click(row);
    expect(await screen.findByText("*** V O I D I N V O I C E ***")).toBeInTheDocument();
  });

  it("asks before voiding, keeps the invoice on N, and confirms the void on Y", async () => {
    const user = userEvent.setup();
    renderApp(<InvoiceBrowse onBack={vi.fn()} />);
    await screen.findByText(/1 invoices/i);
    await user.keyboard("{Delete}");
    expect(screen.getByText(/Do you want Void \(Y\/N\) \? Invoice #1/)).toBeInTheDocument();
    await user.keyboard("n");
    expect(screen.queryByText(/Do you want Void/)).not.toBeInTheDocument();
    await user.keyboard("{Delete}");
    await user.keyboard("{Escape}");
    expect(screen.queryByText(/Do you want Void/)).not.toBeInTheDocument();
    expect(api.voidInvoice).not.toHaveBeenCalled();
    await user.keyboard("{Delete}");
    await user.keyboard("Y");
    expect(await screen.findByText("*** Void Invoice *** #1")).toBeInTheDocument();
    expect(api.voidInvoice).toHaveBeenCalledWith("1000", "01", "2026-01-15", 1);
    expect(api.listInvoices).toHaveBeenCalledTimes(2);
  });

  it("fills a line from its work type, totals the prices, and numbers the saved lines", async () => {
    vi.mocked(api.listCompanies).mockResolvedValue([{ ...emptyCompany(), companyNo: "1000", name: "ACME" }]);
    vi.mocked(api.listProperties).mockResolvedValue([
      { ...emptyProperty("1000"), proNo: "01", name: "Bldg A" },
      { ...emptyProperty("1000"), proNo: "02", name: "Bldg B" },
    ]);
    vi.mocked(api.listWorkTypes).mockResolvedValue([
      { ...emptyWorkType(), codeNo: "P1", description: "Interior Paint", workType: "P", price: 220 },
    ]);
    vi.mocked(api.listEmployees).mockResolvedValue([{ ...emptyEmployee(), empNo: "12", name: "Jose" }]);
    const user = userEvent.setup();
    renderApp(<InvoiceBrowse onBack={vi.fn()} />);
    await screen.findByText(/1 invoices/i);
    await user.keyboard("{Insert}");
    await screen.findByText(/Invoice No\.+ 8/);

    await user.selectOptions(screen.getByRole("combobox", { name: "Line 1 code" }), "P1");
    expect(screen.getByRole("textbox", { name: "Line 1 description" })).toHaveValue("Interior Paint");
    expect(screen.getByRole("textbox", { name: "Price 1" })).toHaveValue("220.00");
    await user.selectOptions(screen.getByRole("combobox", { name: "Line 1 employee" }), "12");
    await user.click(screen.getByRole("button", { name: "+ Line (Ins)" }));
    const price2 = screen.getByRole("textbox", { name: "Price 2" });
    await user.clear(price2);
    await user.type(price2, "30");
    await user.tab();
    expect(screen.getByText("Invoice Total : 250.00")).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: "Company NO" }), "1000");
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Property NO" })).toHaveValue("01"));
    await user.selectOptions(screen.getByRole("combobox", { name: "Property NO" }), "02");
    await user.click(screen.getAllByRole("button", { name: "Del" })[0]);
    expect(screen.getByText("Invoice Total : 30.00")).toBeInTheDocument();
    await user.keyboard("{Control>}s{/Control}");

    await waitFor(() => expect(api.saveInvoice).toHaveBeenCalledTimes(1));
    const saved = vi.mocked(api.saveInvoice).mock.calls[0][0];
    expect(saved.invoice).toMatchObject({ companyNo: "1000", proNo: "02", invoice: 8 });
    expect(saved.lines).toEqual([
      expect.objectContaining({ lineNo: 1, price: 30, companyNo: "1000", proNo: "02", salesDate: saved.invoice.salesDate }),
    ]);
    expect(await screen.findByText("Invoice #1 saved.")).toBeInTheDocument();
  });

  it("works out the line's commission as the price changes", async () => {
    vi.mocked(api.getInvoice).mockResolvedValue({
      invoice: fixture,
      lines: [{ ...emptyInvoiceLine(fixture, 1), price: 100, commission: 60, empPrice: 60 }],
    });
    const user = userEvent.setup();
    renderApp(<InvoiceBrowse onBack={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: /PO-441/ }));
    const price = await screen.findByRole("textbox", { name: "Price 1" });
    await user.clear(price);
    await user.type(price, "250");
    await user.keyboard("{Control>}s{/Control}");
    await waitFor(() => expect(api.saveInvoice).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.saveInvoice).mock.calls[0][0].lines[0]).toMatchObject({ price: 250, empPrice: 150 });
  });

  it("remembers a new paint supply company and lets one be picked from the list", async () => {
    const user = userEvent.setup();
    renderApp(<InvoiceBrowse onBack={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: /PO-441/ }));
    const typed = await screen.findByRole("textbox", { name: "Paint Supply Co." });
    const list = screen.getByRole("combobox", { name: "Paint Supply Co. list" });
    await user.type(typed, "Kelly-Moore");
    await user.tab();
    await waitFor(() => expect(api.savePaintSupplyCo).toHaveBeenCalledWith("Kelly-Moore"));
    expect(await screen.findByRole("option", { name: "Kelly-Moore" })).toBeInTheDocument();
    expect(list).toHaveValue("Kelly-Moore");
    await user.selectOptions(list, "Dunn-Edwards");
    expect(typed).toHaveValue("Dunn-Edwards");
  });

  it("keeps a new paint supply company for this session when it cannot be stored", async () => {
    vi.mocked(api.savePaintSupplyCo).mockRejectedValue(new Error("readonly database"));
    const user = userEvent.setup();
    renderApp(<InvoiceBrowse onBack={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: /PO-441/ }));
    const typed = await screen.findByRole("textbox", { name: "Paint Supply Co." });
    await user.type(typed, "Benjamin Moore");
    await user.tab();
    const options = await screen.findAllByRole("option", { name: /Moore|Dunn/ });
    expect(options.map((o) => o.textContent)).toEqual(["Benjamin Moore", "Dunn-Edwards"]);
  });

  it("keeps the editor open and shows a failed save", async () => {
    vi.mocked(api.saveInvoice).mockRejectedValue(new Error("invoice number already used"));
    const user = userEvent.setup();
    renderApp(<InvoiceBrowse onBack={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: /PO-441/ }));
    await screen.findByText(/Invoice No\.+ 1/);
    await user.keyboard("{Control>}s{/Control}");
    expect(await screen.findByText(/invoice number already used/)).toBeInTheDocument();
    expect(screen.getByText(/Invoice No\.+ 1/)).toBeInTheDocument();
  });

  it("starts at invoice 1 when the system record cannot be read", async () => {
    vi.mocked(api.getSysdata).mockRejectedValue(new Error("no sysdata row"));
    const user = userEvent.setup();
    renderApp(<InvoiceBrowse onBack={vi.fn()} />);
    await screen.findByText(/1 invoices/i);
    await user.keyboard("{Insert}");
    expect(await screen.findByText(/Invoice No\.+ 1$/)).toBeInTheDocument();
  });

  it("closes help, then the editor, then leaves on Esc, and prints the list on End", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    const onBack = vi.fn();
    const user = userEvent.setup();
    renderApp(<InvoiceBrowse onBack={onBack} />);
    await screen.findByText(/1 invoices/i);
    await user.keyboard("{End}");
    expect(print).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: /PO-441/ }));
    await screen.findByText(/Invoice No\.+ 1/);
    await user.keyboard("{F1}");
    expect(screen.getByText(/Function Key Description/)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByText(/Function Key Description/)).not.toBeInTheDocument();
    expect(screen.getByText(/Invoice No\.+ 1/)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByText(/Invoice No/)).not.toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
