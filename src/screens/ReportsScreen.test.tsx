import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderApp, screen, userEvent, waitFor } from "../test/render";
import {
  ReportsScreen,
  agingSearchQuery,
  formatAgingInvoiceRow,
} from "./ReportsScreen";
import { api, emptyInvoice } from "../api";
import { save } from "@tauri-apps/plugin-dialog";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(),
}));

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    api: {
      ...actual.api,
      reportAging: vi.fn(),
      listCashReceipts: vi.fn(),
      listInvoices: vi.fn(),
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
