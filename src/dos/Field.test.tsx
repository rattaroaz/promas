import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ColonField, DotField } from "./Field";

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
});

describe("ColonField", () => {
  it("pads a short label with spaces before the colon", () => {
    render(
      <ColonField label="Name" width={10}>
        <input aria-label="name" />
      </ColonField>
    );
    expect(screen.getByText(/Name\s+:/)).toBeInTheDocument();
  });
});
