import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, renderApp, screen, userEvent, waitFor, within } from "../test/render";
import {
  ReportsScreen,
  agingSearchQuery,
  sortSalesRows,
} from "./ReportsScreen";
import {
  api,
  emptyCompany,
  emptyInvoice,
  emptyProperty,
  type AgingRow,
  type Company,
  type Property,
} from "../api";
import { downloadInvoicePdf, printInvoiceOnTemplate } from "../lib/invoicePrint";

vi.mock("../lib/invoicePrint", () => ({
  printInvoiceOnTemplate: vi.fn(),
  downloadInvoicePdf: vi.fn(),
}));

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    api: {
      ...actual.api,
      reportAging: vi.fn(),
      reportSalesAnalysis: vi.fn(),
      reportPaintUsage: vi.fn(),
      reportPayroll: vi.fn(),
      listPaintSupplyCos: vi.fn(),
      listWorkPersons: vi.fn(),
      listCashReceipts: vi.fn(),
      listInvoices: vi.fn(),
      getInvoice: vi.fn(),
      getCompany: vi.fn(),
      listCompanies: vi.fn(),
      listProperties: vi.fn(),
      reportMissingInvoices: vi.fn(),
      saveTextFile: vi.fn(),
    },
  };
});

const openInv = {
  ...emptyInvoice(),
  companyNo: "1000",
  proNo: "01",
  salesDate: "2026-01-15",
  invoice: 1,
  salesUnit: "A1",
  salesTotal: 250,
  balance: 250,
  custPoNo: "PO-77",
  propertyName: "Bldg A",
  propertyStreet: "1105 MAPLE ST.",
};

describe("agingSearchQuery", () => {
  it("treats blank and ? as all open companies", () => {
    expect(agingSearchQuery("")).toBeUndefined();
    expect(agingSearchQuery("  ?  ")).toBeUndefined();
    expect(agingSearchQuery("ELAINE")).toBe("ELAINE");
  });
});

