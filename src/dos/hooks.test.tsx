import { describe, it, expect, vi } from "vitest";
import { render, renderHook, act } from "@testing-library/react";
import {
  computeFitScale,
  pointerHoverMuted,
  useBrowseIndex,
  useDosKeys,
} from "./hooks";
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

  it("mutes row hover after an arrow so the pointer cannot snap the highlight back", () => {
    expect(pointerHoverMuted()).toBe(false);
    renderHook(() => useDosKeys({ onArrowDown: vi.fn() }));
    fire("ArrowDown");
    expect(pointerHoverMuted()).toBe(true);
  });

  it("Left/Right fall back to Up/Down when a screen does not define them", () => {
    const onArrowUp = vi.fn();
    const onArrowDown = vi.fn();
    renderHook(() => useDosKeys({ onArrowUp, onArrowDown }));
    fire("ArrowLeft");
    fire("ArrowRight");
    expect(onArrowUp).toHaveBeenCalledOnce();
    expect(onArrowDown).toHaveBeenCalledOnce();
  });

  it("prefers an explicit Left/Right handler over the Up/Down fallback", () => {
    const onArrowUp = vi.fn();
    const onArrowLeft = vi.fn();
    renderHook(() => useDosKeys({ onArrowUp, onArrowLeft }));
    fire("ArrowLeft");
    expect(onArrowLeft).toHaveBeenCalledOnce();
    expect(onArrowUp).not.toHaveBeenCalled();
  });

  it("does not steal Left/Right from a search box while forceNav moves the list", () => {
    const onArrowUp = vi.fn();
    const onArrowDown = vi.fn();
    renderHook(() => useDosKeys({ onArrowUp, onArrowDown, forceNav: true }));
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    input.value = "acme";
    input.setSelectionRange(2, 2);
    const left = new KeyboardEvent("keydown", {
      key: "ArrowLeft",
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(left);
    expect(left.defaultPrevented).toBe(false);
    expect(onArrowUp).not.toHaveBeenCalled();
    const down = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(down);
    expect(onArrowDown).toHaveBeenCalledOnce();
    document.body.removeChild(input);
  });
});

describe("form field arrows", () => {
  function press(el: HTMLElement, key: string) {
    const ev = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
    });
    el.dispatchEvent(ev);
    return ev;
  }

  function form() {
    renderHook(() => useDosKeys({}));
    render(
      <div className="dos-screen">
        <div className="dos-form">
          <input aria-label="name" defaultValue="ACME" />
          <input aria-label="city" defaultValue="Yuma" />
          <select aria-label="size">
            <option value="a">A</option>
            <option value="b">B</option>
          </select>
          <input aria-label="when" type="date" defaultValue="2026-01-15" />
          <input aria-label="price" type="number" defaultValue="12" />
          <textarea aria-label="note" defaultValue={"one\ntwo"} />
        </div>
      </div>
    );
    return {
      name: document.querySelector<HTMLInputElement>("[aria-label='name']")!,
      city: document.querySelector<HTMLInputElement>("[aria-label='city']")!,
      size: document.querySelector<HTMLSelectElement>("[aria-label='size']")!,
      when: document.querySelector<HTMLInputElement>("[aria-label='when']")!,
      price: document.querySelector<HTMLInputElement>("[aria-label='price']")!,
      note: document.querySelector<HTMLTextAreaElement>("[aria-label='note']")!,
    };
  }

  it("moves through fields with Up/Down and with Left/Right at the caret edge", () => {
    const { name, city, size } = form();
    name.focus();
    name.setSelectionRange(4, 4);
    press(name, "ArrowRight");
    expect(city).toHaveFocus();
    expect(city.selectionStart).toBe(0);

    city.setSelectionRange(2, 2);
    const mid = press(city, "ArrowLeft");
    expect(mid.defaultPrevented).toBe(false);
    expect(city).toHaveFocus();

    city.setSelectionRange(0, 0);
    press(city, "ArrowLeft");
    expect(name).toHaveFocus();

    name.focus();
    press(name, "ArrowDown");
    expect(city).toHaveFocus();
    press(city, "ArrowDown");
    expect(size).toHaveFocus();
  });

  it("leaves select options and date segments to the control", () => {
    const { size, when, price } = form();
    size.focus();
    const down = press(size, "ArrowDown");
    expect(down.defaultPrevented).toBe(false);
    expect(size).toHaveFocus();
    press(size, "ArrowRight");
    expect(when).toHaveFocus();

    const segment = press(when, "ArrowRight");
    expect(segment.defaultPrevented).toBe(false);
    expect(when).toHaveFocus();
    press(when, "ArrowDown");
    expect(price).toHaveFocus();

    const spin = press(price, "ArrowUp");
    expect(spin.defaultPrevented).toBe(false);
    expect(price).toHaveFocus();
  });

  it("keeps the caret inside a textarea until the first or last line", () => {
    const { note, price } = form();
    note.focus();
    note.setSelectionRange(0, 0);
    press(note, "ArrowUp");
    expect(price).toHaveFocus();

    note.focus();
    note.setSelectionRange(2, 2);
    const down = press(note, "ArrowDown");
    expect(down.defaultPrevented).toBe(false);
    expect(note).toHaveFocus();
  });

  it("ArrowLeft inside typed text stays in the field until the caret is at the start", () => {
    const { name, city } = form();
    city.focus();
    city.value = "AC";
    city.setSelectionRange(2, 2);
    const left = press(city, "ArrowLeft");
    expect(left.defaultPrevented).toBe(false);
    expect(city).toHaveFocus();
    city.setSelectionRange(0, 0);
    press(city, "ArrowLeft");
    expect(name).toHaveFocus();
  });

  it("does not block typing or Tab inside a field", () => {
    const { name } = form();
    const onChar = vi.fn();
    renderHook(() => useDosKeys({ onChar }));
    name.focus();
    const typed = press(name, "a");
    const tab = press(name, "Tab");
    expect(typed.defaultPrevented).toBe(false);
    expect(tab.defaultPrevented).toBe(false);
    expect(onChar).not.toHaveBeenCalled();
    expect(name).toHaveFocus();
  });

  it("focuses the first field when nothing is focused and the screen has no list handler", () => {
    render(
      <div className="dos-screen">
        <div className="dos-searchline">
          <input aria-label="from" />
          <input aria-label="to" type="date" />
        </div>
      </div>
    );
    renderHook(() => useDosKeys({ onEnter: vi.fn() }));
    const from = document.querySelector<HTMLInputElement>("[aria-label='from']")!;
    const to = document.querySelector<HTMLInputElement>("[aria-label='to']")!;
    (document.activeElement as HTMLElement | null)?.blur();
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
    );
    expect(from).toHaveFocus();
    press(from, "ArrowDown");
    expect(to).toHaveFocus();
  });
});
