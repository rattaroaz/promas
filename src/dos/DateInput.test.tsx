import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DateInput, localIsoDate } from "./DateInput";

describe("DateInput", () => {
  it("caps max at today by default so years ahead are not offered", () => {
    render(<DateInput aria-label="d" />);
    const input = screen.getByLabelText("d") as HTMLInputElement;
    expect(input.max).toBe(localIsoDate());
    expect(input.min).toBe("1900-01-01");
  });

  it("allows a limited future window when requested", () => {
    render(<DateInput aria-label="due" allowFutureYears={5} />);
    const input = screen.getByLabelText("due") as HTMLInputElement;
    const today = localIsoDate();
    const [y, m, d] = today.split("-").map(Number);
    const expected = localIsoDate(new Date(y + 5, m - 1, d));
    expect(input.max).toBe(expected);
  });
});
