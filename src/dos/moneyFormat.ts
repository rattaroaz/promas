/** Display helpers for price and money fields. Stored values stay numbers. */

const INCOMPLETE = new Set(["", "-", ".", "-.", "+", "+."]);

/** A draft the user has not finished (blank, lone sign, lone dot). */
export function moneyDraftIsEmpty(raw: string): boolean {
  return INCOMPLETE.has(raw.trim());
}

/**
 * Keep digits, one leading minus, and one decimal point.
 * Other characters are dropped so the field can stay a controlled string
 * without rewriting a normal keystroke.
 */
export function sanitizeMoneyDraft(raw: string): string {
  const cleaned = raw.replace(/[^\d.-]/g, "");
  let out = "";
  let dot = false;
  let i = 0;
  if (cleaned.startsWith("-")) {
    out = "-";
    i = 1;
  }
  for (; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === "-") continue;
    if (ch === ".") {
      if (dot) continue;
      dot = true;
      out += ".";
      continue;
    }
    out += ch;
  }
  return out;
}

/** Numeric value used by calculations. Incomplete drafts count as 0. */
export function parseMoneyDraft(raw: string): number {
  if (moneyDraftIsEmpty(raw)) return 0;
  const n = Number(raw.trim());
  return Number.isFinite(n) ? n : 0;
}

/**
 * Committed display. Empty stays empty. Any finite number, including 0,
 * is exactly two decimal places. The number itself is not rounded here
 * for storage — callers keep the parsed value.
 */
export function formatMoneyInput(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return value.toFixed(2);
}

/** What to show after blur or Enter. Empty drafts stay empty. */
export function commitMoneyDraft(raw: string): string {
  if (moneyDraftIsEmpty(raw)) return "";
  const n = Number(raw.trim());
  if (!Number.isFinite(n)) return "";
  return n.toFixed(2);
}
