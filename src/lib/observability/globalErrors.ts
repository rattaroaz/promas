import { log } from "./logger";
import { noteApiError } from "./state";

let installed = false;

/** Capture uncaught errors / promise rejections into the observability ring. */
export function installGlobalErrorHandlers(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (ev) => {
    const message = ev.message || "Unknown error";
    log.error("app", "uncaught error", {
      message,
      source: ev.filename || undefined,
      line: ev.lineno || undefined,
      col: ev.colno || undefined,
    });
    noteApiError(message);
  });

  window.addEventListener("unhandledrejection", (ev) => {
    const reason = ev.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : String(reason);
    log.error("app", "unhandled rejection", {
      message,
      stack:
        reason instanceof Error ? reason.stack?.slice(0, 400) : undefined,
    });
    noteApiError(message);
  });
}

/** Test helper — allows reinstall after reset. */
export function resetGlobalErrorHandlersForTests(): void {
  installed = false;
}
