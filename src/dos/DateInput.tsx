import { InputHTMLAttributes } from "react";

/** Local calendar YYYY-MM-DD (not UTC — avoids timezone day-shift). */
export function localIsoDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addYears(iso: string, years: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y + years, m - 1, d);
  return localIsoDate(dt);
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /**
   * Years after today still allowed (e.g. invoice due dates).
   * Default 0 — calendar stops at today so the year list is past-oriented
   * instead of scrolling into the far future (browser default).
   */
  allowFutureYears?: number;
  /** Earliest selectable year (default 1900). */
  minYear?: number;
};

/**
 * DOS-styled date field. Constrains the native picker so year selection
 * defaults to prior years rather than future years.
 */
export function DateInput({
  allowFutureYears = 0,
  minYear = 1900,
  className = "dos-input w12",
  max,
  min,
  ...rest
}: Props) {
  const today = localIsoDate();
  const resolvedMax =
    max ??
    (allowFutureYears > 0 ? addYears(today, allowFutureYears) : today);
  const resolvedMin = min ?? `${minYear}-01-01`;

  return (
    <input
      type="date"
      className={className}
      min={resolvedMin}
      max={resolvedMax}
      {...rest}
    />
  );
}
