import { RingBuffer } from "./ringBuffer";
import type { LogCategory, LogEvent, LogLevel } from "./types";

const MAX_EVENTS = 500;
const events = new RingBuffer<LogEvent>(MAX_EVENTS);
let seq = 0;

type Listener = (event: LogEvent) => void;
const listeners = new Set<Listener>();

const LEVEL_RANK: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
};

let minLevel: LogLevel = import.meta.env.DEV ? "debug" : "info";

function nextId(): string {
  seq += 1;
  return `log_${Date.now().toString(36)}_${seq}`;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[minLevel];
}

async function mirrorToTauri(level: LogLevel, line: string): Promise<void> {
  if (import.meta.env.VITE_E2E) return;
  try {
    const plugin = await import("@tauri-apps/plugin-log");
    switch (level) {
      case "trace":
        await plugin.trace(line);
        break;
      case "debug":
        await plugin.debug(line);
        break;
      case "info":
        await plugin.info(line);
        break;
      case "warn":
        await plugin.warn(line);
        break;
      case "error":
        await plugin.error(line);
        break;
    }
  } catch {
    // Not running inside Tauri / plugin unavailable
  }
}

function write(
  level: LogLevel,
  category: LogCategory,
  message: string,
  meta?: Record<string, unknown>,
  extra?: { errorId?: string; spanId?: string }
): LogEvent | null {
  if (!shouldLog(level)) return null;

  const spanFromMeta =
    meta && typeof meta.spanId === "string" ? meta.spanId : undefined;
  const event: LogEvent = {
    id: nextId(),
    ts: Date.now(),
    level,
    category,
    message,
    meta,
    errorId: extra?.errorId,
    spanId: extra?.spanId ?? spanFromMeta,
  };
  events.push(event);
  listeners.forEach((l) => l(event));

  const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
  const line = `[${category}] ${message}${metaStr}`;
  if (import.meta.env.DEV || level === "error" || level === "warn") {
    const fn =
      level === "error"
        ? console.error
        : level === "warn"
          ? console.warn
          : console.debug;
    fn(line);
  }
  void mirrorToTauri(level, line);
  return event;
}

export const log = {
  setMinLevel(level: LogLevel) {
    minLevel = level;
  },

  getMinLevel(): LogLevel {
    return minLevel;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getRecent(limit?: number): LogEvent[] {
    const all = events.toArray();
    if (limit == null || limit >= all.length) return all;
    return all.slice(-limit);
  },

  clear() {
    events.clear();
  },

  trace(category: LogCategory, message: string, meta?: Record<string, unknown>) {
    return write("trace", category, message, meta);
  },
  debug(category: LogCategory, message: string, meta?: Record<string, unknown>) {
    return write("debug", category, message, meta);
  },
  info(category: LogCategory, message: string, meta?: Record<string, unknown>) {
    return write("info", category, message, meta);
  },
  warn(category: LogCategory, message: string, meta?: Record<string, unknown>) {
    return write("warn", category, message, meta);
  },
  error(
    category: LogCategory,
    message: string,
    meta?: Record<string, unknown>,
    errorId?: string
  ) {
    return write("error", category, message, meta, {
      errorId: errorId ?? nextId(),
    });
  },

  formatRecent(limit = 80): string {
    return log
      .getRecent(limit)
      .map((e) => {
        const t = new Date(e.ts).toISOString();
        const meta = e.meta ? ` ${JSON.stringify(e.meta)}` : "";
        const eid = e.errorId ? ` errorId=${e.errorId}` : "";
        const sid = e.spanId ? ` spanId=${e.spanId}` : "";
        return `${t} ${e.level.toUpperCase().padEnd(5)} [${e.category}] ${e.message}${meta}${eid}${sid}`;
      })
      .join("\n");
  },
};

export function resetLoggerForTests(): void {
  events.clear();
  listeners.clear();
  minLevel = "debug";
  seq = 0;
}
