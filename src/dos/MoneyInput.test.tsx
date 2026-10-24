import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MoneyInput } from "./MoneyInput";

function Harness({
  initial = 0,
  blankZero = false,
  blurOnEnter = false,
  label = "Amount",
}: {
  initial?: number;
  blankZero?: boolean;
  blurOnEnter?: boolean;
  label?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <MoneyInput
      aria-label={label}
      value={value}
      blankZero={blankZero}
      blurOnEnter={blurOnEnter}
      onValueChange={setValue}
    />
  );
}

describe("MoneyInput", () => {
  it("formats 100 to 100.00 on blur and 432 to 432.00 on Enter", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Harness label="Price" blankZero />
        <Harness label="Material" />
      </>
    );
    const price = screen.getByLabelText("Price");
    await user.click(price);
    await user.type(price, "100");
    expect(price).toHaveValue("100");
    await user.tab();
    expect(price).toHaveValue("100.00");

    const material = screen.getByLabelText("Material");
    await user.click(material);
    await user.clear(material);
    await user.type(material, "432");
    expect(material).toHaveValue("432");
    await user.keyboard("{Enter}");
    expect(material).toHaveValue("432.00");
    expect(document.activeElement).toBe(material);
  });

  it("keeps focus on Enter when blurOnEnter is off and drops it when set", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Harness label="Price" />
        <Harness label="Auto Amount Paid" blurOnEnter />
      </>
    );
    const price = screen.getByLabelText("Price");
    await user.click(price);
    await user.clear(price);
    await user.type(price, "100");
    await user.keyboard("{Enter}");
    expect(price).toHaveValue("100.00");
    expect(document.activeElement).toBe(price);

    const auto = screen.getByLabelText("Auto Amount Paid");
    await user.click(auto);
    await user.clear(auto);
    await user.type(auto, "40");
    await user.keyboard("{Enter}");
    expect(auto).toHaveValue("40.00");
    expect(document.activeElement).not.toBe(auto);
  });

  it("does not insert decimals or move the caret while typing", async () => {
    const user = userEvent.setup();
    render(<Harness label="Price" blankZero />);
    const price = screen.getByLabelText<HTMLInputElement>("Price");
    await user.click(price);
    await user.type(price, "100");
    price.setSelectionRange(1, 1);
    await user.keyboard("5");
    expect(price).toHaveValue("1500");
    expect(price.selectionStart).toBe(2);
  });

  it("leaves a cleared field empty and keeps an existing number until it is edited", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <MoneyInput aria-label="Price" value={100} onValueChange={onValueChange} />
    );
    const price = screen.getByLabelText("Price");
    expect(price).toHaveValue("100.00");
    expect(onValueChange).not.toHaveBeenCalled();
    await user.clear(price);
    await user.tab();
    expect(price).toHaveValue("");
    expect(onValueChange).toHaveBeenCalledWith(0);
  });

  it("shows a stored zero as 0.00 unless the field is a blank-zero price", () => {
    render(
      <>
        <MoneyInput aria-label="Rate" value={0} onValueChange={() => {}} />
        <MoneyInput
          aria-label="Line price"
          value={0}
          blankZero
          onValueChange={() => {}}
        />
      </>
    );
    expect(screen.getByLabelText("Rate")).toHaveValue("0.00");
    expect(screen.getByLabelText("Line price")).toHaveValue("");
  });
});
