import { CSSProperties, ReactNode } from "react";

/**
 * One max-content track per column. `shrinkColumn` (0-based) is
 * minmax(16ch, max-content): the full value when the row fits, and no
 * narrower than 16ch when it would otherwise overflow the window.
 */
export function contentColumns(count: number, shrinkColumn?: number): CSSProperties {
  if (shrinkColumn == null) {
    return { gridTemplateColumns: `repeat(${count}, max-content)` };
  }
  const tracks = Array.from({ length: count }, (_, index) =>
    index === shrinkColumn ? "minmax(16ch, max-content)" : "max-content"
  );
  return { gridTemplateColumns: tracks.join(" ") };
}

/**
 * Scrollable list pane whose columns are as wide as the widest cell or header,
 * with the same gap between every column.
 */
export function ContentGrid({
  columns,
  shrinkColumn,
  children,
}: {
  columns: number;
  shrinkColumn?: number;
  children: ReactNode;
}) {
  return (
    <div className="content-grid dos-browse-body" style={contentColumns(columns, shrinkColumn)}>
      {children}
    </div>
  );
}
