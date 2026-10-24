import {
  Children,
  cloneElement,
  Fragment,
  isValidElement,
  useId,
  type ReactNode,
} from "react";
import { labelDots } from "./utils";

const NATIVE_CONTROLS = new Set(["input", "select", "textarea"]);

/**
 * Points the label at the field's one control so the label names it. A field
 * that wraps several elements, or an element that is not a control, keeps an
 * unlinked label. Control components must pass `id` through to their input.
 */
function useLabelledControl(children: ReactNode): { htmlFor?: string; control: ReactNode } {
  const autoId = useId();
  const items = Children.toArray(children);
  const only = items.length === 1 ? items[0] : null;
  if (!isValidElement<{ id?: string }>(only) || only.type === Fragment) return { control: children };
  if (typeof only.type === "string" && !NATIVE_CONTROLS.has(only.type)) return { control: children };
  const id = only.props.id ?? autoId;
  return { htmlFor: id, control: cloneElement(only, { id }) };
}

/** Clipper search GET: Company NO....... [input] */
export function DotField({
  label,
  width = 16,
  children,
}: {
  label: string;
  width?: number;
  children: ReactNode;
}) {
  const { htmlFor, control } = useLabelledControl(children);
  return (
    <div className="dos-field">
      <label htmlFor={htmlFor} style={{ minWidth: `min(${width + 1}ch, 100%)` }}>
        {label}
        <span className="dots" aria-hidden="true">
          {".".repeat(Math.max(1, width - label.length))}
        </span>
      </label>
      {control}
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
  children: ReactNode;
}) {
  const { htmlFor, control } = useLabelledControl(children);
  const pad = label.length >= width - 1 ? "" : " ".repeat(width - 1 - label.length);
  return (
    <div className="dos-field">
      <label htmlFor={htmlFor} style={{ minWidth: `min(${width}ch, 100%)`, whiteSpace: "pre" }}>
        {label}
        <span aria-hidden="true">{pad}:</span>
      </label>
      {control}
    </div>
  );
}

/** Search line: Search: [input]. The colon stays out of the control's name. */
export function InlineField({ label, children }: { label: string; children: ReactNode }) {
  const { htmlFor, control } = useLabelledControl(children);
  const [, name, colon] = /^(.*?)(\s*:)?$/.exec(label) ?? [];
  return (
    <>
      <label htmlFor={htmlFor}>
        {name}
        {colon && <span aria-hidden="true">{colon}</span>}
      </label>
      {control}
    </>
  );
}

export { labelDots };
