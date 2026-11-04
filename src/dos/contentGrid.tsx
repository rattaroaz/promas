import { CSSProperties, ReactNode } from "react";

/**
 * Property browse. Number columns stay on their text. Street takes the
 * leftover width and wraps, but it does not shrink below its longest word,
 * so the address cannot paint into the next column. The gap stays 16px.
 */
export const PROPERTY_LIST_COLUMNS =
  "min-content max-content minmax(min-content, 1fr) min-content max-content max-content min-content";

/**
 * Invoice browse. Every track can shrink. The list scrolls vertically
 * instead of scaling the type down to fit nine max-content columns.
 */
export const INVOICE_LIST_COLUMNS =
  "minmax(12ch, max-content) minmax(0, 0.8fr) minmax(0, 0.45fr) minmax(0, 0.7fr) minmax(0, 0.45fr) minmax(0, 0.75fr) minmax(0, 0.75fr) minmax(0, 0.9fr) minmax(0, 0.7fr)";

/**
 * One max-content track per column. `shrinkColumn` (0-based) is
 * minmax(16ch, max-content): the full value when the row fits, and no
 * narrower than 16ch when it would otherwise overflow the window.
 * `softColumns` may shrink to 8ch (city, contact) so a long street still
 * fits the window at the viewport font instead of shrinking every screen.
 */
export function contentColumns(
  count: number,
  shrinkColumn?: number,
  softColumns: readonly number[] = []
): CSSProperties {
  if (shrinkColumn == null && softColumns.length === 0) {
    return { gridTemplateColumns: `repeat(${count}, max-content)` };
  }
  const soft = new Set(softColumns);
  const tracks = Array.from({ length: count }, (_, index) => {
    if (index === shrinkColumn) return "minmax(16ch, max-content)";
    if (soft.has(index)) return "minmax(8ch, max-content)";
    return "max-content";
  });
  return { gridTemplateColumns: tracks.join(" ") };
}

/**
 * Scrollable list pane whose columns are as wide as the widest cell or header,
 * with the same gap between every column.
 */
export function ContentGrid({
  columns,
  shrinkColumn,
  softColumns,
  template,
  className,
  children,
}: {
  columns: number;
  shrinkColumn?: number;
  softColumns?: readonly number[];
  template?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`content-grid dos-browse-body${className ? ` ${className}` : ""}`}
      style={
        template
          ? { gridTemplateColumns: template }
          : contentColumns(columns, shrinkColumn, softColumns)
      }
    >
      {children}
    </div>
  );
}
