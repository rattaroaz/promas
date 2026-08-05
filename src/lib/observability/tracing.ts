import { RingBuffer } from "./ringBuffer";
import type { LogCategory, SpanRecord } from "./types";

const MAX_SPANS = 200;
const recent = new RingBuffer<SpanRecord>(MAX_SPANS);
const active = new Map<string, SpanRecord>();
let seq = 0;

function nextId(): string {
  seq += 1;
  return `span_${Date.now().toString(36)}_${seq}`;
}

export interface SpanHandle {
  id: string;
  end(result?: { ok?: boolean; error?: string; meta?: Record<string, unknown> }): SpanRecord;
}

export function startSpan(
  category: LogCategory,
  name: string,
  meta?: Record<string, unknown>
): SpanHandle {
  const id = nextId();
  const record: SpanRecord = {
    id,
    name,
    category,
    startedAt: Date.now(),
    meta,
  };
  active.set(id, record);

  return {
    id,
    end(result) {
      const started = active.get(id) ?? record;
      active.delete(id);
      started.endedAt = Date.now();
      started.durationMs = started.endedAt - started.startedAt;
      started.ok = result?.ok ?? !result?.error;
      if (result?.error) started.error = result.error;
      if (result?.meta) {
        started.meta = { ...started.meta, ...result.meta };
      }
      recent.push({ ...started });
      return started;
    },
  };
}

export function getRecentSpans(): SpanRecord[] {
  return recent.toArray();
}

export function getActiveSpanCount(): number {
  return active.size;
}

export function clearSpans(): void {
  recent.clear();
  active.clear();
}

export function formatRecentSpans(limit = 30): string {
  const spans = getRecentSpans().slice(-limit).reverse();
  if (spans.length === 0) return "(no spans)";
  return spans
    .map((s) => {
      const dur = s.durationMs != null ? `${s.durationMs}ms` : "…";
      const status = s.ok === false ? "ERR" : s.ok ? "OK" : "…";
      const err = s.error ? ` ${s.error}` : "";
      return `[${status}] ${s.category}/${s.name} ${dur}${err}`;
    })
    .join("\n");
}
