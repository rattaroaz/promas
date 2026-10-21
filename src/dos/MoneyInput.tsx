import { useEffect, useRef, useState } from "react";
import {
  formatMoneyInput,
  moneyDraftIsEmpty,
  parseMoneyDraft,
  sanitizeMoneyDraft,
} from "./moneyFormat";

type MoneyInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "inputMode"
> & {
  value: number | null | undefined;
  onValueChange: (value: number) => void;
  /**
   * Stored zero displays as a blank box. Invoice line prices use this so a
   * line with no price, including Occupied, stays empty.
   */
  blankZero?: boolean;
};

/**
 * Money field. The stored value stays a number. Cents are applied only when
 * the user leaves the field or presses Enter, so typing does not move the caret.
 */
export function MoneyInput({
  value,
  onValueChange,
  blankZero = false,
  onBlur,
  onFocus,
  onKeyDown,
  ...rest
}: MoneyInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [committedEmpty, setCommittedEmpty] = useState(false);
  const dirty = useRef(false);
  const echoed = useRef(value);

  useEffect(() => {
    if (dirty.current) return;
    if (Object.is(value, echoed.current)) return;
    echoed.current = value;
    setCommittedEmpty(false);
    setDraft(null);
  }, [value]);

  const blank =
    committedEmpty ||
    value == null ||
    !Number.isFinite(value) ||
    (blankZero && value === 0);
  const shown = draft !== null ? draft : blank ? "" : formatMoneyInput(value);

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      value={shown}
      onFocus={(e) => {
        dirty.current = false;
        setDraft(e.currentTarget.value);
        onFocus?.(e);
      }}
      onChange={(e) => {
        const next = sanitizeMoneyDraft(e.target.value);
        if (next !== e.target.value) e.target.value = next;
        dirty.current = true;
        setDraft(next);
        const parsed = parseMoneyDraft(next);
        echoed.current = parsed;
        onValueChange(parsed);
      }}
      onBlur={(e) => {
        if (dirty.current) {
          setCommittedEmpty(moneyDraftIsEmpty(e.currentTarget.value));
        }
        dirty.current = false;
        setDraft(null);
        onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
        onKeyDown?.(e);
      }}
    />
  );
}
