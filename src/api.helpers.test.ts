import { describe, expect, it } from "vitest";
import {
  emptyCashReceipt,
  emptyCompany,
  emptyEmployee,
  emptyInvoice,
  emptyInvoiceLine,
  emptyMaterial,
  emptyProperty,
  emptyWorkOrder,
  emptyWorkType,
  fmtDate,
  money,
} from "./api";

describe("api format helpers", () => {
  it("formats money as USD currency", () => {
    expect(money(12.5)).toMatch(/\$12\.50/);
    expect(money(undefined)).toMatch(/\$0\.00/);
    expect(money(0)).toMatch(/\$0\.00/);
    expect(money(null)).toMatch(/\$0\.00/);
  });

  it("formats ISO dates", () => {
    expect(fmtDate("2026-01-15")).toBe("01/15/2026");
    expect(fmtDate("")).toBe("");
    expect(fmtDate(null)).toBe("");
    expect(fmtDate(undefined)).toBe("");
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
    expect(line.empPrice).toBe(0);
  });

  it("builds property scoped to company", () => {
    const p = emptyProperty("1000");
    expect(p.companyNo).toBe("1000");
    expect(p.proNo).toBe("");
    expect(p.voided).toBe(false);
  });

  it("builds cash receipt / work order / material / worker defaults", () => {
    const cash = emptyCashReceipt();
    expect(cash.payment).toBe(0);
    expect(cash.voided).toBe(false);

    const wo = emptyWorkOrder();
    expect(wo.orderNo).toBe(0);
    expect(wo.voided).toBe(false);

    const mat = emptyMaterial();
    expect(mat.amount).toBe(0);
    expect(mat.voided).toBe(false);

    const emp = emptyEmployee();
    expect(emp.empNo).toBe("");
    expect(emp.voided).toBe(false);

    const wt = emptyWorkType();
    expect(wt.codeNo).toBe("");
    expect(wt.workType).toBe("P");
  });
});
