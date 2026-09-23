import { useEffect, useLayoutEffect, useCallback, useState, useRef } from "react";
import type { RefObject } from "react";
import { STATUS_KEY_CLICK } from "./Shell";

export type KeyHandler = (e: KeyboardEvent) => boolean | void;

export type ArrowKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

/** Form, filter bar, prompt, and help — the surfaces arrows walk like Tab. */
const FIELD_SCOPE = ".dos-form, .dos-searchline, .dos-prompt, .dos-help";

const FOCUSABLE = [
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "button:not([disabled])",
].join(", ");

const TEXT_TYPES = new Set([
  "text",
  "search",
  "tel",
  "url",
  "email",
  "password",
  "",
]);

const DATE_TYPES = new Set([
  "date",
  "time",
  "datetime-local",
  "month",
  "week",
]);

function isArrowKey(key: string): key is ArrowKey {
  return (
    key === "ArrowUp" ||
    key === "ArrowDown" ||
    key === "ArrowLeft" ||
    key === "ArrowRight"
  );
}

function inputType(el: HTMLElement): string {
  if (el instanceof HTMLInputElement) return (el.type || "text").toLowerCase();
  return "";
}

/** Inputs/selects, plus buttons that live in a form, filter bar, or dialog. */
export function isArrowField(el: EventTarget | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT") {
    return inputType(el) !== "hidden";
  }
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "BUTTON") {
    return el.closest(`${FIELD_SCOPE}, .dos-dialog`) != null;
  }
  return false;
}

export function tabStopsIn(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => {
      if (el.tabIndex < 0) return false;
      if (el.closest(".dos-statusbar")) return false;
      if (el.closest(".dos-browse") && !el.closest(".dos-form")) return false;
      return true;
    }
  );
}

function fieldScope(el: HTMLElement): ParentNode {
  return (
    el.closest(FIELD_SCOPE) ??
    el.closest(".dos-dialog") ??
    el.closest(".dos-screen") ??
    document.body
  );
}

/** Topmost form/filter/prompt, so arrows don't jump into a screen behind a dialog. */
export function activeFieldRoot(): Element | null {
  const overlays = document.querySelectorAll(".dos-overlay");
  for (let i = overlays.length - 1; i >= 0; i--) {
    const inner = overlays[i].querySelector(FIELD_SCOPE);
    if (inner) return inner;
  }
  return document.querySelector(FIELD_SCOPE);
}

function caretAt(el: HTMLInputElement | HTMLTextAreaElement, edge: "start" | "end"): boolean {
  const start = el.selectionStart;
  const end = el.selectionEnd;
  if (start == null || end == null) return true;
  if (edge === "start") return start === 0 && end === 0;
  const len = el.value.length;
  return start === len && end === len;
}

function placeCaret(el: HTMLElement, edge: "start" | "end") {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
  const type = el instanceof HTMLInputElement ? inputType(el) : "text";
  if (!TEXT_TYPES.has(type) && type !== "number" && !(el instanceof HTMLTextAreaElement)) {
    return;
  }
  try {
    const len = el.value.length;
    const pos = edge === "start" ? 0 : len;
    el.setSelectionRange(pos, pos);
  } catch {
    /* number/date inputs reject selection ranges */
  }
}

/**
 * Up/Down walk fields in tab order. Left/Right do too, except where the
 * control itself uses that arrow (caret, date segment, select option, number).
 * Returns true when focus moved.
 */
export function tryMoveFieldFocus(el: HTMLElement, key: ArrowKey): boolean {
  const forward = key === "ArrowDown" || key === "ArrowRight";
  const vertical = key === "ArrowUp" || key === "ArrowDown";

  if (el instanceof HTMLTextAreaElement) {
    const pos = el.selectionStart ?? 0;
    const value = el.value;
    const onFirst = !value.slice(0, pos).includes("\n");
    const onLast = !value.slice(pos).includes("\n");
    if (vertical) {
      if (key === "ArrowUp" && !onFirst) return false;
      if (key === "ArrowDown" && !onLast) return false;
    } else if (key === "ArrowLeft" && !caretAt(el, "start")) {
      return false;
    } else if (key === "ArrowRight" && !caretAt(el, "end")) {
      return false;
    }
  } else if (el instanceof HTMLSelectElement) {
    // Up/Down change the option. Left/Right move to the neighbor field.
    if (vertical) return false;
  } else if (el instanceof HTMLInputElement) {
    const type = inputType(el);
    if (DATE_TYPES.has(type) || type === "range") {
      // Left/Right edit the segment or slider. Up/Down leave the field.
      if (!vertical) return false;
    } else if (type === "number") {
      // Up/Down spin the value. Left/Right move the caret, then the field.
      if (vertical) return false;
      if (key === "ArrowLeft" && !caretAt(el, "start")) return false;
      if (key === "ArrowRight" && !caretAt(el, "end")) return false;
    } else if (TEXT_TYPES.has(type)) {
      if (!vertical) {
        if (key === "ArrowLeft" && !caretAt(el, "start")) return false;
        if (key === "ArrowRight" && !caretAt(el, "end")) return false;
      }
    }
  }

  const stops = tabStopsIn(fieldScope(el));
  const idx = stops.indexOf(el);
  if (idx < 0) return false;
  const next = stops[idx + (forward ? 1 : -1)];
  if (!next) return false;
  next.focus();
  placeCaret(next, forward ? "start" : "end");
  return true;
}

