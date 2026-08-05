import { useEffect, useCallback, useState, useRef } from "react";

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
        case "Insert":
          e.preventDefault();
          h.onInsert?.();
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

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
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
