/** Fixed-width string helpers matching Clipper field layout */

export function padR(s: string | number | null | undefined, n: number): string {
  const t = String(s ?? "");
  if (t.length >= n) return t.slice(0, n);
  return t + " ".repeat(n - t.length);
}

export function padL(s: string | number | null | undefined, n: number): string {
  const t = String(s ?? "");
  if (t.length >= n) return t.slice(0, n);
  return " ".repeat(n - t.length) + t;
}

/** Join fixed-width columns with three spaces so values never run together. */
export function cols(
  ...parts: Array<string | number | null | undefined>
): string {
  return parts.map((p) => String(p ?? "")).join("   ");
}

export function money(n: number | null | undefined): string {
  const v = n ?? 0;
  const neg = v < 0;
  const abs = Math.abs(v).toFixed(2);
  const withCommas = abs.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return neg ? `(${withCommas})` : withCommas;
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "  /  /    ";
  if (d.length === 10 && d.includes("-")) {
    const [y, m, day] = d.split("-");
    return `${m}/${day}/${y}`;
  }
  return d;
}

export function today(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function labelDots(label: string, width = 16): string {
  if (label.length >= width) return label;
  return label + ".".repeat(width - label.length);
}

/** Highlight first occurrence of letter for menu accel display */
export function withAccel(text: string, accel: string): { before: string; accel: string; after: string } {
  const i = text.toLowerCase().indexOf(accel.toLowerCase());
  if (i < 0) return { before: text, accel: "", after: "" };
  return {
    before: text.slice(0, i),
    accel: text[i],
    after: text.slice(i + 1),
  };
}

/**
 * Natural/numeric-aware comparison for strings containing numbers.
 * Handles units like "1", "1A", "2", "10", "12", "B2" so that
 * "2" comes before "10" rather than lexicographic "10" before "2".
 */
export function naturalCompare(a: string, b: string): number {
  const aStr = String(a ?? "").trim();
  const bStr = String(b ?? "").trim();

  if (aStr === bStr) return 0;
  if (!aStr) return -1;
  if (!bStr) return 1;

  const aParts = aStr.match(/(\d+|\D+)/g) || [];
  const bParts = bStr.match(/(\d+|\D+)/g) || [];

  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aPart = aParts[i] || "";
    const bPart = bParts[i] || "";

    if (!aPart) return -1;
    if (!bPart) return 1;

    const aNum = parseInt(aPart, 10);
    const bNum = parseInt(bPart, 10);

    if (!isNaN(aNum) && !isNaN(bNum)) {
      if (aNum !== bNum) return aNum - bNum;
    } else {
      const cmp = aPart.localeCompare(bPart);
      if (cmp !== 0) return cmp;
    }
  }

  return 0;
}
