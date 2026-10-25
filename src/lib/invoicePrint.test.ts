import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { inflateRawSync, inflateSync } from "node:zlib";
import { PDFDict, PDFDocument, PDFName, StandardFonts } from "pdf-lib";
import {
  buildInvoicePdf,
  downloadInvoicePdf,
  paginateRows,
  printInvoiceOnTemplate,
  wrapDescription,
  descriptionWrapWidth,
  PRINT_DESC_INDENT,
  PRINT_DESC_SIZE,
  PRINT_DESC_X,
  PRINT_AMOUNT_X,
  PRINT_UNIT_ROW,
  PRINT_DESC_START_ROW,
  type InvoicePrintPayload,
} from "./invoicePrint";
import type { Company, Property, Invoice, InvoiceLine } from "../api";
import { getPrintPreviewUrl } from "../stores/printPreviewStore";

const TEMPLATE = readFileSync(
  resolve(__dirname, "../../public/invoice_template.pdf")
);

/** Decode PDF hex string literals `<48656C6C6F>` → `Hello`. */
function decodePdfHexStrings(s: string): string {
  return s.replace(/<([0-9A-Fa-f\r\n\t ]+)>/g, (full, hex: string) => {
    const clean = hex.replace(/\s/g, "");
    if (!clean || clean.length % 2 !== 0) return full;
    let out = "";
    for (let i = 0; i < clean.length; i += 2) {
      out += String.fromCharCode(parseInt(clean.slice(i, i + 2), 16));
    }
    return out;
  });
}

/**
 * Inflate every compressed stream. Only the one end-of-line before `endstream`
 * is dropped: a compressed payload can itself end in a space or newline byte.
 */
function inflatedStreams(bytes: Uint8Array): string[] {
  const latin = Buffer.from(bytes).toString("latin1");
  const streams: string[] = [];
  const re = /stream\r?\n([\s\S]*?)endstream/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(latin))) {
    const payload = Buffer.from(m[1].replace(/\r?\n$|\r$/, ""), "latin1");
    for (const inflate of [inflateSync, inflateRawSync]) {
      try {
        streams.push(inflate(payload).toString("latin1"));
        break;
      } catch {
        /* try next */
      }
    }
  }
  return streams;
}

/** pdf-lib compresses content streams and hex-encodes drawText; recover plain text. */
function pdfReadableText(bytes: Uint8Array): string {
  const latin = Buffer.from(bytes).toString("latin1");
  return decodePdfHexStrings([latin, ...inflatedStreams(bytes)].join("\n"));
}

/** Text draws with their PDF baseline (larger y is higher on the page). */
function textPositions(bytes: Uint8Array): { text: string; x: number; y: number }[] {
  const streams = inflatedStreams(bytes);
  const out: { text: string; x: number; y: number }[] = [];
  const re =
    /1 0 0 1 ([0-9.]+) ([0-9.]+) Tm\s*(?:\(((?:\\.|[^)\\])*)\)|<([0-9A-Fa-f]+)>)\s*Tj/g;
  for (const stream of streams) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(stream))) {
      const text = m[4]
        ? decodePdfHexStrings(`<${m[4]}>`)
        : (m[3] ?? "").replace(/\\([()\\])/g, "$1");
      out.push({ text, x: Number(m[1]), y: Number(m[2]) });
    }
  }
  return out;
}

