import { describe, expect, it } from "vitest";
import {
  fmtDate,
  labelDots,
  money,
  padL,
  padR,
  withAccel,
} from "./utils";

describe("padR / padL", () => {
  it("pads and truncates", () => {
    expect(padR("ab", 4)).toBe("ab  ");
    expect(padR("abcdef", 4)).toBe("abcd");
    expect(padL("ab", 4)).toBe("  ab");
    expect(padL(null, 3)).toBe("   ");
  });
});

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

describe("labelDots / withAccel", () => {
  it("pads labels with dots", () => {
    expect(labelDots("Name", 8)).toBe("Name....");
  });

  it("splits accel letter from label", () => {
    expect(withAccel("Settings", "T")).toEqual({
      before: "Se",
      accel: "t",
      after: "tings",
    });
    expect(withAccel("Settings", "Z")).toEqual({
      before: "Settings",
      accel: "",
      after: "",
    });
  });
});
