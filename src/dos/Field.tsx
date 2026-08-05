import { labelDots } from "./utils";

/** Clipper-style field: Label........ [input] */
export function DotField({
  label,
  width = 16,
  children,
}: {
  label: string;
  width?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="dos-field">
      <label style={{ minWidth: `${width + 1}ch` }}>
        {label}
        <span className="dots">
          {".".repeat(Math.max(1, width - label.length))}
        </span>
      </label>
      {children}
    </div>
  );
}

export { labelDots };
