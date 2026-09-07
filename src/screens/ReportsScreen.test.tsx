import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, renderApp, screen, userEvent, waitFor } from "../test/render";
import {
  ReportsScreen,
  agingSearchQuery,
  formatAgingInvoiceRow,
  formatPaintUsage,
  sortSalesRows,
} from "./ReportsScreen";
import { api, emptyCompany, emptyInvoice, emptyProperty } from "../api";
import { save } from "@tauri-apps/plugin-dialog";
import { printInvoiceOnTemplate } from "../lib/invoicePrint";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(),
}));

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
      listProperties: vi.fn(),
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
  propertyStreet: "1105 QUAIL ST.",
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
        street: "1105 QUAIL ST.",
      },
    ]);
    vi.mocked(printInvoiceOnTemplate).mockResolvedValue(undefined);
    vi.mocked(api.saveTextFile).mockResolvedValue(undefined);
    vi.mocked(save).mockResolvedValue("C:\\temp\\aging.xls");
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
    expect(screen.getByText(/ACME Prop\s+ELAINE/)).toBeInTheDocument();
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
    await user.type(search, "QUAIL");
    await user.click(screen.getByRole("button", { name: /^Run$/i }));

    await waitFor(() => {
      expect(api.reportAging).toHaveBeenCalledWith(undefined, "QUAIL");
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
    expect(screen.getByText(/1105 QUAIL ST/)).toBeInTheDocument();
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

  it("formats outstanding invoice rows with address, unit, and PO", () => {
    const row = formatAgingInvoiceRow(openInv);
    expect(row).toContain("01/15/2026");
    expect(row).toContain("250.00");
    expect(row).toContain("1105 QUAIL ST.");
    expect(row).toContain("A1");
    expect(row).toContain("PO-77");
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
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultPath: expect.stringMatching(/OpenReceivableAging-.*\.xls$/),
        })
      );
      expect(api.saveTextFile).toHaveBeenCalled();
    });
    expect(api.listInvoices).not.toHaveBeenCalled();
    const body = vi.mocked(api.saveTextFile).mock.calls[0][1];
    expect(body).toContain("ACME Prop");
    expect(body).toContain("Open Bal");
    expect(body).not.toContain("1105 QUAIL ST.");
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
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultPath: expect.stringMatching(
            /OutstandingInvoices-1000-.*\.xls$/
          ),
        })
      );
      expect(api.saveTextFile).toHaveBeenCalled();
    });
    const body = vi.mocked(api.saveTextFile).mock.calls[0][1];
    expect(body).toContain("1105 QUAIL ST.");
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
    await user.type(search, "QUAIL");
    await user.click(screen.getByRole("button", { name: /^Run$/i }));

    await waitFor(() => {
      expect(api.listCashReceipts).toHaveBeenCalledWith(
        expect.objectContaining({ search: "QUAIL" })
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
        street: "1105 QUAIL ST.",
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
    const rows = () =>
      screen.getAllByText(/01\/15\/2026|02\/01\/2026/).map((el) => el.textContent);

    expect(rows()[0]).toMatch(/01\/15\/2026/);
    expect(rows()[0]).toMatch(/2000/);

    await user.click(companyBtn);
    expect(rows()[0]).toMatch(/1000/);
    expect(rows()[0]).toMatch(/02\/01\/2026/);

    await user.click(dateBtn);
    expect(rows()[0]).toMatch(/01\/15\/2026/);
    expect(rows()[0]).toMatch(/2000/);
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
    vi.mocked(api.listWorkPersons).mockResolvedValue(["Jose Ramirez"]);
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
    await user.type(supply, "Dunn");
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
          paintSupplyCo: "Dunn",
          search: "JOSE",
          fromDate: "2026-01-01",
          toDate: "2026-01-31",
        })
      );
    });
    const reportBody = await screen.findByText(/Jose Ramirez/);
    expect(reportBody).toBeInTheDocument();
    expect(reportBody.textContent).toContain("Dunn-Edwards");
    expect(reportBody.textContent).toContain("Mat_Cost");
    expect(reportBody.textContent).toContain("Inv_Total");
    expect(reportBody.textContent).toContain("Work Date");
  });

  it("formats paint usage columns", () => {
    const text = formatPaintUsage([
      {
        workPerson: "Jose Ramirez",
        materialCost: 40,
        invoice: 12,
        invoiceTotal: 250,
        paintSupplyCo: "Dunn-Edwards",
        workDate: "2026-01-20",
      },
    ]);
    expect(text).toContain("Jose Ramirez");
    expect(text).toContain("40.00");
    expect(text).toContain("12");
    expect(text).toContain("250.00");
    expect(text).toContain("Dunn-Edwards");
    expect(text).toContain("01/20/2026");
  });
});

describe("ReportsScreen payroll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listWorkPersons).mockResolvedValue(["Jose Ramirez"]);
    vi.mocked(api.reportPayroll).mockResolvedValue([
      {
        salesDate: "2026-01-15",
        invoice: 12,
        invoiceTotal: 250,
        materialCost: 40,
        propertyAddress: "1105 QUAIL ST.",
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
        street: "1105 QUAIL ST.",
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

    await user.type(await screen.findByLabelText("Work person search"), "Jose");
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
          search: "Jose",
          fromDate: "2026-01-01",
          toDate: "2026-01-31",
        })
      );
    });
    expect(await screen.findByText(/1105 QUAIL ST/)).toBeInTheDocument();
    expect(screen.getByText(/Interior Paint \/ Wall Closet/)).toBeInTheDocument();
    expect(screen.getByText(/Mat_Cost/)).toBeInTheDocument();
    expect(screen.getByText(/Inv_Total/)).toBeInTheDocument();
    expect(document.querySelector(".payroll-landscape")).toBeInTheDocument();
    expect(document.querySelector(".payroll-grid")).toBeInTheDocument();
    expect(screen.getByLabelText("Blank column 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Blank column 2")).toBeInTheDocument();

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
    expect(await screen.findByText(/1105 QUAIL ST/)).toBeInTheDocument();
    expect(screen.getByText(/Interior Paint \/ Wall Closet/)).toBeInTheDocument();
    expect(screen.getAllByText("250.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("40.00").length).toBeGreaterThan(0);
    expect(screen.getByText("A1")).toBeInTheDocument();
    const header = screen.getByText("Address").closest("tr");
    const headerText = header?.textContent ?? "";
    expect(headerText.indexOf("Address")).toBeLessThan(
      headerText.indexOf("Inv_Total")
    );
    expect(headerText.indexOf("Inv_Total")).toBeLessThan(
      headerText.indexOf("Mat_Cost")
    );
  });
});