function payload(overrides?: Partial<InvoicePrintPayload>): InvoicePrintPayload {
  const company: Company = {
    companyNo: "1000",
    name: "OAKS MANAGEMENT COMPANY",
    class: "A",
    street: "1105 MAPLE ST.",
    city: "NEWPORT BEACH",
    state: "CA",
    zip: "92660",
    phone: "(714)555-0198",
    phone2: "",
    phone3: "",
    phone4: "",
    contact: "ELAINE",
    enterDate: null,
    pageMap: "",
    lastProId: 0,
    memo: "",
    voided: false,
  };
  const property: Property = {
    companyNo: "1000",
    proNo: "100",
    name: "WILLOWS APARTMENTS",
    class: "",
    street: "7841 SAMPLE BLVD.",
    city: "RESEDA",
    state: "CA",
    zip: "91335",
    phone: "(818)555-0130",
    phone2: "",
    contact: "",
    noOfUnit: 0,
    manager: "OFFICE",
    pageMap: "",
    keyInfo: "",
    paintTime: "",
    comment1: "",
    comment2: "",
    memo: "",
    voided: false,
  };
  const invoice: Invoice = {
    companyNo: "1000",
    proNo: "100",
    salesDate: "2020-01-15",
    invoice: 52629,
    orderNo: 99,
    orderDate: null,
    orderMan: "MGR",
    salesUnit: "208",
    salesSize: "1+1",
    salesTotal: 445,
    salesPay: 45,
    salesBal: 400,
    payTotal: 100,
    balance: 300,
    salesTerm: "Net  7 Days",
    salesDue: "2020-01-22",
    custPoNo: "PO9",
    discountOn: 0,
    discount: 0,
    depositRef: "DEP1",
    materialCost: 0,
    paintSupplyCo: "",
    remark1: "",
    remark2: "",
    status: "",
    voided: false,
  };
  const lines: InvoiceLine[] = [
    {
      companyNo: "1000",
      proNo: "100",
      salesDate: "2020-01-15",
      invoice: 52629,
      lineNo: 1,
      codeNo: "*",
      description: "INTERIOR PAINT WALLS",
      workDate: "2020-01-15",
      workType: "P",
      price: 270,
      empNo: "400",
      empPrice: 175.5,
      commission: 65,
      status: "",
    },
    {
      companyNo: "1000",
      proNo: "100",
      salesDate: "2020-01-15",
      invoice: 52629,
      lineNo: 2,
      codeNo: "*",
      description: "CEILING",
      workDate: "2020-01-15",
      workType: "P",
      price: 175,
      empNo: "400",
      empPrice: 113.75,
      commission: 65,
      status: "",
    },
  ];
  return {
    company,
    property,
    invoice,
    lines,
    ...overrides,
  };
}

function numberedLines(count: number): InvoiceLine[] {
  return Array.from({ length: count }, (_, i) => ({
    ...payload().lines[0],
    lineNo: i + 1,
    description: `LINE ITEM ${i + 1}`,
    price: 10,
  }));
}

/** Texts drawn on each page, in drawing order. */
async function pageTexts(bytes: Uint8Array): Promise<string[][]> {
  const doc = await PDFDocument.load(bytes);
  const pages: string[][] = [];
  for (let i = 0; i < doc.getPageCount(); i++) {
    const single = await PDFDocument.create();
    const [copy] = await single.copyPages(doc, [i]);
    single.addPage(copy);
    pages.push(textPositions(await single.save()).map((p) => p.text));
  }
  return pages;
}

function stubTemplateFetch() {
  // Copy into a standalone ArrayBuffer — Node Buffer.buffer may be a larger
  // shared pool and pdf-lib rejects detached / wrong-offset views.
  const templateAb = (): ArrayBuffer => {
    const copy = new Uint8Array(TEMPLATE.byteLength);
    copy.set(TEMPLATE);
    return copy.buffer;
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => templateAb(),
    }))
  );
}

