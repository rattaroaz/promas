import { CSSProperties, ReactNode } from "react";

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
  children,
}: {
  columns: number;
  shrinkColumn?: number;
  softColumns?: readonly number[];
  children: ReactNode;
}) {
  return (
    <div
      className="content-grid dos-browse-body"
      style={contentColumns(columns, shrinkColumn, softColumns)}
    >
      {children}
    </div>
  );
}
