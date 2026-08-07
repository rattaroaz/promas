import { describe, it, expect, vi } from "vitest";
import { act } from "@testing-library/react";
import { renderApp, screen, userEvent } from "../test/render";
import { SubMenu } from "./SubMenu";

const items = [
  { id: "a", num: "1", label: "First Item", accel: "F" },
  { id: "b", num: "2", label: "Second Item", accel: "S" },
  { id: "c", num: "3", label: "Third Item", accel: "T" },
];

function key(k: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
  });
}

describe("SubMenu", () => {
  it("renders title and all items", () => {
    renderApp(
      <SubMenu
        title=" Material Process "
        items={items}
        onSelect={vi.fn()}
        onBack={vi.fn()}
      />
    );
    // Title appears in title bar and menu header
    expect(screen.getAllByText(/Material Process/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: /1\.\s*First Item/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /3\.\s*Third Item/i })).toBeInTheDocument();
  });

  it("selects via click", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderApp(
      <SubMenu
        title=" Reports Menu "
        items={items}
        onSelect={onSelect}
        onBack={vi.fn()}
      />
    );
    await user.click(screen.getByRole("button", { name: /2\.\s*Second Item/i }));
    expect(onSelect).toHaveBeenCalledWith("b");
  });

  it("selects via number key and Esc goes back", () => {
    const onSelect = vi.fn();
    const onBack = vi.fn();
    renderApp(
      <SubMenu
        title=" Miscellaneous "
        items={items}
        onSelect={onSelect}
        onBack={onBack}
      />
    );
    key("3");
    expect(onSelect).toHaveBeenCalledWith("c");

    key("Escape");
    expect(onBack).toHaveBeenCalled();
  });

  it("selects via accelerator letter and Enter on highlight", () => {
    const onSelect = vi.fn();
    renderApp(
      <SubMenu title=" Test " items={items} onSelect={onSelect} onBack={vi.fn()} />
    );
    key("f");
    expect(onSelect).toHaveBeenCalledWith("a");
    onSelect.mockClear();
    key("ArrowDown");
    key("Enter");
    // hot starts 0, ArrowDown -> 1 (Second Item)
    expect(onSelect).toHaveBeenCalledWith("b");
  });
});