describe("ReportsScreen aging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listInvoices).mockResolvedValue([openInv]);
    vi.mocked(api.getInvoice).mockResolvedValue({
      invoice: openInv,
      lines: [
        {
          companyNo: "1000",
          proNo: "01",
          salesDate: "2026-01-15",
          invoice: 1,
          lineNo: 1,
          codeNo: "*",
          description: "Paint",
          workDate: "2026-01-15",
          workType: "P",
          price: 250,
          empNo: "",
          empPrice: 0,
          commission: 65,
          status: "",
        },
      ],
    });
    vi.mocked(api.getCompany).mockResolvedValue({
      ...emptyCompany(),
      companyNo: "1000",
      name: "ACME Prop",
    });
    vi.mocked(api.listProperties).mockResolvedValue([
      {
        ...emptyProperty("1000"),
        proNo: "01",
        name: "Bldg A",
        street: "1105 MAPLE ST.",
      },
    ]);
    vi.mocked(printInvoiceOnTemplate).mockResolvedValue(undefined);
    vi.mocked(api.saveTextFile).mockResolvedValue("C:\\temp\\aging.xls");
    vi.mocked(api.reportAging).mockResolvedValue([
      {
        companyNo: "1000",
        companyName: "ACME Prop",
        contact: "ELAINE",
        phone: "555-0100",
        current: 100,
        days30: 0,
        days60: 0,
        days90: 0,
        days120: 0,
        openBal: 100,
      },
    ]);
  });

  it("searches aging by company and shows contact right of the name", async () => {
    const user = userEvent.setup();
    renderApp(<ReportsScreen onBack={vi.fn()} />);

    await user.click(
      screen.getByRole("button", { name: /Open Receivables Aging/i })
    );

    const search = await screen.findByLabelText("Aging company search");
    await user.type(search, "ELAINE");
    await user.click(screen.getByRole("button", { name: /^Run$/i }));

    await waitFor(() => {
      expect(api.reportAging).toHaveBeenCalledWith(undefined, "ELAINE");
    });
    expect(await screen.findByText(/Contact/)).toBeInTheDocument();
    expect(screen.getByText("ACME Prop")).toBeInTheDocument();
    expect(screen.getByText("ELAINE")).toBeInTheDocument();
  });

  it("searches aging by property address", async () => {
    const user = userEvent.setup();
    renderApp(<ReportsScreen onBack={vi.fn()} />);

    await user.click(
      screen.getByRole("button", { name: /Open Receivables Aging/i })
    );

    const search = await screen.findByLabelText("Aging company search");
    expect(search).toHaveAttribute(
      "placeholder",
      expect.stringMatching(/address/i)
    );
    await user.type(search, "MAPLE");
    await user.click(screen.getByRole("button", { name: /^Run$/i }));

    await waitFor(() => {
      expect(api.reportAging).toHaveBeenCalledWith(undefined, "MAPLE");
    });
  });

  it("treats ? as all companies that owe money", async () => {
    const user = userEvent.setup();
    renderApp(<ReportsScreen onBack={vi.fn()} />);
    await user.click(
      screen.getByRole("button", { name: /Open Receivables Aging/i })
    );
    const search = await screen.findByLabelText("Aging company search");
    expect(search).toHaveAttribute(
      "placeholder",
      expect.stringMatching(/\? = all/i)
    );
    await user.type(search, "?");
    await user.click(screen.getByRole("button", { name: /^Run$/i }));
    await waitFor(() => {
      expect(api.reportAging).toHaveBeenCalledWith(undefined, undefined);
    });
    expect(await screen.findByText(/ACME Prop/)).toBeInTheDocument();
  });

  it("opens outstanding invoice items when a company number is clicked", async () => {
    const user = userEvent.setup();
    renderApp(<ReportsScreen onBack={vi.fn()} />);
    await user.click(
      screen.getByRole("button", { name: /Open Receivables Aging/i })
    );
    await user.click(screen.getByRole("button", { name: /^Run$/i }));
    await user.click(
      await screen.findByRole("button", {
        name: /Company 1000 outstanding invoices/i,
      })
    );

    await waitFor(() => {
      expect(api.listInvoices).toHaveBeenCalledWith(
        expect.objectContaining({ companyNo: "1000" })
      );
    });
    expect(await screen.findByText(/Outstanding Invoices/i)).toBeInTheDocument();
    expect(screen.getByText(/Inv_#/)).toBeInTheDocument();
    expect(screen.getByText(/Address/)).toBeInTheDocument();
    expect(screen.getByText(/1105 MAPLE ST/)).toBeInTheDocument();
    expect(screen.getByText(/A1/)).toBeInTheDocument();
    expect(screen.getByText(/PO-77/)).toBeInTheDocument();
    expect(screen.getByText(/250\.00/)).toBeInTheDocument();
  });

  it("opens the invoice form when an invoice number is clicked", async () => {
    const user = userEvent.setup();
    renderApp(<ReportsScreen onBack={vi.fn()} />);
    await user.click(
      screen.getByRole("button", { name: /Open Receivables Aging/i })
    );
    await user.click(screen.getByRole("button", { name: /^Run$/i }));
    await user.click(
      await screen.findByRole("button", {
        name: /Company 1000 outstanding invoices/i,
      })
    );
    const invoiceRow = await screen.findByRole("button", { name: /01\/15\/2026/ });
    await user.click(invoiceRow);

    await waitFor(() => {
      expect(api.getInvoice).toHaveBeenCalledWith(
        "1000",
        "01",
        "2026-01-15",
        1
      );
      expect(printInvoiceOnTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          invoice: expect.objectContaining({ invoice: 1 }),
          company: expect.objectContaining({ companyNo: "1000" }),
          property: expect.objectContaining({ proNo: "01" }),
        })
      );
    });
  });

  it("shows each outstanding invoice with its amount, address, unit, and PO", async () => {
    const user = userEvent.setup();
    renderApp(<ReportsScreen onBack={vi.fn()} />);
    await user.click(
      screen.getByRole("button", { name: /Open Receivables Aging/i })
    );
    await user.click(screen.getByRole("button", { name: /^Run$/i }));
    await user.click(
      await screen.findByRole("button", {
        name: /Company 1000 outstanding invoices/i,
      })
    );
    const row = await screen.findByRole("button", { name: /01\/15\/2026/ });
    expect(row).toHaveTextContent("250.00");
    expect(row).toHaveTextContent("1105 MAPLE ST.");
    expect(row).toHaveTextContent("A1");
    expect(row).toHaveTextContent("PO-77");
  });

  it("saves the aging list on the summary page to Excel", async () => {
    const user = userEvent.setup();
    renderApp(<ReportsScreen onBack={vi.fn()} />);
    await user.click(
      screen.getByRole("button", { name: /Open Receivables Aging/i })
    );
    await user.click(screen.getByRole("button", { name: /^Run$/i }));
    await screen.findByRole("button", {
      name: /Company 1000 outstanding invoices/i,
    });
    await user.click(screen.getByRole("button", { name: /^Excel$/i }));

    await waitFor(() => {
      expect(api.saveTextFile).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Save to Excel",
          fileName: expect.stringMatching(/OpenReceivableAging-.*\.xls$/),
          extensions: ["xls"],
        }),
        expect.any(String)
      );
    });
    expect(api.listInvoices).not.toHaveBeenCalled();
    const body = vi.mocked(api.saveTextFile).mock.calls[0][1];
    expect(body).toContain("ACME Prop");
    expect(body).toContain("Open Bal");
    expect(body).not.toContain("1105 MAPLE ST.");
    expect(await screen.findByText(/Excel saved to/i)).toBeInTheDocument();
  });

  it("saves the outstanding invoice list when Excel is used on that page", async () => {
    const user = userEvent.setup();
    renderApp(<ReportsScreen onBack={vi.fn()} />);
    await user.click(
      screen.getByRole("button", { name: /Open Receivables Aging/i })
    );
    await user.click(screen.getByRole("button", { name: /^Run$/i }));
    await user.click(
      await screen.findByRole("button", {
        name: /Company 1000 outstanding invoices/i,
      })
    );
    await screen.findByText(/Outstanding Invoices/i);
    await user.click(screen.getByRole("button", { name: /^Excel$/i }));

    await waitFor(() => {
      expect(api.saveTextFile).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: expect.stringMatching(/OutstandingInvoices-1000-.*\.xls$/),
        }),
        expect.any(String)
      );
    });
    const body = vi.mocked(api.saveTextFile).mock.calls[0][1];
    expect(body).toContain("1105 MAPLE ST.");
    expect(body).toContain("PO-77");
    expect(body).toContain("Invoice Amount");
    expect(body).not.toContain("&gt;120");
    expect(await screen.findByText(/Excel saved to/i)).toBeInTheDocument();
  });

  it("searches cash receipts register by property address", async () => {
    vi.mocked(api.listCashReceipts).mockResolvedValue([
      {
        id: 1,
        companyNo: "1000",
        salesDate: "2026-01-15",
        invoice: 9,
        payment: 80,
        payRefNo: "CHK",
        payDate: "2026-01-20",
        voided: false,
        companyName: "ACME Prop",
      },
    ]);
    const user = userEvent.setup();
    renderApp(<ReportsScreen onBack={vi.fn()} />);

    await user.click(
      screen.getByRole("button", { name: /Cash Receipts Register/i })
    );

    const search = await screen.findByLabelText("Cash receipts search");
    await user.type(search, "MAPLE");
    await user.click(screen.getByRole("button", { name: /^Run$/i }));

    await waitFor(() => {
      expect(api.listCashReceipts).toHaveBeenCalledWith(
        expect.objectContaining({ search: "MAPLE" })
      );
    });
    expect(await screen.findByText(/ACME Prop/)).toBeInTheDocument();
  });
});

