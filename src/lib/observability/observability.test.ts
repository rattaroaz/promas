import { beforeEach, describe, expect, it } from "vitest";
import {
  buildDiagnosticsBundle,
  formatDiagnosticsText,
  getAppState,
  log,
  metrics,
  noteApiError,
  noteUpdateOutcome,
  resetObservabilityForTests,
  setCurrentScreen,
  startSpan,
} from "./index";

describe("observability suite", () => {
  beforeEach(() => {
    resetObservabilityForTests();
  });

  it("logs into the ring buffer with levels and categories", () => {
    log.info("app", "hello", { n: 1 });
    log.error("api", "boom", { cmd: "x" }, "err_1");
    const recent = log.getRecent();
    expect(recent.length).toBeGreaterThanOrEqual(2);
    expect(recent.some((e) => e.message === "hello")).toBe(true);
    expect(recent.some((e) => e.errorId === "err_1")).toBe(true);
  });

  it("tracks counters and timing stats", () => {
    metrics.inc("api.invoke", { cmd: "get_db_path" });
    metrics.inc("api.invoke", { cmd: "get_db_path" });
    metrics.observe("api.duration_ms", 12, { cmd: "get_db_path" });
    metrics.observe("api.duration_ms", 20, { cmd: "get_db_path" });
    const snap = metrics.snapshot();
    expect(snap.counters["api.invoke{cmd=get_db_path}"]).toBe(2);
    const t = snap.timings["api.duration_ms{cmd=get_db_path}"];
    expect(t.count).toBe(2);
    expect(t.minMs).toBe(12);
    expect(t.maxMs).toBe(20);
    expect(t.lastMs).toBe(20);
  });

  it("records span duration and outcome", () => {
    const span = startSpan("api", "demo");
    const ended = span.end({ ok: true, meta: { ms: 1 } });
    expect(ended.durationMs).toBeGreaterThanOrEqual(0);
    expect(ended.ok).toBe(true);
    expect(ended.name).toBe("demo");
  });

  it("tracks internal app state", () => {
    setCurrentScreen("settings");
    noteApiError("fail");
    noteUpdateOutcome("up_to_date");
    const state = getAppState();
    expect(state.currentScreen).toBe("settings");
    expect(state.lastApiError).toBe("fail");
    expect(state.lastUpdateOutcome).toBe("up_to_date");
  });

  it("builds a diagnostics text bundle", () => {
    log.info("ui", "nav");
    metrics.inc("ui.navigate", { screen: "main" });
    const text = formatDiagnosticsText({
      dbPath: "C:\\data\\promas.db",
      logDir: "C:\\logs",
      rustVersion: "x86_64-windows",
      crateVersion: "2.0.0",
      targetTriple: "x86_64-pc-windows-msvc",
    });
    expect(text).toContain("Diagnostics");
    expect(text).toContain("promas.db");
    expect(text).toContain("--- recent logs ---");
    expect(text).toContain("May include local paths");
    const bundle = buildDiagnosticsBundle(null);
    expect(bundle.appVersion).toBeTruthy();
    expect(bundle.recentLogs.length).toBeGreaterThan(0);
  });

  it("metrics reset clears counters", () => {
    metrics.inc("api.invoke", { cmd: "x" });
    metrics.reset();
    expect(Object.keys(metrics.snapshot().counters)).toHaveLength(0);
  });
});
