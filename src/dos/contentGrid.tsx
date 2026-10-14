import { CSSProperties, ReactNode } from "react";

/** One max-content track per column. Rows share the tracks via subgrid. */
export function contentColumns(count: number): CSSProperties {
  return { gridTemplateColumns: `repeat(${count}, max-content)` };
}

/**
 * Scrollable list pane whose columns are as wide as the widest cell or header,
 * with the same gap between every column.
 */
export function ContentGrid({
  columns,
  children,
}: {
  columns: number;
  children: ReactNode;
}) {
  return (
    <div className="content-grid dos-browse-body" style={contentColumns(columns)}>
      {children}
    </div>
  );
}
