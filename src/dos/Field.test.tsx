import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DotField, InlineField } from "./Field";
import { DateInput } from "./DateInput";
import { MoneyInput } from "./MoneyInput";

describe("DotField", () => {
  it("pads a short label with dots up to width", () => {
    render(
      <DotField label="Order No" width={14}>
        <input aria-label="order" />
      </DotField>
    );
    expect(screen.getByText("Order No").closest("label")).toHaveTextContent(
      "Order No......"
    );
  });

  it("keeps at least one dot when the label fills the width", () => {
    render(
      <DotField label="Invoice Number" width={16}>
        <input aria-label="invoice" />
      </DotField>
    );
    expect(screen.getByText("Invoice Number").closest("label")).toHaveTextContent(
      "Invoice Number."
    );
  });

  it("names its control with the label, without the dots", () => {
    render(
      <DotField label="Company Name" width={14}>
        <input />
      </DotField>
    );
    const input = screen.getByRole("textbox", { name: "Company Name" });
    expect(screen.getByText("Company Name").closest("label")).toHaveAttribute("for", input.id);
  });

  it("keeps an id the control already has", () => {
    render(
      <DotField label="Class">
        <select id="class-pick">
          <option>A</option>
        </select>
      </DotField>
    );
    expect(screen.getByRole("combobox", { name: "Class" })).toHaveAttribute("id", "class-pick");
  });

  it("names a control component that passes id to its input", () => {
    render(
      <DotField label="Amount">
        <MoneyInput value={0} onValueChange={() => undefined} />
      </DotField>
    );
    expect(screen.getByRole("textbox", { name: "Amount" })).toBeInTheDocument();
  });

  it("leaves the label unlinked around several elements or a non-control", () => {
    render(
      <>
        <DotField label="Unit/Size">
          <input />
          <input />
        </DotField>
        <DotField label="Total">
          <div>12.00</div>
        </DotField>
      </>
    );
    expect(screen.getByText("Unit/Size").closest("label")).not.toHaveAttribute("for");
    expect(screen.getByText("Total").closest("label")).not.toHaveAttribute("for");
    expect(screen.queryByRole("textbox", { name: "Unit/Size" })).not.toBeInTheDocument();
  });
});

describe("InlineField", () => {
  it("shows the label as written and names the control without the colon", () => {
    render(
      <div data-testid="line">
        <InlineField label="From Worker No :">
          <input />
        </InlineField>
        <InlineField label="Search:">
          <DateInput value="" onChange={() => undefined} />
        </InlineField>
      </div>
    );
    expect(screen.getByTestId("line")).toHaveTextContent("From Worker No :Search:");
    expect(screen.getByRole("textbox", { name: "From Worker No" })).toBeInTheDocument();
    const date = screen.getByLabelText("Search:");
    expect(date).toHaveAttribute("type", "date");
    expect(date).toHaveAccessibleName("Search");
  });

  it("keeps a label with no colon whole", () => {
    render(
      <InlineField label="Enter Job Code No (Esc=Exit) !">
        <input />
      </InlineField>
    );
    expect(screen.getByRole("textbox", { name: "Enter Job Code No (Esc=Exit) !" })).toBeInTheDocument();
  });
});
