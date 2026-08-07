import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { inflateRawSync, inflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { buildInvoicePdf, type InvoicePrintPayload } from "./invoicePrint";
import type { Company, Property, Invoice, InvoiceLine } from "../api";

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

/** pdf-lib compresses content streams and hex-encodes drawText; recover plain text. */
function pdfReadableText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes);
  const latin = raw.toString("latin1");
  const parts: string[] = [latin];
  // PDF streams: optional \r\n after "stream", payload until "endstream"
  const re = /stream\r?\n([\s\S]*?)endstream/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(latin))) {
    let payload = Buffer.from(m[1], "latin1");
    // Drop trailing whitespace/newlines that some writers put before endstream
    while (
      payload.length > 0 &&
      (payload[payload.length - 1] === 0x0a ||
        payload[payload.length - 1] === 0x0d ||
        payload[payload.length - 1] === 0x20)
    ) {
      payload = payload.subarray(0, payload.length - 1);
    }
    for (const inflate of [inflateSync, inflateRawSync]) {
      try {
        parts.push(inflate(payload).toString("latin1"));
        break;
      } catch {
        /* try next */
      }
    }
  }
  return decodePdfHexStrings(parts.join("\n"));
}

function payload(overrides?: Partial<InvoicePrintPayload>): InvoicePrintPayload {
  const company: Company = {
    companyNo: "1000",
    name: "MESA MANAGEMENT COMPANY",
    class: "A",
    street: "1105 QUAIL ST.",
    city: "NEWPORT BEACH",
    state: "CA",
    zip: "92660",
    phone: "(714)851-0998",
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
    name: "HEATHER APARTMENTS",
    class: "",
    street: "7841 RESEDA BLVD.",
    city: "RESEDA",
    state: "CA",
    zip: "91335",
    phone: "(818)993-9430",
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

describe("buildInvoicePdf", () => {
  beforeEach(() => {
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
    expect(asText).toContain("MESA MANAGEMENT");
    expect(asText).toContain("HEATHER APARTMENTS");
    expect(asText).toContain("INTERIOR PAINT");
    // Totals: 445 subtotal / 145 paid (45 deposit + 100 cash) / 300 net
    expect(asText).toMatch(/445\.00|445/);
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

  it("fills many description rows on letter height without shrinking page", async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      ...payload().lines[0],
      lineNo: i + 1,
      description: `LINE ITEM ${i + 1}`,
      price: 10,
    }));
    const bytes = await buildInvoicePdf(payload({ lines: many }));
    const doc = await PDFDocument.load(bytes);
    const { width, height } = doc.getPages()[0].getSize();
    expect(width).toBeCloseTo(612, 0);
    expect(height).toBeCloseTo(792, 0);
    const asText = pdfReadableText(bytes);
    expect(asText).toContain("LINE ITEM 1");
    // Not all 30 fit; at least first few rows are drawn
    expect(asText).toContain("LINE ITEM 2");
  });
});