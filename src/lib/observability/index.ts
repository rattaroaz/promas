import { APP_NAME, APP_VERSION } from "../constants";
import { log, resetLoggerForTests } from "./logger";
import { metrics } from "./metrics";
import { getAppState, resetAppStateForTests } from "./state";
import {
  clearSpans,
  formatRecentSpans,
  getRecentSpans,
} from "./tracing";
import type { BackendDiagnostics, DiagnosticsBundle } from "./types";

export { log } from "./logger";
export { metrics } from "./metrics";
export {
  startSpan,
  getRecentSpans,
  getActiveSpanCount,
  clearSpans,
  formatRecentSpans,
} from "./tracing";
export {
  setCurrentScreen,
  noteApiError,
  noteUpdateOutcome,
  getAppState,
  subscribeAppState,
} from "./state";
export { installGlobalErrorHandlers } from "./globalErrors";
export type {
  LogLevel,
  LogCategory,
  LogEvent,
  SpanRecord,
  MetricSnapshot,
  AppInternalState,
  DiagnosticsBundle,
  BackendDiagnostics,
} from "./types";

export function buildDiagnosticsBundle(
  backend?: BackendDiagnostics | null
): DiagnosticsBundle {
  return {
    generatedAt: new Date().toISOString(),
    appName: APP_NAME,
    appVersion: APP_VERSION,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    screen: getAppState().currentScreen,
    state: getAppState(),
    metrics: metrics.snapshot(),
    recentLogs: log.getRecent(200),
    recentSpans: getRecentSpans().slice(-100),
    backend: backend ?? null,
  };
}

export function formatDiagnosticsText(
  backend?: BackendDiagnostics | null
): string {
  const bundle = buildDiagnosticsBundle(backend);
  const state = bundle.state;
  const lines = [
    `=== ${bundle.appName} Diagnostics ===`,
    `generated: ${bundle.generatedAt}`,
    `version: ${bundle.appVersion}`,
    `screen: ${bundle.screen}`,
    `sessionStarted: ${new Date(state.sessionStartedAt).toISOString()}`,
    `lastApiError: ${state.lastApiError ?? "(none)"}`,
    `lastUpdate: ${state.lastUpdateOutcome ?? "(none)"}`,
    `pendingSpans: ${state.pendingSpans}`,
    "",
    "NOTE: May include local paths and environment details. Review before sharing.",
    "",
    "--- backend ---",
    backend
      ? [
          `dbPath: ${backend.dbPath}`,
          `logDir: ${backend.logDir}`,
          `crateVersion: ${backend.crateVersion}`,
          `target: ${backend.targetTriple}`,
          `host: ${backend.rustVersion}`,
        ].join("\n")
      : "(unavailable)",
    "",
    metrics.formatSummary(),
    "",
    "--- recent spans ---",
    formatRecentSpans(40),
    "",
    "--- recent logs ---",
    log.formatRecent(120),
  ];
  return lines.join("\n");
}

/** Reset all in-memory observability state (unit tests). */
export function resetObservabilityForTests(): void {
  resetLoggerForTests();
  resetAppStateForTests();
  clearSpans();
  metrics.reset();
}
