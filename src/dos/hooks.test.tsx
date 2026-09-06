import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { computeFitScale, useBrowseIndex, useDosKeys } from "./hooks";
import { STATUS_KEY_CLICK } from "./Shell";

describe("computeFitScale", () => {
  it("stays at 1 when content already fits", () => {
    expect(computeFitScale(1024, 800, 1)).toBe(1);
  });

  it("shrinks so wide content matches the window", () => {
    expect(computeFitScale(400, 800, 1)).toBeCloseTo(0.5);
  });

  it("holds a fitted scale instead of shrinking further", () => {
    expect(computeFitScale(400, 400, 0.5)).toBe(0.5);
  });

  it("grows back toward 1 when there is slack", () => {
    expect(computeFitScale(800, 400, 0.5)).toBe(1);
  });
});

describe("useBrowseIndex", () => {
  it("starts at 0 and clamps when count shrinks", () => {
    const { result, rerender } = renderHook(
      ({ count }: { count: number }) => useBrowseIndex(count),
      { initialProps: { count: 5 } }
    );
    expect(result.current.index).toBe(0);
    act(() => result.current.setIndex(4));
    expect(result.current.index).toBe(4);
    rerender({ count: 2 });
    expect(result.current.index).toBe(1);
  });

  it("navigates with up/down/home/end/page", () => {
    const { result } = renderHook(() => useBrowseIndex(40));
    act(() => result.current.down());
    expect(result.current.index).toBe(1);
    act(() => result.current.pageDown());
    expect(result.current.index).toBe(16);
    act(() => result.current.end());
    expect(result.current.index).toBe(39);
    act(() => result.current.home());
    expect(result.current.index).toBe(0);
    act(() => result.current.pageUp());
    expect(result.current.index).toBe(0);
    act(() => {
      result.current.setIndex(10);
      result.current.up();
    });
    expect(result.current.index).toBe(9);
  });

  it("handles empty list", () => {
    const { result } = renderHook(() => useBrowseIndex(0));
    act(() => result.current.down());
    expect(result.current.index).toBe(0);
    act(() => result.current.end());
    expect(result.current.index).toBe(0);
  });
});

describe("useDosKeys", () => {
  function fire(key: string, init: KeyboardEventInit = {}) {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, ...init })
    );
  }

  it("invokes Escape / Enter / Insert / Delete / F1 handlers", () => {
    const onEscape = vi.fn();
    const onEnter = vi.fn();
    const onInsert = vi.fn();
    const onDelete = vi.fn();
    const onF1 = vi.fn();
    renderHook(() =>
      useDosKeys({ onEscape, onEnter, onInsert, onDelete, onF1 })
    );
    fire("Escape");
    fire("Enter");
    fire("Insert");
    fire("Delete");
    fire("F1");
    expect(onEscape).toHaveBeenCalledOnce();
    expect(onEnter).toHaveBeenCalledOnce();
    expect(onInsert).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onF1).toHaveBeenCalledOnce();
  });

  it("handles Ctrl-W and Ctrl-Home", () => {
    const onCtrlW = vi.fn();
    const onCtrlHome = vi.fn();
    renderHook(() => useDosKeys({ onCtrlW, onCtrlHome }));
    fire("w", { ctrlKey: true });
    fire("Home", { ctrlKey: true });
    expect(onCtrlW).toHaveBeenCalledOnce();
    expect(onCtrlHome).toHaveBeenCalledOnce();
  });

  it("routes arrow and page keys", () => {
    const onArrowUp = vi.fn();
    const onArrowDown = vi.fn();
    const onPageUp = vi.fn();
    const onPageDown = vi.fn();
    const onHome = vi.fn();
    const onEnd = vi.fn();
    renderHook(() =>
      useDosKeys({
        onArrowUp,
        onArrowDown,
        onPageUp,
        onPageDown,
        onHome,
        onEnd,
      })
    );
    fire("ArrowUp");
    fire("ArrowDown");
    fire("PageUp");
    fire("PageDown");
    fire("Home");
    fire("End");
    expect(onArrowUp).toHaveBeenCalledOnce();
    expect(onArrowDown).toHaveBeenCalledOnce();
    expect(onPageUp).toHaveBeenCalledOnce();
    expect(onPageDown).toHaveBeenCalledOnce();
    expect(onHome).toHaveBeenCalledOnce();
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it("inserts even while an input is focused", () => {
    const onInsert = vi.fn();
    renderHook(() => useDosKeys({ onInsert }));
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Insert", bubbles: true })
    );
    expect(onInsert).toHaveBeenCalledOnce();
    document.body.removeChild(input);
  });

  it("does not navigate while typing in an input unless forceNav", () => {
    const onArrowDown = vi.fn();
    const { rerender } = renderHook(
      ({ forceNav }: { forceNav?: boolean }) =>
        useDosKeys({ onArrowDown, forceNav }),
      { initialProps: { forceNav: false } }
    );
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    // Dispatch on the input so e.target.tagName === "INPUT"
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
    );
    expect(onArrowDown).not.toHaveBeenCalled();

    rerender({ forceNav: true });
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
    );
    expect(onArrowDown).toHaveBeenCalledOnce();
    document.body.removeChild(input);
  });

  it("is inactive when active=false", () => {
    const onEscape = vi.fn();
    renderHook(() => useDosKeys({ onEscape }, false));
    fire("Escape");
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("runs handlers from status-bar clicks even when an input is focused", () => {
    const onEscape = vi.fn();
    const onCtrlW = vi.fn();
    const onEnd = vi.fn();
    const onInsert = vi.fn();
    const onChar = vi.fn();
    renderHook(() =>
      useDosKeys({ onEscape, onCtrlW, onEnd, onInsert, onChar })
    );
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    window.dispatchEvent(new CustomEvent(STATUS_KEY_CLICK, { detail: "Esc" }));
    window.dispatchEvent(new CustomEvent(STATUS_KEY_CLICK, { detail: "Ctrl-W" }));
    window.dispatchEvent(new CustomEvent(STATUS_KEY_CLICK, { detail: "End" }));
    window.dispatchEvent(new CustomEvent(STATUS_KEY_CLICK, { detail: "Ins" }));
    window.dispatchEvent(new CustomEvent(STATUS_KEY_CLICK, { detail: "(A)" }));
    expect(onEscape).toHaveBeenCalledOnce();
    expect(onCtrlW).toHaveBeenCalledOnce();
    expect(onEnd).toHaveBeenCalledOnce();
    expect(onInsert).toHaveBeenCalledOnce();
    expect(onChar).toHaveBeenCalledWith("A", expect.anything());
    document.body.removeChild(input);
  });

  it("calls onChar for printable keys", () => {
    const onChar = vi.fn(() => true);
    renderHook(() => useDosKeys({ onChar }));
    fire("3");
    expect(onChar).toHaveBeenCalledWith("3", expect.any(KeyboardEvent));
  });
});