describe("ReportsScreen sales analysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.reportSalesAnalysis).mockResolvedValue([
      {
        salesDate: "2026-01-15",
        invoice: 1,
        companyNo: "1000",
        proNo: "01",
        salesAmount: 250,
        deposit: 0,
        salesBal: 250,
        payTotal: 0,
        balance: 250,
      },
    ]);
    vi.mocked(api.getInvoice).mockResolvedValue({
      invoice: openInv,
      lines: [
        {
          companyNo: "1000",
          proNo: "01",
          salesDate: "2026-01-15",
          invoice: 1,
          lineNo: 1,
          codeNo: "*",
          description: "Paint",
          workDate: "2026-01-15",
          workType: "P",
          price: 250,
          empNo: "",
          empPrice: 0,
          commission: 65,
          status: "",
        },
      ],
    });
    vi.mocked(api.getCompany).mockResolvedValue({
      ...emptyCompany(),
      companyNo: "1000",
      name: "ACME Prop",
    });
    vi.mocked(api.listProperties).mockResolvedValue([
      {
        ...emptyProperty("1000"),
        proNo: "01",
        name: "Bldg A",
        street: "1105 MAPLE ST.",
      },
    ]);
    vi.mocked(printInvoiceOnTemplate).mockResolvedValue(undefined);
  });

  it("searches sales analysis by company name or number", async () => {
    const user = userEvent.setup();
    renderApp(<ReportsScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Sales Analysis/i }));

    const search = await screen.findByLabelText("Sales company search");
    await user.type(search, "ACME");
    await user.click(screen.getByRole("button", { name: /^Run$/i }));

    await waitFor(() => {
      expect(api.reportSalesAnalysis).toHaveBeenCalledWith(
        expect.objectContaining({ companyNo: "ACME" })
      );
    });
    expect(await screen.findByText(/Total Counts: 1/)).toBeInTheDocument();
    expect(screen.getByText(/1000/)).toBeInTheDocument();
    expect(screen.getAllByText(/250\.00/).length).toBeGreaterThan(0);
  });

  it("searches sales analysis by invoice date, not pay date", async () => {
    const user = userEvent.setup();
    renderApp(<ReportsScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Sales Analysis/i }));

    expect(screen.getByText(/From Invoice Date/i)).toBeInTheDocument();
    expect(screen.getByText(/To Invoice Date/i)).toBeInTheDocument();
    expect(screen.queryByText(/From Pay Date/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("From invoice date"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(screen.getByLabelText("To invoice date"), {
      target: { value: "2026-01-31" },
    });
    await user.click(screen.getByRole("button", { name: /^Run$/i }));

    await waitFor(() => {
      expect(api.reportSalesAnalysis).toHaveBeenCalledWith(
        expect.objectContaining({
          fromDate: "2026-01-01",
          toDate: "2026-01-31",
        })
      );
    });
  });

  it("sorts sales analysis by company number and invoice date", async () => {
    vi.mocked(api.reportSalesAnalysis).mockResolvedValue([
      {
        salesDate: "2026-02-01",
        invoice: 2,
        companyNo: "1000",
        proNo: "01",
        salesAmount: 100,
        deposit: 0,
        salesBal: 100,
        payTotal: 0,
        balance: 100,
      },
      {
        salesDate: "2026-01-15",
        invoice: 1,
        companyNo: "2000",
        proNo: "01",
        salesAmount: 50,
        deposit: 0,
        salesBal: 50,
        payTotal: 0,
        balance: 50,
      },
    ]);
    const user = userEvent.setup();
    renderApp(<ReportsScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Sales Analysis/i }));
    await user.click(screen.getByRole("button", { name: /^Run$/i }));

    const dateBtn = await screen.findByRole("button", {
      name: /Sort by invoice date/i,
    });
    const companyBtn = screen.getByRole("button", {
      name: /Sort by company number/i,
    });
    
    const getFirstRow = () => document.querySelector(".dos-browse-body .dos-row");

    await screen.findByText(/02\/01\/2026/);
    expect(getFirstRow()?.textContent).toContain("02/01/2026");
    expect(getFirstRow()?.textContent).toContain("1000");

    await user.click(companyBtn);
    expect(getFirstRow()?.textContent).toContain("1000");
    expect(getFirstRow()?.textContent).toContain("02/01/2026");

    await user.click(dateBtn);
    expect(getFirstRow()?.textContent).toContain("01/15/2026");
    expect(getFirstRow()?.textContent).toContain("2000");
  });

  it("opens the invoice form when an invoice is clicked", async () => {
    const user = userEvent.setup();
    renderApp(<ReportsScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Sales Analysis/i }));
    await user.click(screen.getByRole("button", { name: /^Run$/i }));
    await user.click(await screen.findByRole("button", { name: /Invoice 1/i }));

    await waitFor(() => {
      expect(api.getInvoice).toHaveBeenCalledWith(
        "1000",
        "01",
        "2026-01-15",
        1
      );
      expect(printInvoiceOnTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          invoice: expect.objectContaining({ invoice: 1 }),
          company: expect.objectContaining({ companyNo: "1000" }),
          property: expect.objectContaining({ proNo: "01" }),
        })
      );
    });
  });
});

describe("sortSalesRows", () => {
  const a = {
    salesDate: "2026-02-01",
    invoice: 2,
    companyNo: "1000",
    proNo: "01",
    salesAmount: 100,
    deposit: 0,
    salesBal: 100,
    payTotal: 0,
    balance: 100,
  };
  const b = {
    salesDate: "2026-01-15",
    invoice: 1,
    companyNo: "2000",
    proNo: "01",
    salesAmount: 50,
    deposit: 0,
    salesBal: 50,
    payTotal: 0,
    balance: 50,
  };

  it("orders by invoice date then company number", () => {
    expect(sortSalesRows([a, b], "date", "desc").map((r) => r.invoice)).toEqual([
      2, 1,
    ]);
    expect(sortSalesRows([a, b], "date", "asc").map((r) => r.invoice)).toEqual([
      1, 2,
    ]);
    expect(sortSalesRows([a, b], "company", "asc").map((r) => r.companyNo)).toEqual(
      ["1000", "2000"]
    );
    expect(
      sortSalesRows([a, b], "company", "desc").map((r) => r.companyNo)
    ).toEqual(["2000", "1000"]);
  });
});