export function focusFieldEdge(root: ParentNode, dir: 1 | -1): boolean {
  const stops = tabStopsIn(root);
  const target = dir > 0 ? stops[0] : stops[stops.length - 1];
  if (!target) return false;
  target.focus();
  placeCaret(target, dir > 0 ? "start" : "end");
  return true;
}

/**
 * Arrow navigation and row hover share one highlight. A pointer resting on
 * the first row would otherwise snap the highlight back on the next
 * mouseenter, so arrows look like they never leave that row.
 */
let pointerHoverMutedUntil = 0;

export function mutePointerHover(ms = 800) {
  pointerHoverMutedUntil = Math.max(
    pointerHoverMutedUntil,
    performance.now() + ms
  );
}

export function pointerHoverMuted(): boolean {
  return performance.now() < pointerHoverMutedUntil;
}

export function resetPointerHoverMute() {
  pointerHoverMutedUntil = 0;
}

function keepsHorizontalCaret(el: HTMLElement): boolean {
  if (el instanceof HTMLTextAreaElement) return true;
  if (!(el instanceof HTMLInputElement)) return false;
  const type = inputType(el);
  return TEXT_TYPES.has(type) || type === "number";
}

/**
 * Global keyboard handler for a DOS screen.
 * Handlers run only when active is true.
 */
export function useDosKeys(
  handlers: {
    onEscape?: () => void;
    onEnter?: () => void;
    onInsert?: () => void;
    onDelete?: () => void;
    onF1?: () => void;
    onHome?: () => void;
    onEnd?: () => void;
    onPageUp?: () => void;
    onPageDown?: () => void;
    onArrowUp?: () => void;
    onArrowDown?: () => void;
    onArrowLeft?: () => void;
    onArrowRight?: () => void;
    onCtrlHome?: () => void;
    onCtrlW?: () => void;
    onChar?: (ch: string, e: KeyboardEvent) => boolean | void;
    /** When true, arrow/page keys work even while focused in an input */
    forceNav?: boolean;
  },
  active = true
) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!active) return;

    const onKey = (e: KeyboardEvent) => {
      const h = ref.current;
      const tag = (e.target as HTMLElement)?.tagName;
      const inField =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        h.onEscape?.();
        return;
      }
      if (e.key === "Insert") {
        e.preventDefault();
        e.stopPropagation();
        h.onInsert?.();
        return;
      }
      if (e.key === "F1") {
        e.preventDefault();
        h.onF1?.();
        return;
      }
      if (e.ctrlKey && (e.key === "w" || e.key === "W")) {
        e.preventDefault();
        h.onCtrlW?.();
        return;
      }
      if (e.ctrlKey && e.key === "Home") {
        e.preventDefault();
        h.onCtrlHome?.();
        return;
      }

      if (
        isArrowKey(e.key) &&
        !e.altKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.shiftKey &&
        isArrowField(e.target)
      ) {
        if (!h.forceNav) {
          if (tryMoveFieldFocus(e.target, e.key)) {
            mutePointerHover();
            e.preventDefault();
            e.stopPropagation();
          }
          // Leave the key to the control (caret, select option, date segment)
          // when focus did not move. Don't also run list/menu handlers.
          return;
        }
        // Browse lists keep Up/Down while a search box is focused.
        // Left/Right stay with the caret so the search text is editable.
        if (
          (e.key === "ArrowLeft" || e.key === "ArrowRight") &&
          keepsHorizontalCaret(e.target)
        ) {
          return;
        }
      }

      if (inField && !h.forceNav && !e.ctrlKey) {
        return;
      }

      switch (e.key) {
        case "Enter":
          if (inField && tag === "TEXTAREA") return;
          e.preventDefault();
          h.onEnter?.();
          break;
        case "Delete":
          if (inField && !h.forceNav) return;
          e.preventDefault();
          h.onDelete?.();
          break;
        case "Home":
          if (inField && !h.forceNav) return;
          e.preventDefault();
          h.onHome?.();
          break;
        case "End":
          if (inField && !h.forceNav) return;
          e.preventDefault();
          h.onEnd?.();
          break;
        case "PageUp":
          e.preventDefault();
          h.onPageUp?.();
          break;
        case "PageDown":
          e.preventDefault();
          h.onPageDown?.();
          break;
        case "ArrowUp":
        case "ArrowDown":
        case "ArrowLeft":
        case "ArrowRight": {
          if (inField && e.ctrlKey) return;
          const forward = e.key === "ArrowDown" || e.key === "ArrowRight";
          const handler =
            e.key === "ArrowUp"
              ? h.onArrowUp
              : e.key === "ArrowDown"
                ? h.onArrowDown
                : e.key === "ArrowLeft"
                  ? (h.onArrowLeft ?? h.onArrowUp)
                  : (h.onArrowRight ?? h.onArrowDown);
          if (!handler) {
            const root = activeFieldRoot();
            if (root && focusFieldEdge(root, forward ? 1 : -1)) {
              mutePointerHover();
              e.preventDefault();
              break;
            }
          }
          if (handler) mutePointerHover();
          e.preventDefault();
          handler?.();
          break;
        }
        default:
          if (!e.ctrlKey && !e.altKey && e.key.length === 1 && !inField) {
            const handled = h.onChar?.(e.key, e);
            if (handled) e.preventDefault();
          }
      }
    };

    const onStatusClick = (ev: Event) => {
      const key = (ev as CustomEvent<string>).detail;
      if (typeof key !== "string") return;
      const h = ref.current;
      switch (key) {
        case "Esc":
          h.onEscape?.();
          return;
        case "Ins":
          h.onInsert?.();
          return;
        case "Del":
          h.onDelete?.();
          return;
        case "Enter":
          h.onEnter?.();
          return;
        case "F1":
          h.onF1?.();
          return;
        case "Home":
          h.onHome?.();
          return;
        case "End":
          h.onEnd?.();
          return;
        case "PgUp":
          h.onPageUp?.();
          return;
        case "PgDn":
          h.onPageDown?.();
          return;
        case "Ctrl-Home":
        case "Cntr_Home":
          h.onCtrlHome?.();
          return;
        case "Ctrl-W":
        case "Cntr_W":
          h.onCtrlW?.();
          return;
        case "↑↓":
          h.onArrowDown?.();
          return;
        default: {
          const ch = key === "(A)" ? "A" : key.length === 1 ? key : "";
          if (ch) h.onChar?.(ch, ev as unknown as KeyboardEvent);
        }
      }
    };

    window.addEventListener("keydown", onKey, true);
    window.addEventListener(STATUS_KEY_CLICK, onStatusClick);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener(STATUS_KEY_CLICK, onStatusClick);
    };
  }, [active]);
}

