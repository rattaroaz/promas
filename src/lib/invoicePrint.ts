/**
 * Print invoices on US Letter paper (8.5" × 11" = 612 × 792 pt).
 *
 * Uses invoice_template.pdf for the header branding (logo / company /
 * invoice boxes), then redraws the body for letter height:
 *  - No JOB #
 *  - COMPANY INFORMATION / SERVICE ADDRESS
 *  - Description table extended nearly to the bottom
 *  - Subtotal bar at the bottom of the last page. Lines that do not fit
 *    continue on another page with the same header.
 */
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from "pdf-lib";
import type { Company, Property, Invoice, InvoiceLine } from "../api";

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

/** Description type on the printed form (header and rows). */
export const PRINT_DESC_SIZE = 11;

/** Five spaces. Continuation lines only; the first line is not indented. */
export const PRINT_DESC_INDENT = "     ";

/** Description text origin (pt). The amount rule is the right column line. */
export const PRINT_DESC_X = 24;
export const PRINT_AMOUNT_X = 458;

/** Apt/Unit and Size are the first body row, directly under DESCRIPTION. */
export const PRINT_UNIT_ROW = 0;
/** One blank spacer row, then the description lines. */
export const PRINT_SPACER_ROWS_AFTER_UNIT = 1;
export const PRINT_DESC_START_ROW = PRINT_UNIT_ROW + 1 + PRINT_SPACER_ROWS_AFTER_UNIT;

/**
 * Width that ends two spaces before the amount column line. A word that does
 * not fit is moved whole, so a line may stop further left than this. A word
 * wider than the line is hard-broken at this limit.
 */
export function descriptionWrapWidth(
  font: PDFFont,
  size = PRINT_DESC_SIZE
): number {
  return PRINT_AMOUNT_X - PRINT_DESC_X - font.widthOfTextAtSize("  ", size);
}

/**
 * Wrap a description. The first line uses the full column. Later lines are
 * indented 5 spaces and wrapped to the remaining width. A word that fits is
 * moved whole. A word wider than the line is hard-broken at the limit.
 */
export function wrapDescription(
  font: PDFFont,
  text: string,
  size: number,
  maxWidth: number,
  indent = PRINT_DESC_INDENT
): string[] {
  const indentW = font.widthOfTextAtSize(indent, size);
  const contMax = Math.max(1, maxWidth - indentW);
  const source = (text ?? "").replace(/\r\n/g, "\n");
  if (!source) return [""];

  const result: string[] = [];
  let continuation = false;
  const limit = () => (continuation ? contMax : maxWidth);
  const push = (line: string) => {
    result.push(continuation ? indent + line : line);
    continuation = true;
  };

  for (const paragraph of source.split("\n")) {
    if (!paragraph) {
      result.push("");
      continuation = true;
      continue;
    }
    let current = "";
    const flush = () => {
      if (!current) return;
      push(current);
      current = "";
    };
    for (const word of paragraph.split(" ")) {
      const next = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= limit()) {
        current = next;
        continue;
      }
      if (current) flush();
      if (font.widthOfTextAtSize(word, size) <= limit()) {
        current = word;
        continue;
      }
      // Wider than this line: hard-break at the width limit. Continuation
      // pieces use the indented limit. A word that fits is never split.
      let rest = word;
      while (rest) {
        const lim = limit();
        if (font.widthOfTextAtSize(rest, size) <= lim) {
          current = rest;
          break;
        }
        let cut = 1;
        while (
          cut < rest.length &&
          font.widthOfTextAtSize(rest.slice(0, cut + 1), size) <= lim
        ) {
          cut += 1;
        }
        push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
    }
    if (current) flush();
  }
  return result.length ? result : [""];
}

const AMOUNT_FORMAT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Amounts on the form have no currency sign: 1,234.50 and -5.00. */
function invoiceAmount(n: number): string {
  return AMOUNT_FORMAT.format(n);
}

