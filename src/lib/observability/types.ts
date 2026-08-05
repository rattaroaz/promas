export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

export type LogCategory =
  | "app"
  | "api"
  | "ui"
  | "db"
  | "update"
  | "metrics"
  | "trace";

export interface LogEvent {
  id: string;
  ts: number;
  level: LogLevel;
  category: LogCategory;
  message: string;
  meta?: Record<string, unknown>;
  errorId?: string;
  spanId?: string;
}

export interface SpanRecord {
  id: string;
  name: string;
  category: LogCategory;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  ok?: boolean;
  meta?: Record<string, unknown>;
  error?: string;
}

export interface MetricSnapshot {
  counters: Record<string, number>;
  timings: Record<
    string,
    { count: number; totalMs: number; minMs: number; maxMs: number; lastMs: number }
  >;
}

export interface AppInternalState {
  sessionStartedAt: number;
  currentScreen: string;
  lastScreenChangeAt: number | null;
  lastApiError: string | null;
  lastApiErrorAt: number | null;
  lastUpdateOutcome: string | null;
  lastUpdateAt: number | null;
  pendingSpans: number;
}

export interface DiagnosticsBundle {
  generatedAt: string;
  appName: string;
  appVersion: string;
  userAgent: string;
  screen: string;
  state: AppInternalState;
  metrics: MetricSnapshot;
  recentLogs: LogEvent[];
  recentSpans: SpanRecord[];
  backend?: BackendDiagnostics | null;
}

export interface BackendDiagnostics {
  dbPath: string;
  logDir: string;
  rustVersion: string;
  crateVersion: string;
  targetTriple: string;
}
