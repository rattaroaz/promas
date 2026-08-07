import { describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { renderApp, screen, userEvent } from "../test/render";
import { MainMenu } from "./MainMenu";

function key(key: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

describe("MainMenu", () => {
  it("lists Settings as option 8", () => {
    renderApp(<MainMenu onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: /8\.\s*Settings/i })).toBeInTheDocument();
  });

  it("invokes onSelect(settings) when Settings is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderApp(<MainMenu onSelect={onSelect} />);
    await user.click(screen.getByRole("button", { name: /8\.\s*Settings/i }));
    expect(onSelect).toHaveBeenCalledWith("settings");
  });

  it("lists all primary process items", () => {
    renderApp(<MainMenu onSelect={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /Estimate Process/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Work Order Process/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Invoice Process/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Cash Receipts Process/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Material Process/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Reports Menu/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Miscellaneous/i })
    ).toBeInTheDocument();
  });

  it("selects menu item by number key 1–8", () => {
    const onSelect = vi.fn();
    renderApp(<MainMenu onSelect={onSelect} />);
    key("3");
    expect(onSelect).toHaveBeenCalledWith("invoice");
    onSelect.mockClear();
    key("8");
    expect(onSelect).toHaveBeenCalledWith("settings");
  });

  it("opens quit prompt on Esc and confirms with Y", () => {
    const onSelect = vi.fn();
    renderApp(<MainMenu onSelect={onSelect} />);
    key("Escape");
    // Shown in message bar and in Prompt dialog
    expect(screen.getAllByText(/Do you want quit \(Y\/N\)/i).length).toBeGreaterThan(0);
    key("y");
    expect(onSelect).toHaveBeenCalledWith("quit");
  });

  it("cancels quit prompt with N", () => {
    const onSelect = vi.fn();
    renderApp(<MainMenu onSelect={onSelect} />);
    key("Escape");
    key("n");
    expect(onSelect).not.toHaveBeenCalledWith("quit");
    // Prompt dismissed — quit message gone from overlay (message bar returns to select hint)
    expect(screen.queryByRole("button", { name: /^Y$/i })).not.toBeInTheDocument();
  });

  it("Enter activates the highlighted item", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderApp(<MainMenu onSelect={onSelect} />);
    await user.hover(screen.getByRole("button", { name: /4\.\s*Cash Receipts/i }));
    key("Enter");
    expect(onSelect).toHaveBeenCalledWith("cash");
  });

  it("selects via accelerator letter", () => {
    const onSelect = vi.fn();
    renderApp(<MainMenu onSelect={onSelect} />);
    key("i"); // Invoice Process
    expect(onSelect).toHaveBeenCalledWith("invoice");
  });

  it("arrow keys wrap highlight; Home/End jump", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderApp(<MainMenu onSelect={onSelect} />);
    key("End");
    key("Enter");
    expect(onSelect).toHaveBeenCalledWith("settings");
    onSelect.mockClear();
    key("Home");
    key("Enter");
    expect(onSelect).toHaveBeenCalledWith("estimate");
    onSelect.mockClear();
    // Up from first wraps to last
    key("ArrowUp");
    key("Enter");
    expect(onSelect).toHaveBeenCalledWith("settings");
  });
});

