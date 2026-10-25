import { afterEach, describe, expect, it, vi } from "vitest";
import { addDays, fmtDate, money, naturalCompare, today } from "./utils";

describe("money", () => {
  it("formats with commas and two decimals", () => {
    expect(money(1234.5)).toBe("1,234.50");
    expect(money(0)).toBe("0.00");
    expect(money(null)).toBe("0.00");
  });

  it("wraps negatives in parentheses", () => {
    expect(money(-12.3)).toBe("(12.30)");
  });
});

describe("fmtDate", () => {
  it("formats ISO dates as MM/DD/YYYY", () => {
    expect(fmtDate("2026-08-05")).toBe("08/05/2026");
  });

  it("returns placeholder for empty and passes through other strings", () => {
    expect(fmtDate(null)).toBe("  /  /    ");
    expect(fmtDate("08/05/26")).toBe("08/05/26");
  });
});

describe("today / addDays", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs in Pacific time, where a UTC date is a day ahead each evening", () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(480);
  });

  it("returns the local date in the evening", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-10T20:30:00-07:00"));
    expect(today()).toBe("2026-03-10");
  });

  it("adds whole days across clock changes, month ends, and leap days", () => {
    expect(addDays("2026-03-05", 7)).toBe("2026-03-12");
    expect(addDays("2026-10-28", 7)).toBe("2026-11-04");
    expect(addDays("2026-01-28", 7)).toBe("2026-02-04");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-12", -7)).toBe("2026-03-05");
  });
});

describe("naturalCompare", () => {
  it("sorts numbers numerically", () => {
    const units = ["10", "2", "1", "20", "3"];
    expect(units.sort(naturalCompare)).toEqual(["1", "2", "3", "10", "20"]);
  });

  it("sorts alphanumeric units correctly", () => {
    const units = ["A10", "A2", "A1", "B2", "1A", "10A"];
    expect(units.sort(naturalCompare)).toEqual(["1A", "10A", "A1", "A2", "A10", "B2"]);
  });

  it("handles mixed formats", () => {
    const units = ["12", "1A", "2", "10", "B2", "A1"];
    expect(units.sort(naturalCompare)).toEqual(["1A", "2", "10", "12", "A1", "B2"]);
  });

  it("handles empty strings", () => {
    expect(naturalCompare("", "A1")).toBe(-1);
    expect(naturalCompare("A1", "")).toBe(1);
    expect(naturalCompare("", "")).toBe(0);
  });

  it("handles null and undefined", () => {
    expect(naturalCompare(null as any, "A1")).toBe(-1);
    expect(naturalCompare("A1", null as any)).toBe(1);
  });
});