describe("buildInvoicePdf", () => {
  beforeEach(() => {
    stubTemplateFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("produces a US Letter page (8.5 x 11 inches)", async () => {
    const bytes = await buildInvoicePdf(payload());
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const page = doc.getPages()[0];
    const { width, height } = page.getSize();
    expect(width).toBeCloseTo(612, 0);
    expect(height).toBeCloseTo(792, 0); // 11"
  });

  it("embeds invoice number and company text in content stream", async () => {
    const bytes = await buildInvoicePdf(payload());
    const asText = pdfReadableText(bytes);
    expect(asText).toContain("52629");
    expect(asText).toContain("COMPANY INFORMATION");
    expect(asText).toContain("SERVICE ADDRESS");
    expect(asText).toContain("SUBTOTAL");
    expect(asText).toContain("NET TO PAY");
    expect(asText).toContain("PO#/WO#");
    expect(asText).toContain("PO9");
    expect(asText).toContain("OAKS MANAGEMENT");
    expect(asText).toContain("WILLOWS APARTMENTS");
    expect(asText).toContain("INTERIOR PAINT");
    expect(asText).toContain("DESCRIPTION");
    expect(asText).toContain("AMOUNT");
    // Totals: 445 subtotal / 145 paid (45 deposit + 100 cash) / 300 net.
    // Hours/Qty and Price are no longer drawn; the template file still
    // embeds those words under the white-out, so totals are the check.
    expect(asText).toMatch(/445\.00|445/);
    expect(asText).toContain("SUBTOTAL");
    expect(asText).toContain("NET TO PAY");
  });

  it("prints the work order number when customer P.O. is empty", async () => {
    const bytes = await buildInvoicePdf(
      payload({
        invoice: { ...payload().invoice, custPoNo: "", orderNo: 88, depositRef: "DEP1" },
      })
    );
    const asText = pdfReadableText(bytes);
    expect(asText).toContain("PO#/WO#");
    expect(asText).toContain("88");
    expect(asText).not.toContain("DEP1");
  });

  it("rejects when template cannot be loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 404,
        arrayBuffer: async () => new ArrayBuffer(0),
      }))
    );
    await expect(buildInvoicePdf(payload())).rejects.toThrow(/invoice_template/);
  });

  it("marks void invoices in the PDF stream", async () => {
    const bytes = await buildInvoicePdf(
      payload({
        invoice: { ...payload().invoice, voided: true },
      })
    );
    const asText = pdfReadableText(bytes);
    expect(asText).toMatch(/V\s*O\s*I\s*D|VOID/i);
  });

  it("wraps a long description in full instead of clipping it", async () => {
    const description =
      "Paint the hallway closet doors and baseboards in this occupied unit today before noon";
    expect(description.length).toBeGreaterThan(62);
    const bytes = await buildInvoicePdf(
      payload({
        lines: [{ ...payload().lines[0], description, price: 220 }],
      })
    );
    const asText = pdfReadableText(bytes);
    expect(asText).toContain("Paint the hallway closet doors");
    expect(asText).toContain("before noon");
    expect(asText).not.toContain("before noon…");
    expect(asText).not.toContain(description.slice(0, 57) + "…");
  });

  it("indents only the wrapped continuation of a long description", async () => {
    const description =
      "Paint the hallway closet doors and baseboards in this occupied unit today before noon and again after the floor has dried completely across the whole room";
    const bytes = await buildInvoicePdf(
      payload({
        lines: [{ ...payload().lines[0], description, price: 220 }],
      })
    );
    const asText = pdfReadableText(bytes);
    const { StandardFonts, PDFDocument: Pdf } = await import("pdf-lib");
    const doc = await Pdf.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const descWidth = descriptionWrapWidth(font, PRINT_DESC_SIZE);
    const wrapped = wrapDescription(font, description, PRINT_DESC_SIZE, descWidth);
    expect(wrapped.length).toBeGreaterThan(1);
    expect(wrapped[0].startsWith(" ")).toBe(false);
    expect(wrapped[1].startsWith("     ")).toBe(true);
    expect(wrapped[1].slice(5, 6)).not.toBe(" ");
    expect(
      wrapped.map((line, i) => (i === 0 ? line : line.replace(/^ {5}/, ""))).join(" ")
    ).toBe(description);
    expect(asText).toContain(wrapped[0]);
    expect(asText).toContain(wrapped[1]);
    expect(asText).toContain("SUBTOTAL");
    expect(asText).toContain("220");
    expect(asText).toContain("NET TO PAY");
    const twoSpaces = font.widthOfTextAtSize("  ", PRINT_DESC_SIZE);
    expect(PRINT_AMOUNT_X - PRINT_DESC_X - descWidth).toBeCloseTo(twoSpaces, 5);
    expect(PRINT_UNIT_ROW).toBe(0);
    expect(PRINT_DESC_START_ROW).toBe(2);
    for (const line of wrapped) {
      const body = line.startsWith("     ") ? line.slice(5) : line;
      const limit = line.startsWith("     ")
        ? descWidth - font.widthOfTextAtSize("     ", PRINT_DESC_SIZE)
        : descWidth;
      if (body.includes(" ")) {
        expect(font.widthOfTextAtSize(body, PRINT_DESC_SIZE)).toBeLessThanOrEqual(
          limit + 0.01
        );
      }
    }
    const positions = textPositions(bytes);
    const unit = positions.find((p) => p.text === "APT UNIT # :");
    const firstDesc = positions.find((p) => p.text === wrapped[0]);
    expect(unit).toBeTruthy();
    expect(firstDesc).toBeTruthy();
    // Unit row, then one blank row (16pt), then the description.
    expect(unit!.y - firstDesc!.y).toBeGreaterThan(24);
    expect(unit!.y - firstDesc!.y).toBeLessThan(40);
  });

  it("moves a whole word to the next line instead of breaking it", async () => {
    const longWord = "Supercalifragilisticexpialidocious";
    const description = `Paint the hallway ${longWord} before the floor dries completely`;
    const { StandardFonts, PDFDocument: Pdf } = await import("pdf-lib");
    const doc = await Pdf.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const width = descriptionWrapWidth(font);
    const wrapped = wrapDescription(font, description, PRINT_DESC_SIZE, width);
    const rejoined = wrapped
      .map((line, i) => (i === 0 ? line : line.replace(/^ {5}/, "")))
      .join(" ");
    expect(rejoined).toBe(description);
    expect(wrapped.some((line) => line.includes(longWord))).toBe(true);
    for (const line of wrapped) {
      const body = line.startsWith("     ") ? line.slice(5) : line;
      expect(body.includes(longWord.slice(0, 10)) && !body.includes(longWord)).toBe(
        false
      );
    }
    const bytes = await buildInvoicePdf(
      payload({
        lines: [{ ...payload().lines[0], description, price: 80 }],
      })
    );
    const asText = pdfReadableText(bytes);
    expect(asText).toContain(longWord);
    expect(asText).toContain("APT UNIT");
  });

  it("hard-breaks a word wider than the amount rule", async () => {
    const { StandardFonts, PDFDocument: Pdf } = await import("pdf-lib");
    const doc = await Pdf.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const width = descriptionWrapWidth(font);
    let wide = "M";
    while (font.widthOfTextAtSize(wide, PRINT_DESC_SIZE) <= PRINT_AMOUNT_X + 12) {
      wide += "M";
    }
    expect(font.widthOfTextAtSize(wide, PRINT_DESC_SIZE)).toBeGreaterThan(PRINT_AMOUNT_X);
    const description = `Paint ${wide} today`;
    const wrapped = wrapDescription(font, description, PRINT_DESC_SIZE, width);
    expect(wrapped.length).toBeGreaterThan(1);
    const indentW = font.widthOfTextAtSize("     ", PRINT_DESC_SIZE);
    const twoSpaces = font.widthOfTextAtSize("  ", PRINT_DESC_SIZE);
    for (const line of wrapped) {
      const body = line.startsWith("     ") ? line.slice(5) : line;
      const limit = line.startsWith("     ") ? width - indentW : width;
      expect(font.widthOfTextAtSize(body, PRINT_DESC_SIZE)).toBeLessThanOrEqual(
        limit + 0.01
      );
      const endX = PRINT_DESC_X + font.widthOfTextAtSize(line, PRINT_DESC_SIZE);
      expect(endX).toBeLessThanOrEqual(PRINT_AMOUNT_X - twoSpaces + 0.05);
      expect(endX).toBeLessThanOrEqual(PRINT_AMOUNT_X);
    }
    const pieces = wrapped.map((line, i) =>
      i === 0 ? line : line.replace(/^ {5}/, "")
    );
    expect(pieces.join("").replace(/ /g, "")).toBe(description.replace(/ /g, ""));
    expect(wrapped.some((line) => line.includes(wide))).toBe(false);
    const bytes = await buildInvoicePdf(
      payload({
        lines: [{ ...payload().lines[0], description, price: 80 }],
      })
    );
    const asText = pdfReadableText(bytes);
    expect(asText).toContain("Paint");
    expect(asText).toContain("today");
    expect(asText).toContain(wide.slice(-8));
    const positions = textPositions(bytes);
    const drawn = positions.filter((p) => /M{6,}/.test(p.text));
    expect(drawn.length).toBeGreaterThan(0);
    for (const piece of drawn) {
      expect(piece.text).not.toContain(wide);
      const endX = piece.x + font.widthOfTextAtSize(piece.text, PRINT_DESC_SIZE);
      expect(endX).toBeLessThanOrEqual(PRINT_AMOUNT_X);
    }
  });

  it("continues lines that do not fit onto a second letter page", async () => {
    const bytes = await buildInvoicePdf(payload({ lines: numberedLines(30) }));
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    for (const page of doc.getPages()) {
      const { width, height } = page.getSize();
      expect(width).toBeCloseTo(612, 0);
      expect(height).toBeCloseTo(792, 0);
    }

    // The template itself prints the totals labels on every page; PO#/WO#
    // is drawn only with the totals.
    const [first, second] = await pageTexts(bytes);
    const items = (texts: string[]) => texts.filter((t) => t.startsWith("LINE ITEM "));
    expect(items(first)).toEqual(numberedLines(27).map((l) => l.description));
    expect(items(second)).toEqual(["LINE ITEM 28", "LINE ITEM 29", "LINE ITEM 30"]);
    for (const texts of [first, second]) {
      expect(texts).toContain("52629");
      expect(texts).toContain("COMPANY INFORMATION");
      expect(texts).toContain("APT UNIT # :");
    }
    expect(first).toContain("CONTINUED ON NEXT PAGE");
    expect(first).toContain("Page 1 of 2");
    expect(first).not.toContain("PO#/WO#");
    expect(first).not.toContain("300.00");
    expect(second).not.toContain("CONTINUED ON NEXT PAGE");
    expect(second).toContain("Page 2 of 2");
    expect(second).toContain("PO#/WO#");
    expect(second).toContain("300.00");
  });

  it("keeps every page in regular Helvetica and marks every page of a void invoice", async () => {
    const bytes = await buildInvoicePdf(
      payload({
        lines: numberedLines(30),
        invoice: { ...payload().invoice, voided: true },
      })
    );
    const doc = await PDFDocument.load(bytes);
    for (const page of doc.getPages()) {
      const fonts = page.node.Resources()!.lookup(PDFName.of("Font"), PDFDict);
      const faces = fonts
        .keys()
        .map((key) => String(fonts.lookup(key, PDFDict).get(PDFName.of("BaseFont"))));
      expect(new Set(faces)).toEqual(new Set(["/Helvetica"]));
    }
    for (const texts of await pageTexts(bytes)) {
      expect(texts).toContain("*** V O I D  I N V O I C E ***");
    }
  });

  it("moves remark 1 to the next page when the table is full", async () => {
    const bytes = await buildInvoicePdf(
      payload({
        lines: numberedLines(27),
        invoice: { ...payload().invoice, remark1: "Thank you" },
      })
    );
    const [first, second] = await pageTexts(bytes);
    expect(first.filter((t) => t.startsWith("LINE ITEM "))).toHaveLength(27);
    expect(first).not.toContain("Thank you");
    expect(second).toContain("Thank you");
    expect(second).toContain("PO#/WO#");
  });

  it("prints one page with no page number or continuation when everything fits", async () => {
    const bytes = await buildInvoicePdf(payload({ lines: numberedLines(27) }));
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
    const [only] = await pageTexts(bytes);
    expect(only.filter((t) => t.startsWith("LINE ITEM "))).toHaveLength(27);
    expect(only).not.toContain("CONTINUED ON NEXT PAGE");
    expect(only.some((t) => t.startsWith("Page "))).toBe(false);
    expect(only).toContain("PO#/WO#");
  });
});