describe("ReportsScreen paint usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listPaintSupplyCos).mockResolvedValue(["Dunn-Edwards"]);
    vi.mocked(api.listWorkPersons).mockResolvedValue([
      { name: "Jose Ramirez", workerNo: "", active: true },
    ]);
    vi.mocked(api.reportPaintUsage).mockResolvedValue([
      {
        workPerson: "Jose Ramirez",
        materialCost: 40,
        invoice: 12,
        invoiceTotal: 250,
        paintSupplyCo: "Dunn-Edwards",
        workDate: "2026-01-20",
      },
    ]);
  });

  it("lists Paint Usage Report on the menu", async () => {
    renderApp(<ReportsScreen onBack={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /9\.\s*Paint Usage Report/i })
    ).toBeInTheDocument();
  });

  it("searches by paint supply, work date, and work person", async () => {
    const user = userEvent.setup();
    renderApp(<ReportsScreen onBack={vi.fn()} />);
    await user.click(
      screen.getByRole("button", { name: /Paint Usage Report/i })
    );

    const supply = await screen.findByLabelText("Paint supply search");
    expect(
      await screen.findByRole("option", { name: "Dunn-Edwards" })
    ).toBeInTheDocument();
    await user.selectOptions(supply, "Dunn-Edwards");
    const person = screen.getByLabelText("Work person search");
    await user.type(person, "JOSE");
    fireEvent.change(screen.getByLabelText("From work date"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(screen.getByLabelText("To work date"), {
      target: { value: "2026-01-31" },
    });
    await user.click(screen.getByRole("button", { name: /^Run$/i }));

    await waitFor(() => {
      expect(api.reportPaintUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          paintSupplyCo: "Dunn-Edwards",
          search: "JOSE",
          fromDate: "2026-01-01",
          toDate: "2026-01-31",
        })
      );
    });
    const reportBody = await screen.findByText(/Jose Ramirez/);
    expect(reportBody).toBeInTheDocument();
    const header = within(document.querySelector<HTMLElement>(".browse-grid-header")!);
    expect(header.getByText("Paint Supply Co.")).toBeInTheDocument();
    expect(screen.getAllByText("Dunn-Edwards").length).toBeGreaterThan(0);
    expect(screen.getByText("Mat_Cost")).toBeInTheDocument();
    expect(screen.getByText("Inv_Total")).toBeInTheDocument();
    expect(screen.getByText("Work Date")).toBeInTheDocument();
  });
});

describe("ReportsScreen payroll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listWorkPersons).mockResolvedValue([
      { name: "Jose Ramirez", workerNo: "400", active: true },
      { name: "Inactive Ian", workerNo: "9", active: false },
    ]);
    vi.mocked(api.reportPayroll).mockResolvedValue([
      {
        salesDate: "2026-01-15",
        invoice: 12,
        invoiceTotal: 250,
        materialCost: 40,
        propertyAddress: "1105 MAPLE ST.",
        jobDescription: "Interior Paint / Wall Closet",
        salesUnit: "A1",
        companyNo: "1000",
        proNo: "01",
      },
    ]);
    vi.mocked(api.getInvoice).mockResolvedValue({
      invoice: { ...openInv, invoice: 12 },
      lines: [
        {
          companyNo: "1000",
          proNo: "01",
          salesDate: "2026-01-15",
          invoice: 12,
          lineNo: 1,
          codeNo: "*",
          description: "Paint",
          workDate: "2026-01-15",
          workType: "P",
          price: 250,
          empNo: "Jose Ramirez",
          empPrice: 0,
          commission: 65,
          status: "",
        },
      ],
    });
    vi.mocked(api.getCompany).mockResolvedValue({
      ...emptyCompany(),
      companyNo: "1000",
      name: "ACME Prop",
    });
    vi.mocked(api.listProperties).mockResolvedValue([
      {
        ...emptyProperty("1000"),
        proNo: "01",
        name: "Bldg A",
        street: "1105 MAPLE ST.",
      },
    ]);
    vi.mocked(printInvoiceOnTemplate).mockResolvedValue(undefined);
  });

  it("replaces Customer Ledger with Payroll Report", async () => {
    renderApp(<ReportsScreen onBack={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /1\.\s*Payroll Report/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Customer Ledger/i })
    ).not.toBeInTheDocument();
  });

  it("searches by work person and invoice date and opens the invoice", async () => {
    const user = userEvent.setup();
    renderApp(<ReportsScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Payroll Report/i }));

    const person = await screen.findByLabelText("Work person search");
    expect(person.tagName).toBe("SELECT");
    expect(screen.getByRole("option", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Jose Ramirez" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Inactive Ian" })).not.toBeInTheDocument();
    await user.selectOptions(person, "Jose Ramirez");
    fireEvent.change(screen.getByLabelText("From invoice date"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(screen.getByLabelText("To invoice date"), {
      target: { value: "2026-01-31" },
    });
    await user.click(screen.getByRole("button", { name: /^Run$/i }));

    await waitFor(() => {
      expect(api.reportPayroll).toHaveBeenCalledWith(
        expect.objectContaining({
          search: "Jose Ramirez",
          fromDate: "2026-01-01",
          toDate: "2026-01-31",
        })
      );
    });
    expect(await screen.findByText(/1105 MAPLE ST/)).toBeInTheDocument();
    expect(screen.getByText(/Interior Paint \/ Wall Closet/)).toBeInTheDocument();
    expect(screen.getByText(/Mat_Cost/)).toBeInTheDocument();
    expect(screen.getByText(/Inv_Total/)).toBeInTheDocument();
    expect(document.querySelector(".payroll-landscape")).toBeInTheDocument();
    expect(document.querySelector(".browse-grid")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Invoice 12/i }));
    await waitFor(() => {
      expect(api.getInvoice).toHaveBeenCalledWith(
        "1000",
        "01",
        "2026-01-15",
        12
      );
      expect(printInvoiceOnTemplate).toHaveBeenCalled();
    });
  });

  it("shows address, job description, and money columns", async () => {
    const user = userEvent.setup();
    renderApp(<ReportsScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Payroll Report/i }));
    await user.click(screen.getByRole("button", { name: /^Run$/i }));
    expect(await screen.findByText(/1105 MAPLE ST/)).toBeInTheDocument();
    expect(screen.getByText(/Interior Paint \/ Wall Closet/)).toBeInTheDocument();
    expect(screen.getAllByText("250.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("40.00").length).toBeGreaterThan(0);
    expect(screen.getByText("A1")).toBeInTheDocument();
    const header = document.querySelector(".browse-grid-header");
    const headerText = header?.textContent ?? "";
    expect(headerText.indexOf("Address")).toBeLessThan(
      headerText.indexOf("Inv_Total")
    );
    expect(headerText.indexOf("Inv_Total")).toBeLessThan(
      headerText.indexOf("Mat_Cost")
    );
  });
});

