import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getAppState,
  log,
  resetObservabilityForTests,
} from "./index";
import {
  installGlobalErrorHandlers,
  resetGlobalErrorHandlersForTests,
} from "./globalErrors";

describe("global error handlers", () => {
  beforeEach(() => {
    resetObservabilityForTests();
    resetGlobalErrorHandlersForTests();
    installGlobalErrorHandlers();
  });

  afterEach(() => {
    resetGlobalErrorHandlersForTests();
  });

  it("logs uncaught ErrorEvent", () => {
    window.dispatchEvent(
      new ErrorEvent("error", {
        message: "window blew up",
        filename: "x.ts",
        lineno: 10,
        colno: 2,
      })
    );
    expect(
      log.getRecent().some(
        (e) => e.message === "uncaught error" && e.meta?.message === "window blew up"
      )
    ).toBe(true);
    expect(getAppState().lastApiError).toContain("window blew up");
  });

  it("logs unhandledrejection", async () => {
    window.dispatchEvent(
      new PromiseRejectionEvent("unhandledrejection", {
        promise: Promise.reject(new Error("async fail")).catch(() => {}),
        reason: new Error("async fail"),
      })
    );
    expect(
      log.getRecent().some(
        (e) =>
          e.message === "unhandled rejection" && e.meta?.message === "async fail"
      )
    ).toBe(true);
    expect(getAppState().lastApiError).toContain("async fail");
  });
});