/** Dates on the form are MM/DD/YYYY; a missing date prints blank. */
function invoiceDate(d: string | null | undefined): string {
  if (!d) return "";
  if (d.length === 10 && d.includes("-")) {
    const [y, m, day] = d.split("-");
    return `${m}/${day}/${y}`;
  }
  return d;
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

/** One row of the description table. */
type BodyRow =
  | { kind: "line"; text: string; price: number }
  | { kind: "remark"; text: string };

/**
 * Fill pages of `perPage` rows in order. A group (one item's wrapped lines)
 * that does not fit in the rest of a page starts the next page. A group longer
 * than a whole page continues across pages.
 */
export function paginateRows<T>(groups: T[][], perPage: number): T[][] {
  const pages: T[][] = [[]];
  for (const group of groups) {
    let page = pages[pages.length - 1];
    if (page.length > 0 && page.length + group.length > perPage && group.length <= perPage) {
      page = [];
      pages.push(page);
    }
    for (const row of group) {
      if (page.length >= perPage) {
        page = [];
        pages.push(page);
      }
      page.push(row);
    }
  }
  return pages;
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

  const pdfDoc = await PDFDocument.create();
  const src = await PDFDocument.load(templateBytes);
  const [tplEmbedded] = await pdfDoc.embedPdf(src, [0]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const { company, property, invoice, lines } = data;

  // ── Company / service address block ───────────────────────────────
  // Redraw the whole block (template rules were misaligned with text).
  // Layout: label, then 5 rows of text each sitting just above its rule.
  const left = 18;
  const right = 594;
  const ADDR_LABEL_TOP = 118;
  const ADDR_FIRST_RULE = 138;
  const ADDR_LINE_H = 14;
  const ADDR_RULE_COUNT = 5;
  const ADDR_COLS = [
    { label: "COMPANY INFORMATION", x: 25, textX: 28, ruleX: 25, ruleW: 250 },
    { label: "SERVICE ADDRESS", x: 310, textX: 314, ruleX: 310, ruleW: 250 },
  ] as const;

  const companyLines = [
    company.name,
    company.street,
    [company.city, company.state, company.zip].filter(Boolean).join(", "),
    company.phone,
    company.contact ? `Attn: ${company.contact}` : "",
  ].filter(Boolean);
  const serviceLines = [
    property.name,
    property.street,
    [property.city, property.state, property.zip].filter(Boolean).join(", "),
    property.phone,
    property.manager || property.contact
      ? `Contact: ${property.manager || property.contact}`
      : "",
  ].filter(Boolean);

  // Text baseline ~2pt above each rule (top-origin: ruleTop − font ≈ text top)
  const addrTextTop = (ruleIndex: number, size = 9) =>
    ADDR_FIRST_RULE + ruleIndex * ADDR_LINE_H - size - 1;

  // ═══════════════════════════════════════════════════════════════════
  // Description table fills letter page; totals at true bottom
  // ═══════════════════════════════════════════════════════════════════
  // Start table just below the last address rule
  const tableHeaderTop =
    ADDR_FIRST_RULE + ADDR_RULE_COUNT * ADDR_LINE_H + 8; // ~216
  const tableW = right - left;

  const marginBottom = 36; // ~0.5" from physical bottom of letter sheet
  const totalsHeaderH = 16;
  const totalsValueH = 18;
  const totalsBlockH = totalsHeaderH + totalsValueH;
  const gapAboveTotals = 14; // one-row space between table and subtotal
  const tableHeaderH = 20;
  const rowH = 16;

  // Hours/Qty and Price are not printed. Amount stays; totals are computed
  // from the invoice record below, not from these columns.
  const colAmt = { x: PRINT_AMOUNT_X, w: right - PRINT_AMOUNT_X };
  const colDesc = { x: left, w: colAmt.x - left };

  // Totals sit at the bottom of the 11" page
  const totalsTop = PAGE_H - marginBottom - totalsBlockH;
  const tableBottom = totalsTop - gapAboveTotals;
  const firstRowTop = tableHeaderTop + tableHeaderH;
  const availableForRows = tableBottom - firstRowTop;
  const maxRows = Math.max(12, Math.floor(availableForRows / rowH));

  /** Template, header boxes, addresses, and the empty table. Every page has them. */
  const drawFrame = (page: PDFPage) => {
    // Letter-size page; stamp original template at the top
    page.drawPage(tplEmbedded, {
      x: 0,
      y: PAGE_H - TPL_H, // pin template to top of letter page
      width: PAGE_W,
      height: TPL_H,
    });

    // ── Cover template regions we replace ───────────────────────────
    // Left: JOB # + bill-to rules (do not touch invoice header boxes on right)
    whiteOut(page, 14, 100, 290, 108);
    // Right: job-site / service rules only (below DATE/DUE DATE boxes)
    whiteOut(page, 300, 122, 280, 86);
    // Everything from description header through bottom of letter page
    whiteOut(page, 14, 208, PAGE_W - 28, PAGE_H - 208 - 4);

    // ── Header box values (on template cells at top) ────────────────
    draw(page, font, String(invoice.invoice || ""), 385, 68, 11, {
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
    draw(page, font, invoiceDate(invoice.salesDate), 385, 102, 10, {
      maxWidth: 90,
      align: "center",
    });
    draw(page, font, invoiceDate(invoice.salesDue), 492, 102, 10, {
      maxWidth: 90,
      align: "center",
    });

    for (const col of ADDR_COLS) {
      draw(page, font, col.label, col.x, ADDR_LABEL_TOP, 8);
      for (let i = 0; i < ADDR_RULE_COUNT; i++) {
        const ruleTop = ADDR_FIRST_RULE + i * ADDR_LINE_H;
        page.drawLine({
          start: { x: col.ruleX, y: PAGE_H - ruleTop },
          end: { x: col.ruleX + col.ruleW, y: PAGE_H - ruleTop },
          thickness: 0.6,
          color: rgb(0, 0, 0),
        });
      }
    }
    companyLines.forEach((line, i) => {
      if (i >= ADDR_RULE_COUNT) return;
      draw(page, font, clip(line, 42), 28, addrTextTop(i), 9, { maxWidth: 210 });
    });
    serviceLines.forEach((line, i) => {
      if (i >= ADDR_RULE_COUNT) return;
      draw(page, font, clip(line, 42), 314, addrTextTop(i), 9, {
        maxWidth: 210,
      });
    });

    // Table header
    fillRect(page, left, tableHeaderTop, tableW, tableHeaderH, rgb(0.15, 0.15, 0.15));
    const drawHdr = (
      text: string,
      x: number,
      w: number,
      size: number,
      align: "left" | "center" = "left"
    ) => {
      let dx = x + 4;
      const tw = font.widthOfTextAtSize(text, size);
      if (align === "center") dx = x + (w - tw) / 2;
      page.drawText(text, {
        x: dx,
        y: yTop(tableHeaderTop + Math.max(3, (tableHeaderH - size) / 2), size),
        size,
        font,
        color: rgb(1, 1, 1),
      });
    };
    drawHdr("DESCRIPTION", colDesc.x, colDesc.w, PRINT_DESC_SIZE);
    drawHdr("AMOUNT", colAmt.x, colAmt.w, 8, "center");

    const tableHeight = tableHeaderH + maxRows * rowH;
    strokeRect(page, left, tableHeaderTop, tableW, tableHeight, 1);

    page.drawLine({
      start: { x: colAmt.x, y: PAGE_H - tableHeaderTop - tableHeight },
      end: { x: colAmt.x, y: PAGE_H - tableHeaderTop },
      thickness: 0.6,
      color: rgb(0, 0, 0),
    });
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

    // Apt/Unit and Size sit on the row directly under DESCRIPTION.
    // One blank spacer row follows, then the description lines.
    const row0Top = firstRowTop + PRINT_UNIT_ROW * rowH + 3;
    draw(page, font, "APT UNIT # :", PRINT_DESC_X, row0Top, 8);
    draw(page, font, clip(invoice.salesUnit || "", 12), 78, row0Top, 9, {
      maxWidth: 50,
    });
    draw(page, font, "SIZE :", 140, row0Top, 8);
    draw(page, font, clip(invoice.salesSize || "", 14), 170, row0Top, 9, {
      maxWidth: 80,
    });

    if (invoice.voided) {
      page.drawText("*** V O I D  I N V O I C E ***", {
        x: 160,
        y: yTop(tableHeaderTop - 18, 14),
        size: 14,
        font,
        color: rgb(0.7, 0, 0),
      });
    }
  };

  const drawRow = (page: PDFPage, row: BodyRow, index: number) => {
    if (row.kind === "remark") {
      draw(
        page,
        font,
        clip(row.text, 58),
        PRINT_DESC_X,
        firstRowTop + index * rowH + 3,
        8,
        { maxWidth: colDesc.w - 12 }
      );
      return;
    }
    const top = firstRowTop + index * rowH + 2;
    draw(page, font, row.text, PRINT_DESC_X, top, PRINT_DESC_SIZE);
    if (row.price) {
      draw(page, font, invoiceAmount(row.price), colAmt.x + 4, top, 9, {
        maxWidth: colAmt.w - 10,
        align: "right",
      });
    }
  };

  const itemLines = lines.filter(
    (l) => (l.description || "").trim() || l.price
  );

  // ── Totals at bottom of the last page ─────────────────────────────
  const drawTotals = (page: PDFPage) => {
    const footCols = [
      { label: "SUBTOTAL", x: left, w: 85 },
      { label: "SALES TAX", x: left + 85, w: 70 },
      { label: "TOTAL", x: left + 155, w: 80 },
      { label: "PO#/WO#", x: left + 235, w: 100 },
      { label: "AMOUNT PAID", x: left + 335, w: 85 },
      { label: "NET TO PAY", x: left + 420, w: tableW - 420 },
    ];

    fillRect(page, left, totalsTop, tableW, totalsHeaderH, rgb(0.15, 0.15, 0.15));
    for (const c of footCols) {
      const size = 7;
      const tw = font.widthOfTextAtSize(c.label, size);
      page.drawText(c.label, {
        x: c.x + (c.w - tw) / 2,
        y: yTop(totalsTop + 4, size),
        size,
        font,
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

    // Match DB model: total = Σ lines; paid = deposit + cash; net = balance
    const subtotal =
      invoice.salesTotal ||
      itemLines.reduce((s, l) => s + (l.price || 0), 0);
    const tax = 0;
    const total = subtotal + tax;
    const deposit = invoice.salesPay || 0;
    const cashPaid = invoice.payTotal || 0;
    const amountPaid = deposit + cashPaid;
    const netToPay =
      invoice.balance != null
        ? invoice.balance
        : Math.round((total - amountPaid) * 100) / 100;
    const payRef =
      (invoice.custPoNo || "").trim() ||
      (invoice.orderNo > 0 ? String(invoice.orderNo) : "");
    const valTop = valueTop + 5;

    draw(page, font, invoiceAmount(subtotal), footCols[0].x + 4, valTop, 9, {
      maxWidth: footCols[0].w - 8,
      align: "right",
    });
    draw(page, font, invoiceAmount(tax), footCols[1].x + 4, valTop, 9, {
      maxWidth: footCols[1].w - 8,
      align: "right",
    });
    draw(page, font, invoiceAmount(total), footCols[2].x + 4, valTop, 9, {
      maxWidth: footCols[2].w - 8,
      align: "right",
    });
    draw(page, font, clip(payRef, 16), footCols[3].x + 4, valTop, 8, {
      maxWidth: footCols[3].w - 8,
      align: "center",
    });
    draw(page, font, invoiceAmount(amountPaid), footCols[4].x + 4, valTop, 9, {
      maxWidth: footCols[4].w - 8,
      align: "right",
    });
    draw(page, font, invoiceAmount(netToPay), footCols[5].x + 4, valTop, 9, {
      maxWidth: footCols[5].w - 8,
      align: "right",
    });
  };

  const descWidth = descriptionWrapWidth(font, PRINT_DESC_SIZE);
  const groups: BodyRow[][] = itemLines.map((line) =>
    wrapDescription(font, line.description || "", PRINT_DESC_SIZE, descWidth).map(
      (text, i): BodyRow => ({ kind: "line", text, price: i === 0 ? line.price || 0 : 0 })
    )
  );
  if (invoice.remark1) groups.push([{ kind: "remark", text: invoice.remark1 }]);
  const pages = paginateRows(groups, maxRows - PRINT_DESC_START_ROW);

  pages.forEach((rows, index) => {
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    drawFrame(page);
    rows.forEach((row, i) => drawRow(page, row, PRINT_DESC_START_ROW + i));
    if (index === pages.length - 1) {
      drawTotals(page);
    } else {
      draw(page, font, "CONTINUED ON NEXT PAGE", left, totalsTop + 12, 9, {
        maxWidth: tableW,
        align: "center",
      });
    }
    if (pages.length > 1) {
      const label = `Page ${index + 1} of ${pages.length}`;
      draw(page, font, label, left, totalsTop + totalsBlockH + 6, 8, {
        maxWidth: tableW,
        align: "center",
      });
    }
  });

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
  const { openPrintPreview } = await import("../stores/printPreviewStore");
  openPrintPreview(url);
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
