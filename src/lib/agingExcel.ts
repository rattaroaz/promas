import type { AgingRow, Invoice } from "../api";
import { fmtDate, today } from "../dos/utils";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function strCell(value: string, style?: string): string {
  const styleAttr = style ? ` ss:StyleID="${style}"` : "";
  return `<Cell${styleAttr}><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
}

function numCell(value: number, style = "currency"): string {
  return `<Cell ss:StyleID="${style}"><Data ss:Type="Number">${Number(value.toFixed(2))}</Data></Cell>`;
}

function headerRow(labels: string[]): string {
  return `<Row>${labels.map((l) => strCell(l, "header")).join("")}</Row>`;
}

function invoiceAddress(inv: Invoice): string {
  return (inv.propertyStreet || inv.propertyName || "").trim();
}

function workbook(sheetName: string, table: string): string {
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="header"><Font ss:Bold="1"/></Style>
  <Style ss:ID="currency"><NumberFormat ss:Format="#,##0.00"/></Style>
  <Style ss:ID="integer"><NumberFormat ss:Format="0"/></Style>
 </Styles>
 <Worksheet ss:Name="${escapeXml(sheetName)}">
  <Table>
${table}
  </Table>
 </Worksheet>
</Workbook>
`;
}

export function agingExcelFileName(asOf = today()): string {
  return `OpenReceivableAging-${asOf}.xls`;
}

export function outstandingExcelFileName(
  companyNo: string,
  asOf = today()
): string {
  return `OutstandingInvoices-${companyNo}-${asOf}.xls`;
}

/** Company aging buckets currently on the aging list. */
export function buildAgingSummaryWorkbook(
  rows: AgingRow[],
  asOf = today()
): string {
  let current = 0,
    d30 = 0,
    d60 = 0,
    d90 = 0,
    d120 = 0,
    open = 0;
  const body = rows.map((r) => {
    current += r.current;
    d30 += r.days30;
    d60 += r.days60;
    d90 += r.days90;
    d120 += r.days120;
    open += r.openBal;
    return `<Row>${strCell(r.companyNo)}${strCell(r.companyName)}${strCell(r.contact ?? "")}${strCell(r.phone ?? "")}${numCell(r.current)}${numCell(r.days30)}${numCell(r.days60)}${numCell(r.days90)}${numCell(r.days120)}${numCell(r.openBal)}</Row>`;
  });
  body.push(
    `<Row>${strCell("Grand Total", "header")}${strCell("")}${strCell("")}${strCell("")}${numCell(current)}${numCell(d30)}${numCell(d60)}${numCell(d90)}${numCell(d120)}${numCell(open)}</Row>`
  );
  const table = `   <Row>${strCell("Open Receivable Aging", "header")}</Row>
   <Row>${strCell(`Date : ${fmtDate(asOf)}`)}</Row>
   <Row></Row>
   ${headerRow(["Company#", "Company Name", "Contact", "Phone", "Current", ">30", ">60", ">90", ">120", "Open Bal"])}
   ${body.join("\n   ")}`;
  return workbook("Aging", table);
}

/** Outstanding invoice list currently shown for one company. */
export function buildOutstandingInvoicesWorkbook(
  company: AgingRow,
  invoices: Invoice[],
  asOf = today()
): string {
  const body = invoices.map(
    (inv) =>
      `<Row>${numCell(inv.invoice, "integer")}${strCell(fmtDate(inv.salesDate))}${numCell(inv.salesTotal)}${strCell(invoiceAddress(inv))}${strCell(inv.salesUnit ?? "")}${strCell(inv.custPoNo ?? "")}</Row>`
  );
  const table = `   <Row>${strCell("Outstanding Invoices", "header")}</Row>
   <Row>${strCell(`Company NO : ${company.companyNo}  ${company.companyName}`)}</Row>
   <Row>${strCell(`Open Balance.... ${company.openBal.toFixed(2)}`)}</Row>
   <Row>${strCell(`Date : ${fmtDate(asOf)}`)}</Row>
   <Row></Row>
   ${headerRow(["Invoice#", "Invoice Date", "Invoice Amount", "Address", "Unit", "PO Number"])}
   ${body.join("\n   ")}`;
  return workbook("Outstanding", table);
}
