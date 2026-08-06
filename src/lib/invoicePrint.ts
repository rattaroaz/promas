/**
 * Print invoices on US Letter paper (8.5" × 11" = 612 × 792 pt).
 *
 * Uses invoice_template.pdf for the header branding (logo / company /
 * invoice boxes), then redraws the body for letter height:
 *  - No JOB #
 *  - COMPANY INFORMATION / SERVICE ADDRESS
 *  - Description table extended nearly to the bottom
 *  - Subtotal bar at the bottom of the letter page
 */
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from "pdf-lib";
import type { Company, Property, Invoice, InvoiceLine } from "../api";
import { fmtDate, money } from "../api";

export interface InvoicePrintPayload {
  company: Company;
  property: Property;
  invoice: Invoice;
  lines: InvoiceLine[];
}

/** US Letter */
const PAGE_W = 612;
const PAGE_H = 792; // 11 inches
/** Original template height (drawn at top of letter page) */
const TPL_H = 495;

/** Top-origin → PDF y (bottom origin) on the letter page. */
function yTop(top: number, fontSize = 9): number {
  return PAGE_H - top - fontSize * 0.8;
}

function clip(s: string, max: number): string {
  const t = (s || "").trim();
  if (t.length <= max) return t;
  return t.slice(0, Math.max(0, max - 1)) + "…";
}

function moneyPlain(n: number): string {
  return money(n).replace("$", "");
}

function draw(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  top: number,
  size = 9,
  options?: { maxWidth?: number; align?: "left" | "right" | "center" }
) {
  if (!text) return;
  let t = text;
  const maxW = options?.maxWidth;
  if (maxW) {
    while (t.length > 1 && font.widthOfTextAtSize(t, size) > maxW) {
      t = t.slice(0, -1);
    }
  }
  let drawX = x;
  const w = font.widthOfTextAtSize(t, size);
  if (options?.align === "right" && maxW) drawX = x + maxW - w;
  if (options?.align === "center" && maxW) drawX = x + (maxW - w) / 2;
  page.drawText(t, {
    x: drawX,
    y: yTop(top, size),
    size,
    font,
    color: rgb(0, 0, 0),
  });
}

function whiteOut(
  page: PDFPage,
  x: number,
  top: number,
  width: number,
  height: number
) {
  page.drawRectangle({
    x,
    y: PAGE_H - top - height,
    width,
    height,
    color: rgb(1, 1, 1),
    borderWidth: 0,
  });
}

function strokeRect(
  page: PDFPage,
  x: number,
  top: number,
  width: number,
  height: number,
  border = 0.8
) {
  page.drawRectangle({
    x,
    y: PAGE_H - top - height,
    width,
    height,
    borderColor: rgb(0, 0, 0),
    borderWidth: border,
  });
}

function fillRect(
  page: PDFPage,
  x: number,
  top: number,
  width: number,
  height: number,
  color: ReturnType<typeof rgb>
) {
  page.drawRectangle({
    x,
    y: PAGE_H - top - height,
    width,
    height,
    color,
    borderWidth: 0,
  });
}

