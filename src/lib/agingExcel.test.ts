import { describe, expect, it } from "vitest";
import { emptyInvoice } from "../api";
import {
  agingExcelFileName,
  buildAgingSummaryWorkbook,
  buildOutstandingInvoicesWorkbook,
  outstandingExcelFileName,
} from "./agingExcel";

const company = {
  companyNo: "1000",
  companyName: "ACME & Co",
  contact: "ELAINE",
  phone: "555-0100",
  current: 100,
  days30: 25,
  days60: 0,
  days90: 0,
  days120: 0,
  openBal: 125,
};

describe("aging Excel workbook", () => {
  it("names files from the current page", () => {
    expect(agingExcelFileName("2026-09-05")).toBe(
      "OpenReceivableAging-2026-09-05.xls"
    );
    expect(outstandingExcelFileName("1000", "2026-09-05")).toBe(
      "OutstandingInvoices-1000-2026-09-05.xls"
    );
  });

  it("exports only the aging list columns", () => {
    const xml = buildAgingSummaryWorkbook([company], "2026-09-05");
    expect(xml).toContain('ss:Name="Aging"');
    expect(xml).not.toContain('ss:Name="Outstanding"');
    expect(xml).toContain("ACME &amp; Co");
    expect(xml).toContain("Grand Total");
    expect(xml).toContain("&gt;30");
    expect(xml).not.toContain("Invoice Amount");
    expect(xml).not.toContain("PO Number");
  });

  it("exports only the outstanding invoice columns on screen", () => {
    const xml = buildOutstandingInvoicesWorkbook(
      company,
      [
        {
          ...emptyInvoice(),
          companyNo: "1000",
          invoice: 9,
          salesDate: "2026-01-15",
          salesTotal: 125,
          salesUnit: "A1",
          custPoNo: "PO-77",
          propertyStreet: "1105 QUAIL ST.",
          balance: 125,
        },
      ],
      "2026-09-05"
    );
    expect(xml).toContain('ss:Name="Outstanding"');
    expect(xml).not.toContain('ss:Name="Aging"');
    expect(xml).toContain("Company NO : 1000  ACME &amp; Co");
    expect(xml).toContain("Invoice Amount");
    expect(xml).toContain("1105 QUAIL ST.");
    expect(xml).toContain("PO-77");
    expect(xml).toContain("01/15/2026");
    expect(xml).not.toContain("Grand Total");
    expect(xml).not.toContain(">120");
  });
});
