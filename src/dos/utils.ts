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

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Today's local calendar date, YYYY-MM-DD. */
export function today(): string {
  return isoDate(new Date());
}

/** The calendar date `days` after a YYYY-MM-DD date. Counts local days, so a clock change never shifts it. */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return isoDate(new Date(y, m - 1, d + days));
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