/** Browse list selection with keyboard */
export function useBrowseIndex(count: number) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (count === 0) setIndex(0);
    else if (index >= count) setIndex(count - 1);
  }, [count, index]);

  const up = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  const down = useCallback(() => {
    setIndex((i) => Math.min(Math.max(0, count - 1), i + 1));
  }, [count]);

  const pageUp = useCallback(() => {
    setIndex((i) => Math.max(0, i - 15));
  }, []);

  const pageDown = useCallback(() => {
    setIndex((i) => Math.min(Math.max(0, count - 1), i + 15));
  }, [count]);

  const home = useCallback(() => setIndex(0), []);
  const end = useCallback(
    () => setIndex(Math.max(0, count - 1)),
    [count]
  );

  return { index, setIndex, up, down, pageUp, pageDown, home, end };
}

const FIT_MIN = 0.45;

/** Scale so `needed` content width fits inside `avail` window width. */
export function computeFitScale(
  avail: number,
  needed: number,
  current = 1
): number {
  if (avail <= 0 || needed <= 0) return 1;
  if (needed <= avail) {
    if (current >= 1) return 1;
    if (needed >= avail * 0.97) return current;
    return Math.min(1, current * (avail / needed));
  }
  return Math.max(FIT_MIN, current * (avail / needed));
}

function maxScrollWidth(root: HTMLElement): number {
  let max = 0;
  const walk = (el: Element) => {
    if (!(el instanceof HTMLElement)) return;
    if (el.classList.contains("print-preview-overlay")) return;
    max = Math.max(max, el.scrollWidth);
    for (const child of el.children) walk(child);
  };
  walk(root);
  return max;
}

/**
 * Shrinks root type (`--fit-scale`) whenever a screen is wider than the window.
 * Type grows back to 1 when the window (or a narrower screen) has room.
 */
export function useFitToWidth(rootRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const doc = document.documentElement;
    let frame = 0;
    let applying = false;

    const apply = () => {
      if (applying) return;
      applying = true;
      const current =
        parseFloat(doc.style.getPropertyValue("--fit-scale")) || 1;
      const next = computeFitScale(
        root.clientWidth,
        maxScrollWidth(root),
        current
      );
      if (Math.abs(next - current) > 0.004) {
        doc.style.setProperty("--fit-scale", next.toFixed(4));
      }
      requestAnimationFrame(() => {
        applying = false;
      });
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    };

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(schedule)
        : null;
    ro?.observe(root);
    const mo =
      typeof MutationObserver !== "undefined"
        ? new MutationObserver(schedule)
        : null;
    mo?.observe(root, { childList: true, subtree: true, characterData: true });
    window.addEventListener("resize", schedule);
    apply();
    return () => {
      ro?.disconnect();
      mo?.disconnect();
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
      doc.style.removeProperty("--fit-scale");
    };
  }, [rootRef]);
}