export async function buildInvoicePdf(
  data: InvoicePrintPayload
): Promise<Uint8Array> {
  const res = await fetch("/invoice_template.pdf");
  if (!res.ok) {
    throw new Error(
      `Could not load invoice_template.pdf (${res.status}). Place it in the app public folder.`
    );
  }
  const templateBytes = await res.arrayBuffer();

  // Letter-size document; stamp original template at the top
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  const src = await PDFDocument.load(templateBytes);
  const [tplEmbedded] = await pdfDoc.embedPdf(src, [0]);
  page.drawPage(tplEmbedded, {
    x: 0,
    y: PAGE_H - TPL_H, // pin template to top of letter page
    width: PAGE_W,
    height: TPL_H,
  });

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const { company, property, invoice, lines } = data;

  // ── Cover template regions we replace ─────────────────────────────
  // JOB # (remove entirely)
  whiteOut(page, 20, 105, 230, 22);
  // Old labels
  whiteOut(page, 20, 118, 250, 14);
  whiteOut(page, 300, 118, 250, 14);
  // Everything from description header through bottom of letter page
  // (template body + blank letter remainder)
  whiteOut(page, 14, 208, PAGE_W - 28, PAGE_H - 208 - 4);

  // ── Header box values (on template cells at top) ──────────────────
  draw(page, fontBold, String(invoice.invoice || ""), 385, 68, 11, {
    maxWidth: 90,
    align: "center",
  });
  draw(
    page,
    font,
    clip(invoice.salesTerm || "Net  7 Days", 18),
    492,
    68,
    9,
    { maxWidth: 90, align: "center" }
  );
  draw(page, font, fmtDate(invoice.salesDate), 385, 108, 10, {
    maxWidth: 90,
    align: "center",
  });
  draw(page, font, fmtDate(invoice.salesDue), 492, 108, 10, {
    maxWidth: 90,
    align: "center",
  });

  // ── Section labels ────────────────────────────────────────────────
  draw(page, fontBold, "COMPANY INFORMATION", 25, 123, 8);
  draw(page, fontBold, "SERVICE ADDRESS", 310, 123, 8);

  const companyLines = [
    company.name,
    company.street,
    [company.city, company.state, company.zip].filter(Boolean).join(", "),
    company.phone,
    company.contact ? `Attn: ${company.contact}` : "",
  ].filter(Boolean);
  companyLines.forEach((line, i) => {
    draw(page, font, clip(line, 42), 28, 138 + i * 15, 9, { maxWidth: 210 });
  });

  const serviceLines = [
    property.name,
    property.street,
    [property.city, property.state, property.zip].filter(Boolean).join(", "),
    property.phone,
    property.manager || property.contact
      ? `Contact: ${property.manager || property.contact}`
      : "",
  ].filter(Boolean);
  serviceLines.forEach((line, i) => {
    draw(page, font, clip(line, 42), 314, 138 + i * 15, 9, { maxWidth: 210 });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Description table fills letter page; totals at true bottom
  // ═══════════════════════════════════════════════════════════════════
  const left = 18;
  const right = 594;
  const tableW = right - left;
  const colDesc = { x: left, w: 290 };
  const colQty = { x: 308, w: 75 };
  const colPrice = { x: 383, w: 75 };
  const colAmt = { x: 458, w: right - 458 };

  const marginBottom = 36; // ~0.5" from physical bottom of letter sheet
  const totalsHeaderH = 16;
  const totalsValueH = 18;
  const totalsBlockH = totalsHeaderH + totalsValueH;
  const gapAboveTotals = 14; // one-row space between table and subtotal
  const tableHeaderH = 16;
  const rowH = 14;

  // Totals sit at the bottom of the 11" page
  const totalsTop = PAGE_H - marginBottom - totalsBlockH;
  const tableBottom = totalsTop - gapAboveTotals;
  const tableHeaderTop = 210;
  const firstRowTop = tableHeaderTop + tableHeaderH;
  const availableForRows = tableBottom - firstRowTop;
  const maxRows = Math.max(12, Math.floor(availableForRows / rowH));

  // Table header
  fillRect(page, left, tableHeaderTop, tableW, tableHeaderH, rgb(0.15, 0.15, 0.15));
  const drawHdr = (
    text: string,
    x: number,
    w: number,
    align: "left" | "center" = "left"
  ) => {
    const size = 8;
    let dx = x + 4;
    const tw = fontBold.widthOfTextAtSize(text, size);
    if (align === "center") dx = x + (w - tw) / 2;
    page.drawText(text, {
      x: dx,
      y: yTop(tableHeaderTop + 4, size),
      size,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
  };
  drawHdr("DESCRIPTION", colDesc.x, colDesc.w);
  drawHdr("HOURS / QTY", colQty.x, colQty.w, "center");
  drawHdr("PRICE", colPrice.x, colPrice.w, "center");
  drawHdr("AMOUNT", colAmt.x, colAmt.w, "center");

  const tableHeight = tableHeaderH + maxRows * rowH;
  strokeRect(page, left, tableHeaderTop, tableW, tableHeight, 1);

  for (const x of [colQty.x, colPrice.x, colAmt.x]) {
    page.drawLine({
      start: { x, y: PAGE_H - tableHeaderTop - tableHeight },
      end: { x, y: PAGE_H - tableHeaderTop },
      thickness: 0.6,
      color: rgb(0, 0, 0),
    });
  }
  for (let i = 1; i <= maxRows; i++) {
    const y = PAGE_H - (firstRowTop + i * rowH);
    page.drawLine({
      start: { x: left, y },
      end: { x: right, y },
      thickness: 0.5,
      color: rgb(0.4, 0.4, 0.4),
    });
  }
  {
    const y = PAGE_H - firstRowTop;
    page.drawLine({
      start: { x: left, y },
      end: { x: right, y },
      thickness: 0.8,
      color: rgb(0, 0, 0),
    });
  }

  // Row 0 — unit / size
  const row0Top = firstRowTop + 3;
  draw(page, font, "APT UNIT # :", 24, row0Top, 8);
  draw(page, font, clip(invoice.salesUnit || "", 12), 78, row0Top, 9, {
    maxWidth: 50,
  });
  draw(page, font, "SIZE :", 140, row0Top, 8);
  draw(page, font, clip(invoice.salesSize || "", 14), 170, row0Top, 9, {
    maxWidth: 80,
  });

  const itemLines = lines.filter(
    (l) => (l.description || "").trim() || l.price
  );
  let row = 1;
  for (const line of itemLines) {
    if (row >= maxRows) break;
    const top = firstRowTop + row * rowH + 3;
    draw(page, font, clip(line.description || "", 58), 24, top, 8, {
      maxWidth: colDesc.w - 12,
    });
    if (line.price) {
      draw(page, font, "1", colQty.x + 4, top, 8, {
        maxWidth: colQty.w - 8,
        align: "center",
      });
      draw(page, font, moneyPlain(line.price), colPrice.x + 4, top, 8, {
        maxWidth: colPrice.w - 10,
        align: "right",
      });
      draw(page, font, moneyPlain(line.price), colAmt.x + 4, top, 8, {
        maxWidth: colAmt.w - 10,
        align: "right",
      });
    }
    row++;
  }
  if (invoice.remark1 && row < maxRows) {
    draw(
      page,
      font,
      clip(invoice.remark1, 58),
      24,
      firstRowTop + row * rowH + 3,
      8,
      { maxWidth: colDesc.w - 12 }
    );
  }

  // ── Totals at bottom of 11" letter page ───────────────────────────
  const footCols = [
    { label: "SUBTOTAL", x: left, w: 85 },
    { label: "SALES TAX", x: left + 85, w: 70 },
    { label: "TOTAL", x: left + 155, w: 80 },
    { label: "PAYMENT REF. NO.", x: left + 235, w: 100 },
    { label: "AMOUNT PAID", x: left + 335, w: 85 },
    { label: "NET TO PAY", x: left + 420, w: tableW - 420 },
  ];

  fillRect(page, left, totalsTop, tableW, totalsHeaderH, rgb(0.15, 0.15, 0.15));
  for (const c of footCols) {
    const size = 7;
    const tw = fontBold.widthOfTextAtSize(c.label, size);
    page.drawText(c.label, {
      x: c.x + (c.w - tw) / 2,
      y: yTop(totalsTop + 4, size),
      size,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
  }

  const valueTop = totalsTop + totalsHeaderH;
  strokeRect(page, left, totalsTop, tableW, totalsBlockH, 1);
  for (const c of footCols.slice(1)) {
    page.drawLine({
      start: { x: c.x, y: PAGE_H - totalsTop - totalsBlockH },
      end: { x: c.x, y: PAGE_H - totalsTop },
      thickness: 0.6,
      color: rgb(0, 0, 0),
    });
  }
  {
    const y = PAGE_H - valueTop;
    page.drawLine({
      start: { x: left, y },
      end: { x: right, y },
      thickness: 0.6,
      color: rgb(0, 0, 0),
    });
  }

  const subtotal =
    invoice.salesTotal ||
    itemLines.reduce((s, l) => s + (l.price || 0), 0);
  const tax = 0;
  const total = subtotal + tax;
  const amountPaid = (invoice.payTotal || 0) + (invoice.salesPay || 0);
  const netToPay =
    invoice.balance != null ? invoice.balance : total - amountPaid;
  const payRef = invoice.depositRef || "";
  const valTop = valueTop + 5;

  draw(page, font, moneyPlain(subtotal), footCols[0].x + 4, valTop, 9, {
    maxWidth: footCols[0].w - 8,
    align: "right",
  });
  draw(page, font, moneyPlain(tax), footCols[1].x + 4, valTop, 9, {
    maxWidth: footCols[1].w - 8,
    align: "right",
  });
  draw(page, fontBold, moneyPlain(total), footCols[2].x + 4, valTop, 9, {
    maxWidth: footCols[2].w - 8,
    align: "right",
  });
  draw(page, font, clip(payRef, 16), footCols[3].x + 4, valTop, 8, {
    maxWidth: footCols[3].w - 8,
    align: "center",
  });
  draw(page, font, moneyPlain(amountPaid), footCols[4].x + 4, valTop, 9, {
    maxWidth: footCols[4].w - 8,
    align: "right",
  });
  draw(page, fontBold, moneyPlain(netToPay), footCols[5].x + 4, valTop, 9, {
    maxWidth: footCols[5].w - 8,
    align: "right",
  });

  if (invoice.voided) {
    page.drawText("*** V O I D  I N V O I C E ***", {
      x: 160,
      y: yTop(tableHeaderTop - 18, 14),
      size: 14,
      font: fontBold,
      color: rgb(0.7, 0, 0),
    });
  }

  return pdfDoc.save();
}

export async function printInvoiceOnTemplate(
  data: InvoicePrintPayload
): Promise<void> {
  const bytes = await buildInvoicePdf(data);
  const blob = new Blob([bytes.buffer as ArrayBuffer], {
    type: "application/pdf",
  });
  const url = URL.createObjectURL(blob);

  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (win) {
    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch {
        /* manual */
      }
    }, 600);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.src = url;
  document.body.appendChild(iframe);
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      setTimeout(() => {
        document.body.removeChild(iframe);
        URL.revokeObjectURL(url);
      }, 60_000);
    }
  };
}

export async function downloadInvoicePdf(
  data: InvoicePrintPayload,
  filename?: string
): Promise<void> {
  const bytes = await buildInvoicePdf(data);
  const blob = new Blob([bytes.buffer as ArrayBuffer], {
    type: "application/pdf",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    filename ||
    `Invoice_${data.invoice.invoice || "draft"}_${data.company.companyNo}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
