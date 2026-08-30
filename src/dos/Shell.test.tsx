import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { STATUS_KEY_CLICK, StatusBar, statusKeyEvent } from "./Shell";
import { useDosKeys } from "./hooks";

describe("statusKeyEvent", () => {
  it("maps common status captions to keyboard events", () => {
    expect(statusKeyEvent("Esc")).toEqual({ key: "Escape" });
    expect(statusKeyEvent("Ins")).toEqual({ key: "Insert" });
    expect(statusKeyEvent("Ctrl-W")).toEqual({ key: "w", ctrlKey: true });
    expect(statusKeyEvent("Ctrl-Home")).toEqual({ key: "Home", ctrlKey: true });
    expect(statusKeyEvent("P")).toEqual({ key: "P" });
    expect(statusKeyEvent("1-9")).toBeNull();
  });
});

function KeyProbe({
  onEscape,
  onInsert,
  onCtrlW,
  onEnd,
  onF1,
}: {
  onEscape?: () => void;
  onInsert?: () => void;
  onCtrlW?: () => void;
  onEnd?: () => void;
  onF1?: () => void;
}) {
  useDosKeys({ onEscape, onInsert, onCtrlW, onEnd, onF1 });
  return (
    <StatusBar
      keys={[
        { key: "Esc", label: "Cancel" },
        { key: "Ctrl-W", label: "Save" },
        { key: "End", label: "Print Form" },
        { key: "F1", label: "Help" },
        { key: "Ins", label: "Add" },
      ]}
    />
  );
}

describe("StatusBar", () => {
  it("runs the matching handler when a hint is clicked", async () => {
    const user = userEvent.setup();
    const onEscape = vi.fn();
    const onCtrlW = vi.fn();
    const onEnd = vi.fn();
    const onF1 = vi.fn();
    const onInsert = vi.fn();
    render(
      <KeyProbe
        onEscape={onEscape}
        onCtrlW={onCtrlW}
        onEnd={onEnd}
        onF1={onF1}
        onInsert={onInsert}
      />
    );
    await user.click(screen.getByRole("button", { name: /^Esc Cancel$/i }));
    await user.click(screen.getByRole("button", { name: /^Ctrl-W Save$/i }));
    await user.click(screen.getByRole("button", { name: /^End Print Form$/i }));
    await user.click(screen.getByRole("button", { name: /^F1 Help$/i }));
    await user.click(screen.getByRole("button", { name: /^Ins Add$/i }));
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(onCtrlW).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onF1).toHaveBeenCalledTimes(1);
    expect(onInsert).toHaveBeenCalledTimes(1);
  });

  it("announces clicks with a custom event the keyboard hook can hear", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    window.addEventListener(STATUS_KEY_CLICK, onClick);
    render(<StatusBar keys={[{ key: "Esc", label: "Cancel" }]} />);
    await user.click(screen.getByRole("button", { name: /^Esc Cancel$/i }));
    expect(onClick).toHaveBeenCalled();
    expect((onClick.mock.calls[0][0] as CustomEvent).detail).toBe("Esc");
    window.removeEventListener(STATUS_KEY_CLICK, onClick);
  });
});
