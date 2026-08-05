import type { MetricSnapshot } from "./types";

type Timing = {
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
  lastMs: number;
};

const counters = new Map<string, number>();
const timings = new Map<string, Timing>();

function keyWithTags(name: string, tags?: Record<string, string>): string {
  if (!tags || Object.keys(tags).length === 0) return name;
  const parts = Object.keys(tags)
    .sort()
    .map((k) => `${k}=${tags[k]}`);
  return `${name}{${parts.join(",")}}`;
}

export const metrics = {
  inc(name: string, tags?: Record<string, string>, by = 1): void {
    const key = keyWithTags(name, tags);
    counters.set(key, (counters.get(key) ?? 0) + by);
  },

  observe(name: string, durationMs: number, tags?: Record<string, string>): void {
    const key = keyWithTags(name, tags);
    const prev = timings.get(key);
    if (!prev) {
      timings.set(key, {
        count: 1,
        totalMs: durationMs,
        minMs: durationMs,
        maxMs: durationMs,
        lastMs: durationMs,
      });
      return;
    }
    prev.count += 1;
    prev.totalMs += durationMs;
    prev.minMs = Math.min(prev.minMs, durationMs);
    prev.maxMs = Math.max(prev.maxMs, durationMs);
    prev.lastMs = durationMs;
  },

  snapshot(): MetricSnapshot {
    const c: Record<string, number> = {};
    counters.forEach((v, k) => {
      c[k] = v;
    });
    const t: MetricSnapshot["timings"] = {};
    timings.forEach((v, k) => {
      t[k] = { ...v };
    });
    return { counters: c, timings: t };
  },

  reset(): void {
    counters.clear();
    timings.clear();
  },

  formatSummary(maxLines = 24): string {
    const snap = metrics.snapshot();
    const lines: string[] = ["--- counters ---"];
    const counterKeys = Object.keys(snap.counters).sort();
    if (counterKeys.length === 0) lines.push("(none)");
    for (const k of counterKeys.slice(0, maxLines)) {
      lines.push(`${k}: ${snap.counters[k]}`);
    }
    lines.push("--- timings (ms) ---");
    const timingKeys = Object.keys(snap.timings).sort();
    if (timingKeys.length === 0) lines.push("(none)");
    for (const k of timingKeys.slice(0, maxLines)) {
      const t = snap.timings[k];
      const avg = t.count ? (t.totalMs / t.count).toFixed(1) : "0";
      lines.push(
        `${k}: n=${t.count} last=${t.lastMs.toFixed(1)} avg=${avg} min=${t.minMs.toFixed(1)} max=${t.maxMs.toFixed(1)}`
      );
    }
    return lines.join("\n");
  },
};
