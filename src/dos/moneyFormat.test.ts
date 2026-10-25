import { describe, expect, it } from "vitest";
import {
  formatMoneyInput,
  moneyDraftIsEmpty,
  parseMoneyDraft,
  sanitizeMoneyDraft,
} from "./moneyFormat";

describe("formatMoneyInput", () => {
  it("shows exactly two decimals", () => {
    expect(formatMoneyInput(100)).toBe("100.00");
    expect(formatMoneyInput(432)).toBe("432.00");
    expect(formatMoneyInput(42.5)).toBe("42.50");
    expect(formatMoneyInput(0)).toBe("0.00");
    expect(formatMoneyInput(75.5)).toBe("75.50");
  });

  it("leaves empty values empty and does not invent a number", () => {
    expect(formatMoneyInput(null)).toBe("");
    expect(formatMoneyInput(undefined)).toBe("");
    expect(formatMoneyInput(Number.NaN)).toBe("");
  });

  it("keeps the sign on negative amounts", () => {
    expect(formatMoneyInput(-12.3)).toBe("-12.30");
  });
});

describe("parseMoneyDraft", () => {
  it("parses in-progress text without rounding the stored number", () => {
    expect(parseMoneyDraft("100.")).toBe(100);
    expect(parseMoneyDraft("42.5")).toBe(42.5);
    expect(parseMoneyDraft("100.999")).toBe(100.999);
  });

  it("treats empty drafts as zero for calculations", () => {
    expect(parseMoneyDraft("")).toBe(0);
    expect(moneyDraftIsEmpty("")).toBe(true);
    expect(parseMoneyDraft("abc")).toBe(0);
  });
});

describe("sanitizeMoneyDraft", () => {
  it("drops letters and a second decimal point", () => {
    expect(sanitizeMoneyDraft("12a.3")).toBe("12.3");
    expect(sanitizeMoneyDraft("1.2.3")).toBe("1.23");
    expect(sanitizeMoneyDraft("-4")).toBe("-4");
  });
});