describe("paginateRows", () => {
  it("keeps an item's lines together when they fit on one page", () => {
    expect(paginateRows([["a"], ["b1", "b2"], ["c"]], 2)).toEqual([["a"], ["b1", "b2"], ["c"]]);
  });

  it("splits an item longer than a page across pages", () => {
    expect(paginateRows([["a"], ["b1", "b2", "b3"]], 2)).toEqual([
      ["a", "b1"],
      ["b2", "b3"],
    ]);
  });

  it("returns one empty page when there is nothing to print", () => {
    expect(paginateRows([], 27)).toEqual([[]]);
  });
});

describe("invoice form contents", () => {
  beforeEach(() => {
    stubTemplateFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const base = payload();
  const drawn = async (overrides: Partial<InvoicePrintPayload>) =>
    textPositions(await buildInvoicePdf(payload(overrides)));
  const texts = (positions: { text: string }[]) => positions.map((p) => p.text);
  const at = (positions: { text: string; y: number }[], text: string) =>
    positions.find((p) => p.text === text);

  it("fills in every value in regular Helvetica, never bold", async () => {
    const bytes = await buildInvoicePdf(
      payload({ invoice: { ...base.invoice, voided: true, remark1: "Thank you" } })
    );
    const page = (await PDFDocument.load(bytes)).getPages()[0];
    const fonts = page.node.Resources()!.lookup(PDFName.of("Font"), PDFDict);
    const faces = fonts.keys().map((key) => String(fonts.lookup(key, PDFDict).get(PDFName.of("BaseFont"))));
    expect(faces.length).toBeGreaterThan(0);
    expect(new Set(faces)).toEqual(new Set(["/Helvetica"]));
  });

  it("prints the stored total, the deposit plus cash paid, and the stored balance", async () => {
    const positions = await drawn({});
    expect(texts(positions).filter((t) => t === "445.00")).toHaveLength(2);
    expect(texts(positions)).toContain("145.00");
    expect(texts(positions)).toContain("300.00");
    expect(texts(positions)).toContain("0.00");
  });

  it("totals the lines when the invoice has no stored total, and works out the balance", async () => {
    const positions = await drawn({
      invoice: { ...base.invoice, salesTotal: 0, balance: null as unknown as number },
      lines: [
        { ...base.lines[0], price: 100 },
        { ...base.lines[1], price: 50 },
      ],
    });
    expect(texts(positions).filter((t) => t === "150.00")).toHaveLength(2);
    expect(texts(positions)).toContain("5.00");
  });

  it("prints MM/DD/YYYY dates, grouped amounts without a dollar sign, and leaves a missing due date blank", async () => {
    const all = texts(
      await drawn({
        invoice: { ...base.invoice, salesTotal: 1234.5, salesPay: 0, payTotal: 0, balance: -5, salesDue: null },
        lines: [{ ...base.lines[0], price: 1234.5 }],
      })
    );
    expect(all.filter((t) => /\d\d\/\d\d\/\d{4}/.test(t))).toEqual(["01/15/2020"]);
    expect(all.filter((t) => t === "1,234.50")).toHaveLength(3);
    expect(all).toContain("-5.00");
    expect(all.some((t) => t.includes("$") || t.includes("/  /"))).toBe(false);
  });

  it("skips lines with neither a description nor a price", async () => {
    const alone = await drawn({ lines: [base.lines[1]] });
    const withBlank = await drawn({
      lines: [{ ...base.lines[0], description: "  ", price: 0 }, base.lines[1]],
    });
    expect(at(withBlank, "CEILING")?.y).toBe(at(alone, "CEILING")?.y);
  });

  it("prints remark 1 under the last line, clipped to fit", async () => {
    const remark = "Touch-up visit included within thirty days of completion at no extra charge";
    expect(remark.length).toBeGreaterThan(58);
    const positions = await drawn({ invoice: { ...base.invoice, remark1: remark } });
    const line = positions.find((p) => p.text.startsWith("Touch-up visit"));
    expect(line?.text.startsWith(remark.slice(0, 57))).toBe(true);
    expect(line?.text).not.toContain("no extra charge");
    expect(line!.y).toBeLessThan(at(positions, "CEILING")!.y);
  });

  it("labels the contacts and leaves out empty address parts", async () => {
    const full = await drawn({});
    expect(texts(full)).toContain("Attn: ELAINE");
    expect(texts(full)).toContain("NEWPORT BEACH, CA, 92660");
    expect(texts(full)).toContain("Contact: OFFICE");

    const sparse = await drawn({
      company: { ...base.company, phone: "", state: "" },
      property: { ...base.property, manager: "", contact: "JOE" },
    });
    expect(texts(sparse)).toContain("NEWPORT BEACH, 92660");
    expect(texts(sparse)).toContain("Contact: JOE");
    expect(at(sparse, "Attn: ELAINE")!.y).toBeGreaterThan(at(full, "Attn: ELAINE")!.y);
  });

  it("clips a long company name to the address column", async () => {
    const name = "OAKS MANAGEMENT COMPANY OF SOUTHERN CALIFORNIA INC";
    const positions = await drawn({ company: { ...base.company, name } });
    const printed = positions.find((p) => p.text.startsWith("OAKS MANAGEMENT"))!;
    const visible = printed.text.replace(/\u0085$/, "");
    expect(name.startsWith(visible)).toBe(true);
    expect(visible.length).toBeLessThan(name.length);
  });

  it("prints Net 7 Days when the invoice has no terms", async () => {
    const positions = await drawn({ invoice: { ...base.invoice, salesTerm: "" } });
    expect(texts(positions)).toContain("Net  7 Days");
  });

  it("prints nothing for the P.O. box when there is no P.O. or work order", async () => {
    const positions = await drawn({ invoice: { ...base.invoice, custPoNo: "", orderNo: 0 } });
    expect(texts(positions)).not.toContain("PO9");
    expect(texts(positions)).not.toContain("99");
  });
});

describe("opening the printed invoice", () => {
  let created: Blob[];
  const original = Object.getOwnPropertyDescriptors(URL);

  beforeEach(() => {
    stubTemplateFetch();
    created = [];
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn((blob: Blob) => {
        created.push(blob);
        return "blob:invoice";
      }),
    });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const name of ["createObjectURL", "revokeObjectURL"] as const) {
      if (original[name]) Object.defineProperty(URL, name, original[name]);
      else delete (URL as unknown as Record<string, unknown>)[name];
    }
  });

  it("shows the PDF in the print preview", async () => {
    await printInvoiceOnTemplate(payload());
    expect(getPrintPreviewUrl()).toBe("blob:invoice");
    expect(created[0].type).toBe("application/pdf");
  });

  it("downloads the PDF named after the invoice and company, then frees it", async () => {
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this);
    });
    const realSetTimeout = globalThis.setTimeout;
    let release: (() => void) | undefined;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void, ms?: number) => {
      if (ms === 10_000) {
        release = fn;
        return 0;
      }
      return realSetTimeout(fn, ms);
    }) as typeof setTimeout);

    await downloadInvoicePdf(payload());
    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe("Invoice_52629_1000.pdf");
    expect(clicked[0].href).toBe("blob:invoice");
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    release!();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:invoice");
  });

  it("names an unnumbered invoice as a draft, or uses the name given", async () => {
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this);
    });
    const draft = payload();
    await downloadInvoicePdf({ ...draft, invoice: { ...draft.invoice, invoice: 0 } });
    await downloadInvoicePdf(payload(), "custom.pdf");
    expect(clicked.map((a) => a.download)).toEqual(["Invoice_draft_1000.pdf", "custom.pdf"]);
  });
});

describe("wrapping text to a width", () => {
  let font: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  beforeEach(async () => {
    font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
  });

  it("returns one empty line for no text", () => {
    expect(wrapDescription(font, "", 9, 100)).toEqual([""]);
  });

  it("keeps blank lines between paragraphs and treats CRLF like LF", () => {
    expect(wrapDescription(font, "first\r\n\r\nsecond", 9, 200)).toEqual([
      "first",
      "",
      `${PRINT_DESC_INDENT}second`,
    ]);
  });

  it("splits a word wider than the line into pieces that each fit", () => {
    const word = "Supercalifragilisticexpialidocious";
    const width = font.widthOfTextAtSize("Supercali", 9);
    const lines = wrapDescription(font, `a ${word} b`, 9, width);
    expect(lines[0]).toBe("a");
    expect(lines.length).toBeGreaterThan(3);
    expect(lines.join("").replace(/\s+/g, "")).toBe(`a${word}b`);
    for (const line of lines) {
      expect(font.widthOfTextAtSize(line, 9)).toBeLessThanOrEqual(width + 0.001);
    }
  });
});