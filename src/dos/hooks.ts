import { useEffect, useLayoutEffect, useCallback, useState, useRef } from "react";
import type { RefObject } from "react";
import { STATUS_KEY_CLICK } from "./Shell";

export type KeyHandler = (e: KeyboardEvent) => boolean | void;

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
          if (inField && !h.forceNav) return;
          e.preventDefault();
          h.onArrowUp?.();
          break;
        case "ArrowDown":
          if (inField && !h.forceNav) return;
          e.preventDefault();
          h.onArrowDown?.();
          break;
        case "ArrowLeft":
          if (inField && !h.forceNav) return;
          e.preventDefault();
          h.onArrowLeft?.();
          break;
        case "ArrowRight":
          if (inField && !h.forceNav) return;
          e.preventDefault();
          h.onArrowRight?.();
          break;
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
