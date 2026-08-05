import { describe, expect, it } from "vitest";
import {
  emptyCompany,
  emptyInvoice,
  emptyInvoiceLine,
  fmtDate,
  money,
} from "./api";

describe("api format helpers", () => {
  it("formats money as USD currency", () => {
    expect(money(12.5)).toMatch(/\$12\.50/);
    expect(money(undefined)).toMatch(/\$0\.00/);
  });

  it("formats ISO dates", () => {
    expect(fmtDate("2026-01-15")).toBe("01/15/2026");
    expect(fmtDate("")).toBe("");
  });
});

describe("empty* factories", () => {
  it("builds a company with defaults", () => {
    const c = emptyCompany();
    expect(c.companyNo).toBe("");
    expect(c.class).toBe("A");
    expect(c.state).toBe("CA");
    expect(c.voided).toBe(false);
  });

  it("builds invoice + line linked to invoice keys", () => {
    const inv = emptyInvoice();
    inv.companyNo = "1000";
    inv.proNo = "01";
    inv.invoice = 42;
    const line = emptyInvoiceLine(inv, 3);
    expect(line.companyNo).toBe("1000");
    expect(line.proNo).toBe("01");
    expect(line.invoice).toBe(42);
    expect(line.lineNo).toBe(3);
    expect(line.commission).toBe(65);
  });
});
