import { labelDots } from "./utils";

/** Clipper search GET: Company NO....... [input] */
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

/** Clipper GET form: Company NO  : [input] */
export function ColonField({
  label,
  width = 13,
  children,
}: {
  label: string;
  width?: number;
  children: React.ReactNode;
}) {
  const text = label.length >= width - 1 ? label : label.padEnd(width - 1, " ");
  return (
    <div className="dos-field">
      <label style={{ minWidth: `${width}ch`, whiteSpace: "pre" }}>
        {text}:
      </label>
      {children}
    </div>
  );
}

export { labelDots };