describe("ReportsScreen keys, other reports and failures", () => {
  const acme: Company = {
    ...emptyCompany(),
    companyNo: "1000",
    name: "ACME Prop",
    street: "1105 MAPLE ST.",
    city: "NEWPORT BEACH",
    state: "CA",
    zip: "92660",
    contact: "ELAINE",
    phone: "555-0100",
  };
  const bravo: Company = {
    ...emptyCompany(),
    companyNo: "2000",
    name: "BRAVO Mgmt",
    street: "9 ELM AVE.",
    city: "IRVINE",
    state: "CA",
    zip: "92614",
  };
  const bldgA: Property = {
    ...emptyProperty("1000"),
    proNo: "01",
    name: "Bldg A",
    street: "1105 MAPLE ST.",
    city: "NEWPORT BEACH",
    state: "CA",
    zip: "92660",
    phone: "555-0101",
    keyInfo: "LOCKBOX",
    paintTime: "8AM",
    noOfUnit: 12,
    manager: "TOM",
    pageMap: "889-C4",
  };
  const agingRow: AgingRow = {
    companyNo: "1000",
    companyName: "ACME Prop",
    contact: "ELAINE",
    phone: "555-0100",
    current: 100,
    days30: 0,
    days60: 0,
    days90: 0,
    days120: 0,
    openBal: 100,
  };
  const laterInv = { ...openInv, invoice: 2, salesDate: "2026-02-01", custPoNo: "PO-88" };
  const missingOrder = {
    orderDate: "2026-01-02",
    companyNo: "1000",
    proNo: "01",
    orderBy: "ELAINE",
    invoice: null,
    invDate: null,
    balance: 0,
    propertyAddress: "1105 MAPLE ST.",
    unitSize: "",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listCompanies).mockResolvedValue([acme, bravo]);
    vi.mocked(api.listProperties).mockResolvedValue([bldgA]);
    vi.mocked(api.listCashReceipts).mockResolvedValue([
      {
        id: 1,
        companyNo: "1000",
        salesDate: "2026-01-15",
        invoice: 9,
        payment: 80,
        payRefNo: "CHK",
        payDate: "2026-01-20",
        voided: false,
        companyName: "ACME Prop",
      },
    ]);
    vi.mocked(api.reportAging).mockResolvedValue([agingRow]);
    vi.mocked(api.listInvoices).mockResolvedValue([openInv, laterInv]);
    vi.mocked(api.getInvoice).mockResolvedValue({ invoice: openInv, lines: [] });
    vi.mocked(api.getCompany).mockResolvedValue(acme);
    vi.mocked(api.listWorkPersons).mockResolvedValue([
      { name: "Jose Ramirez", workerNo: "400", active: true },
    ]);
    vi.mocked(api.listPaintSupplyCos).mockResolvedValue([]);
    vi.mocked(api.reportPayroll).mockResolvedValue([]);
    vi.mocked(api.reportSalesAnalysis).mockResolvedValue([
      {
        salesDate: "2026-01-15",
        invoice: 1,
        companyNo: "1000",
        proNo: "01",
        salesAmount: 250,
        deposit: 0,
        salesBal: 250,
        payTotal: 0,
        balance: 250,
      },
    ]);
    vi.mocked(printInvoiceOnTemplate).mockResolvedValue(undefined);
    vi.mocked(downloadInvoicePdf).mockResolvedValue(undefined);
    vi.mocked(api.saveTextFile).mockResolvedValue("C:\\temp\\aging.xls");
  });

  const AGING_LIST = "Click a company number for outstanding invoice items Esc=Exit End=Print (X)cel";

  function key(k: string) {
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    });
  }
  const messageBar = () => document.querySelector(".dos-messagebar");
  const titleBar = () => document.querySelector(".dos-titlebar");
  const reportBody = () => document.querySelector(".dos-report")?.textContent ?? "";

  function renderReports(onBack = vi.fn()) {
    const user = userEvent.setup();
    renderApp(<ReportsScreen onBack={onBack} />);
    return { user, onBack };
  }

  async function openAgingDetail(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: /Open Receivables Aging/i }));
    await user.click(screen.getByRole("button", { name: /^Run$/i }));
    await user.click(
      await screen.findByRole("button", { name: /Company 1000 outstanding invoices/i })
    );
    await screen.findByText(/Outstanding Invoices/);
  }

  describe("keys", () => {
    it("Esc closes help, then the report, then leaves Reports", async () => {
      const { user, onBack } = renderReports();
      await user.click(screen.getByRole("button", { name: /Cash Receipts Register/i }));
      key("F1");
      expect(screen.getByText(/Function Key Description/)).toBeInTheDocument();

      key("Escape");
      expect(screen.queryByText(/Function Key Description/)).not.toBeInTheDocument();
      expect(titleBar()).toHaveTextContent("Cash Receipts Register");

      key("Escape");
      expect(screen.getByRole("button", { name: /Cash Receipts Register/i })).toBeInTheDocument();
      expect(onBack).not.toHaveBeenCalled();

      key("Escape");
      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it("any letter closes help without acting on it", async () => {
      const { user } = renderReports();
      await user.click(screen.getByRole("button", { name: /Mailing Labels/i }));
      key("F1");
      key("p");
      expect(screen.queryByText(/Function Key Description/)).not.toBeInTheDocument();
      expect(screen.getByRole("combobox")).toHaveValue("C");
    });

    it("Enter runs the report and End prints it", async () => {
      const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
      vi.mocked(api.reportMissingInvoices).mockResolvedValue([]);
      const { user } = renderReports();
      await user.click(screen.getByRole("button", { name: /Check Missing Invoice/i }));
      key("Enter");
      await waitFor(() => expect(api.reportMissingInvoices).toHaveBeenCalledTimes(1));
      key("End");
      expect(print).toHaveBeenCalledTimes(1);
    });

    it("Esc clears the results, so reopening a report starts fresh", async () => {
      const { user } = renderReports();
      for (const [item, shown] of [
        [/Cash Receipts Register/i, /Cash Receipts Total Counts/],
        [/Customer File/i, /Customer Report/],
      ] as const) {
        await user.click(screen.getByRole("button", { name: item }));
        await user.click(screen.getByRole("button", { name: /^Run$/i }));
        expect(await screen.findByText(shown)).toBeInTheDocument();
        key("Escape");
        await user.click(screen.getByRole("button", { name: item }));
        expect(screen.queryByText(shown)).not.toBeInTheDocument();
        expect(screen.getByText("Press Enter to run report.")).toBeInTheDocument();
        key("Escape");
      }
    });
  });

  describe("other reports", () => {
    it("Check Missing Invoice lists the orders and counts void, unbuilt and built ones", async () => {
      vi.mocked(api.reportMissingInvoices).mockResolvedValue([
        { ...missingOrder, orderNo: 501, status: "Void Work Order" },
        { ...missingOrder, orderNo: 502, status: "Not Build" },
        { ...missingOrder, orderNo: 503, invoice: 52629, invDate: "2026-01-10", balance: 445, status: "Built" },
      ]);
      const { user } = renderReports();
      await user.click(screen.getByRole("button", { name: /Check Missing Invoice/i }));
      fireEvent.change(screen.getByLabelText(/^From Date/), { target: { value: "2026-01-01" } });
      fireEvent.change(screen.getByLabelText(/^To Date/), { target: { value: "2026-01-31" } });
      await user.click(screen.getByRole("button", { name: /^Run$/i }));

      expect(
        await screen.findByText(/1 Void Work Orders, 1 Not Built, 1 Built/)
      ).toBeInTheDocument();
      expect(api.reportMissingInvoices).toHaveBeenCalledWith({
        fromDate: "2026-01-01",
        toDate: "2026-01-31",
      });
      expect(screen.getByText("501")).toBeInTheDocument();
      expect(screen.getAllByText("-")).toHaveLength(2);
      expect(screen.getByText("52629")).toBeInTheDocument();
      expect(screen.getByText("445.00")).toBeInTheDocument();
      expect(messageBar()).toHaveTextContent("Selection (Esc=Exit, End=Print)?");
    });

    it("Customer File lists each company with its properties", async () => {
      const { user } = renderReports();
      await user.click(screen.getByRole("button", { name: /Customer File/i }));
      await user.click(screen.getByRole("button", { name: /^Run$/i }));

      expect(await screen.findByText(/Customer Report/)).toBeInTheDocument();
      expect(api.listCompanies).toHaveBeenCalledWith({ limit: 5000 });
      expect(api.listProperties).toHaveBeenCalledWith({ limit: 10000 });
      expect(screen.getAllByText("---Company Information---")).toHaveLength(2);
      expect(screen.getAllByText("Property Information")).toHaveLength(1);
      expect(screen.getByText("BRAVO Mgmt")).toBeInTheDocument();
      expect(screen.getByText("LOCKBOX")).toBeInTheDocument();
      expect(screen.getByText("889-C4")).toBeInTheDocument();
      expect(screen.getByText(/Property Total: 1/)).toBeInTheDocument();
    });

    it("Mailing Labels print customers, or properties after P", async () => {
      const { user } = renderReports();
      await user.click(screen.getByRole("button", { name: /Mailing Labels/i }));
      expect(messageBar()).toHaveTextContent("(C)ustomer,(P)roperty");
      await user.click(screen.getByRole("button", { name: /^Run$/i }));
      await waitFor(() => expect(reportBody()).toContain("Total : 2"));
      expect(reportBody()).toContain("ACME Prop\n1105 MAPLE ST.\nNEWPORT BEACH, CA 92660");
      expect(api.listProperties).not.toHaveBeenCalled();

      key("p");
      expect(screen.getByRole("combobox")).toHaveValue("P");
      key("Enter");
      await waitFor(() => expect(reportBody()).toContain("Total : 1"));
      expect(reportBody()).toContain("Bldg A\n1105 MAPLE ST.\nNEWPORT BEACH, CA 92660");

      key("C");
      expect(screen.getByRole("combobox")).toHaveValue("C");
    });

    it("Invoice Register sorts by company with C and by date with D", async () => {
      const { user } = renderReports();
      await user.click(screen.getByRole("button", { name: /Invoice Register/i }));
      expect(titleBar()).toHaveTextContent("Invoice Register");
      await user.click(screen.getByRole("button", { name: /^Run$/i }));
      await waitFor(() => expect(reportBody()).toMatch(/^\*{5}\s+Invoice Register\s+\*{5}/));
      expect(messageBar()).toHaveTextContent("Sorted by invoice date ↓");

      key("c");
      expect(messageBar()).toHaveTextContent("Sorted by company# ↑");
      key("C");
      expect(messageBar()).toHaveTextContent("Sorted by company# ↓");
      key("d");
      expect(messageBar()).toHaveTextContent("Sorted by invoice date ↑");
      expect(screen.getByRole("button", { name: /Sort by invoice date/ })).toHaveTextContent("↑");
    });

    it("Cash Receipts Register totals the payments and trims the company number", async () => {
      const { user } = renderReports();
      await user.click(screen.getByRole("button", { name: /Cash Receipts Register/i }));
      fireEvent.change(screen.getByLabelText(/^From Company No/), { target: { value: " 1000 " } });
      fireEvent.change(screen.getByLabelText("From pay date"), { target: { value: "2026-01-01" } });
      await user.click(screen.getByRole("button", { name: /^Run$/i }));

      expect(await screen.findByText(/Cash Receipts Total Counts: 1/)).toBeInTheDocument();
      expect(api.listCashReceipts).toHaveBeenCalledWith(
        expect.objectContaining({ companyNo: "1000", fromDate: "2026-01-01", toDate: undefined })
      );
      expect(screen.getAllByText("80.00")).toHaveLength(2);
      expect(screen.getByText("CHK")).toBeInTheDocument();
    });

    it("Payroll ignores a work person typed for Paint Usage that it does not list", async () => {
      const { user } = renderReports();
      await user.click(screen.getByRole("button", { name: /Paint Usage Report/i }));
      await user.type(screen.getByLabelText("Work person search"), "JOSE");
      key("Escape");
      await user.click(screen.getByRole("button", { name: /Payroll Report/i }));
      await screen.findByRole("option", { name: "Jose Ramirez" });
      expect(screen.getByLabelText("Work person search")).toHaveValue("");

      await user.click(screen.getByRole("button", { name: /^Run$/i }));
      await waitFor(() => expect(api.reportPayroll).toHaveBeenCalledTimes(1));
      expect(api.reportPayroll).toHaveBeenCalledWith(expect.objectContaining({ search: undefined }));
    });

    it("a failed report shows the error and clears the old results", async () => {
      const { user } = renderReports();
      await user.click(screen.getByRole("button", { name: /Cash Receipts Register/i }));
      await user.click(screen.getByRole("button", { name: /^Run$/i }));
      await screen.findByText(/Cash Receipts Total Counts/);

      vi.mocked(api.listCashReceipts).mockRejectedValueOnce("database is locked");
      await user.click(screen.getByRole("button", { name: /^Run$/i }));
      await waitFor(() => expect(messageBar()).toHaveTextContent("database is locked"));
      expect(screen.queryByText(/Cash Receipts Total Counts/)).not.toBeInTheDocument();
      expect(screen.getByText("Press Enter to run report.")).toBeInTheDocument();
    });
  });

  describe("open receivables aging", () => {
    it("? lists every company that owes, even after a search was run", async () => {
      const { user } = renderReports();
      await user.click(screen.getByRole("button", { name: /Open Receivables Aging/i }));
      await user.type(screen.getByLabelText("Aging company search"), "ELAINE");
      await user.click(screen.getByRole("button", { name: /^Run$/i }));
      await waitFor(() => expect(api.reportAging).toHaveBeenCalledWith(undefined, "ELAINE"));

      key("?");
      await waitFor(() => expect(api.reportAging).toHaveBeenCalledTimes(2));
      expect(api.reportAging).toHaveBeenLastCalledWith(undefined, undefined);
      expect(screen.getByLabelText("Aging company search")).toHaveValue("?");
      await waitFor(() => expect(messageBar()).toHaveTextContent(AGING_LIST));
    });

    it("X runs the aging report first when needed, then saves it to Excel", async () => {
      const { user } = renderReports();
      await user.click(screen.getByRole("button", { name: /Open Receivables Aging/i }));
      key("x");
      await waitFor(() => expect(messageBar()).toHaveTextContent("Excel saved to: C:\\temp\\aging.xls"));
      expect(api.reportAging).toHaveBeenCalledWith(undefined, undefined);
      expect(vi.mocked(api.saveTextFile).mock.calls[0][1]).toContain("ACME Prop");
      expect(screen.getByRole("button", { name: /Company 1000 outstanding invoices/ })).toBeInTheDocument();
    });

    it("cancelling the Excel save keeps the list and the key guide", async () => {
      vi.mocked(api.saveTextFile).mockResolvedValue(null);
      const { user } = renderReports();
      await user.click(screen.getByRole("button", { name: /Open Receivables Aging/i }));
      await user.click(screen.getByRole("button", { name: /^Run$/i }));
      await screen.findByRole("button", { name: /Company 1000 outstanding invoices/ });
      await user.click(screen.getByRole("button", { name: /^Excel$/ }));
      await waitFor(() => expect(api.saveTextFile).toHaveBeenCalledTimes(1));
      await act(async () => {});
      expect(messageBar()).toHaveTextContent(AGING_LIST);

      await user.click(screen.getByRole("button", { name: /Company 1000 outstanding invoices/ }));
      await screen.findByText(/Outstanding Invoices/);
      key("X");
      await waitFor(() => expect(api.saveTextFile).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(messageBar()).toHaveTextContent("Esc=Back to aging (X)cel"));
      expect(messageBar()).not.toHaveTextContent("Excel saved");
    });

    it("a failed Excel save is reported", async () => {
      vi.mocked(api.saveTextFile).mockRejectedValueOnce("disk full");
      const { user } = renderReports();
      await user.click(screen.getByRole("button", { name: /Open Receivables Aging/i }));
      key("x");
      await waitFor(() => expect(messageBar()).toHaveTextContent("disk full"));
    });

    it("a failed invoice lookup leaves the aging list on screen", async () => {
      vi.mocked(api.listInvoices).mockRejectedValueOnce("timeout");
      const { user } = renderReports();
      await user.click(screen.getByRole("button", { name: /Open Receivables Aging/i }));
      await user.click(screen.getByRole("button", { name: /^Run$/i }));
      await user.click(
        await screen.findByRole("button", { name: /Company 1000 outstanding invoices/ })
      );
      await waitFor(() => expect(messageBar()).toHaveTextContent("timeout"));
      expect(screen.queryByText(/Outstanding Invoices/)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Company 1000 outstanding invoices/ })).toBeInTheDocument();
    });

    it("lists only open invoices, oldest first, with the company on the title line", async () => {
      vi.mocked(api.listInvoices).mockResolvedValue([
        laterInv,
        { ...openInv, invoice: 3, voided: true },
        { ...openInv, invoice: 4, balance: 0 },
        openInv,
      ]);
      const { user } = renderReports();
      await openAgingDetail(user);
      const rows = document.querySelectorAll(".dos-browse-body .dos-row");
      expect([...rows].map((r) => r.firstElementChild?.textContent)).toEqual(["1", "2"]);
      expect(messageBar()).toHaveTextContent("Click invoice# to view form Esc=Back (X)cel");
      expect(messageBar()).not.toHaveTextContent("End=Print");
    });

    it("arrow keys pick an outstanding invoice, Enter opens it, and End moves without printing", async () => {
      const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
      const { user } = renderReports();
      await openAgingDetail(user);
      const rows = () => document.querySelectorAll(".dos-browse-body .dos-row");

      key("ArrowDown");
      expect(rows()[1]).toHaveClass("selected");
      key("Home");
      expect(rows()[0]).toHaveClass("selected");
      key("End");
      expect(rows()[1]).toHaveClass("selected");
      expect(print).not.toHaveBeenCalled();

      key("Enter");
      await waitFor(() =>
        expect(api.getInvoice).toHaveBeenCalledWith("1000", "01", "2026-02-01", 2)
      );
    });

    it("Esc on the outstanding invoices goes back to the aging list", async () => {
      const { user } = renderReports();
      await openAgingDetail(user);
      key("Escape");
      expect(screen.queryByText(/Outstanding Invoices/)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Company 1000 outstanding invoices/ })).toBeInTheDocument();
      expect(messageBar()).toHaveTextContent(AGING_LIST);
    });

    it("Enter on an empty outstanding list goes back, as the list says", async () => {
      vi.mocked(api.listInvoices).mockResolvedValue([{ ...openInv, balance: 0 }]);
      const { user } = renderReports();
      await openAgingDetail(user);
      expect(screen.getByText(/Press Enter to Exit/)).toBeInTheDocument();

      key("Enter");
      expect(screen.queryByText(/Outstanding Invoices/)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Company 1000 outstanding invoices/ })).toBeInTheDocument();
      expect(messageBar()).toHaveTextContent(AGING_LIST);
      expect(api.getInvoice).not.toHaveBeenCalled();
    });
  });

  describe("opening an invoice form", () => {
    async function clickFirstInvoice(user: ReturnType<typeof userEvent.setup>) {
      await openAgingDetail(user);
      await user.click(screen.getByRole("button", { name: /01\/15\/2026/ }));
    }

    it("says so when the invoice is not on file", async () => {
      vi.mocked(api.getInvoice).mockResolvedValue(null);
      const { user } = renderReports();
      await clickFirstInvoice(user);
      await waitFor(() =>
        expect(messageBar()).toHaveTextContent("--> does not exist in Invoice File !!!")
      );
      expect(printInvoiceOnTemplate).not.toHaveBeenCalled();
    });

    it("fills in the company and property from the list when their records are missing", async () => {
      vi.mocked(api.getCompany).mockResolvedValue(null);
      vi.mocked(api.listProperties).mockResolvedValue([]);
      const { user } = renderReports();
      await clickFirstInvoice(user);
      await waitFor(() => expect(printInvoiceOnTemplate).toHaveBeenCalledTimes(1));
      expect(printInvoiceOnTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          company: expect.objectContaining({
            companyNo: "1000",
            name: "ACME Prop",
            contact: "ELAINE",
            phone: "555-0100",
          }),
          property: expect.objectContaining({
            companyNo: "1000",
            proNo: "01",
            name: "Bldg A",
            street: "1105 MAPLE ST.",
          }),
        })
      );
      expect(messageBar()).toHaveTextContent("Invoice #1 Esc=close form click invoice# to view");
    });

    it("downloads the PDF when the form cannot be shown", async () => {
      vi.mocked(printInvoiceOnTemplate).mockRejectedValueOnce(new Error("blocked"));
      const { user } = renderReports();
      await clickFirstInvoice(user);
      await waitFor(() =>
        expect(messageBar()).toHaveTextContent("Print window blocked — PDF downloaded instead.")
      );
      expect(downloadInvoicePdf).toHaveBeenCalledWith(
        expect.objectContaining({
          company: expect.objectContaining({ companyNo: "1000", name: "ACME Prop" }),
          property: expect.objectContaining({ proNo: "01", street: "1105 MAPLE ST." }),
          invoice: openInv,
        })
      );
    });

    it("keeps the error on the status line when the download fails too", async () => {
      vi.mocked(printInvoiceOnTemplate).mockRejectedValueOnce(new Error("blocked"));
      vi.mocked(downloadInvoicePdf).mockRejectedValueOnce(new Error("no disk"));
      const { user } = renderReports();
      await clickFirstInvoice(user);
      await waitFor(() => expect(downloadInvoicePdf).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(messageBar()).toHaveTextContent("Error: blocked"));
      expect(messageBar()).not.toHaveTextContent("downloaded instead");
    });
  });
});
