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
  return new Date().toISOString().slice(0, 10);
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
