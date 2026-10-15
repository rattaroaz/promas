import { ReactNode } from "react";

/** Map a status-bar key caption to a keyboard event useDosKeys understands. */
export function statusKeyEvent(key: string): KeyboardEventInit | null {
  switch (key.trim()) {
    case "Esc":
      return { key: "Escape" };
    case "Ins":
      return { key: "Insert" };
    case "Del":
      return { key: "Delete" };
    case "Enter":
      return { key: "Enter" };
    case "F1":
      return { key: "F1" };
    case "Home":
      return { key: "Home" };
    case "End":
      return { key: "End" };
    case "PgUp":
      return { key: "PageUp" };
    case "PgDn":
      return { key: "PageDown" };
    case "Ctrl-Home":
    case "Cntr_Home":
      return { key: "Home", ctrlKey: true };
    case "Ctrl-W":
    case "Cntr_W":
      return { key: "w", ctrlKey: true };
    case "(A)":
      return { key: "A" };
    case "↑↓":
      return { key: "ArrowDown" };
    case "?":
      return { key: "?" };
    default:
      if (key.trim().length === 1) return { key: key.trim() };
      return null;
  }
}

/** Fired when a status-bar hint is clicked. WebView ignores synthetic keydowns. */
export const STATUS_KEY_CLICK = "promas:status-key";

export function activateStatusKey(key: string) {
  if (statusKeyEvent(key) == null) return;
  window.dispatchEvent(
    new CustomEvent(STATUS_KEY_CLICK, { detail: key.trim() })
  );
}

/** Left-to-right order for every status bar. Esc is always first. */
const STATUS_KEY_RANK: Record<string, number> = {
  Esc: 0,
  Enter: 1,
  Ins: 2,
  "Ctrl-Home": 3,
  Cntr_Home: 3,
  Home: 4,
  Del: 5,
  PgUp: 6,
  PgDn: 7,
  End: 8,
  "Ctrl-W": 9,
  Cntr_W: 9,
  F1: 10,
  "↑↓": 11,
  "?": 12,
  "1-9": 13,
};

function statusKeyRank(key: string): number {
  const k = key.trim();
  if (k in STATUS_KEY_RANK) return STATUS_KEY_RANK[k];
  const letter = k.replace(/[()]/g, "");
  if (letter.length === 1) return 20 + letter.toUpperCase().charCodeAt(0);
  return 50;
}

export function orderStatusKeys<T extends { key: string; label?: string }>(
  keys: T[]
): T[] {
  const esc = keys.find((k) => k.key.trim() === "Esc");
  const rest = keys
    .filter((k) => k.key.trim() !== "Esc")
    .sort((a, b) => statusKeyRank(a.key) - statusKeyRank(b.key));
  const head = (esc ?? ({ key: "Esc", label: "Exit" } as T));
  return [head, ...rest];
}

function StatusKey({
  k,
  pinned,
}: {
  k: { key: string; label: string };
  pinned?: boolean;
}) {
  const clickable = statusKeyEvent(k.key) != null;
  const caption = k.label ? `${k.key} ${k.label}` : k.key;
  const className = [
    clickable ? "dos-status-action" : "",
    pinned ? "dos-status-esc" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const inner = (
    <>
      <span className="key">{k.key}</span>
      {k.label ? <span className="hint">{k.label}</span> : <span className="hint"> </span>}
    </>
  );
  if (!clickable) {
    return (
      <span key={k.key + k.label} className={className || undefined}>
        {inner}
      </span>
    );
  }
  return (
    <button
      key={k.key + k.label}
      type="button"
      className={className}
      onClick={() => activateStatusKey(k.key)}
      aria-label={caption}
    >
      {inner}
    </button>
  );
}

export function StatusBar({
  keys,
}: {
  keys: { key: string; label: string }[];
}) {
  const ordered = orderStatusKeys(keys);
  return (
    <div className="dos-statusbar">
      {ordered.map((k, i) => (
        <StatusKey key={k.key + k.label} k={k} pinned={i === 0} />
      ))}
    </div>
  );
}

export function TitleBar({
  title,
  left,
  right,
}: {
  title: string;
  left?: string;
  right?: string;
}) {
  return (
    <div className="dos-titlebar">
      {left && <span className="left">{left}</span>}
      {right && <span className="right">{right}</span>}
      {title}
    </div>
  );
}

export function MessageBar({
  text,
  kind = "default",
}: {
  text: string;
  kind?: "default" | "error" | "info";
}) {
  return (
    <div className={`dos-messagebar ${kind !== "default" ? kind : ""}`}>
      {text || "\u00A0"}
    </div>
  );
}

export function Screen({
  children,
  statusKeys,
  title,
  message,
  messageKind,
  left,
  right,
}: {
  children: ReactNode;
  statusKeys?: { key: string; label: string }[];
  title?: string;
  message?: string;
  messageKind?: "default" | "error" | "info";
  left?: string;
  right?: string;
}) {
  return (
    <div className="dos-screen">
      <StatusBar keys={statusKeys ?? [{ key: "Esc", label: "Exit" }]} />
      {title && <TitleBar title={title} left={left} right={right} />}
      <div className="dos-content">{children}</div>
      <MessageBar text={message ?? ""} kind={messageKind} />
    </div>
  );
}

export function Dialog({
  title,
  children,
  foot,
  wide,
  red,
}: {
  title: string;
  children: ReactNode;
  foot?: string;
  wide?: boolean;
  red?: boolean;
}) {
  return (
    <div className="dos-overlay">
      <div className={`dos-dialog ${wide ? "wide" : ""} ${red ? "red" : ""}`}>
        <div className="dlg-title"> {title} </div>
        <div className="dlg-body">{children}</div>
        {foot && <div className="dlg-foot">{foot}</div>}
      </div>
    </div>
  );
}

export function Prompt({
  question,
  onYes,
  onNo,
}: {
  question: string;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div className="dos-overlay">
      <div className="dos-prompt" tabIndex={0}>
        <div className="q">{question}</div>
        <div style={{ marginTop: "0.6em", display: "flex", gap: "2ch", justifyContent: "center" }}>
          <button className="dos-btn" onClick={onYes} autoFocus>
            Y
          </button>
          <button className="dos-btn" onClick={onNo}>
            N
          </button>
        </div>
      </div>
    </div>
  );
}

export function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="dos-overlay" onClick={onClose}>
      <div className="dos-help" onClick={(e) => e.stopPropagation()}>
        <h3> *** Function Key Description *** </h3>
        <pre>{`
 F1 = Help
 Ins = Add Data
 Del = Delete or Void Data
 Home= Diplay Company,Property Detail
 End = Print Data
 Cntr_Home = Edit Data
 Enter(Ret)= Default Data
 PgUp = Previous Data
 PgDn = Next Data
 Arrow Key = Up,Down Data
Press any key to continue ...
`}</pre>
        <div style={{ textAlign: "center", marginTop: "0.5em" }}>
          <button className="dos-btn" onClick={onClose} autoFocus>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

export const BROWSE_KEYS = [
  { key: "Esc", label: "" },
  { key: "Ins", label: "Add" },
  { key: "Ctrl-Home", label: "" },
  { key: "Del", label: "" },
  { key: "Home", label: "" },
  { key: "PgUp", label: "" },
  { key: "PgDn", label: "" },
  { key: "End", label: "" },
];

/** Company / property pick-list. */
export const SEARCH_BROWSE_KEYS = [
  { key: "Esc", label: "" },
  { key: "Ins", label: "Add" },
  { key: "Ctrl-Home", label: "" },
  { key: "PgUp", label: "" },
  { key: "PgDn", label: "" },
];

/** Cash receipts ledger. */
export const CASH_KEYS = [
  { key: "Esc", label: "" },
  { key: "Ins", label: "Add" },
  { key: "Home", label: "" },
  { key: "PgUp", label: "" },
  { key: "PgDn", label: "" },
  { key: "(A)", label: "uto_Receipt" },
];

export const MENU_KEYS = [
  { key: "Esc", label: "Exit" },
  { key: "Enter", label: "Run" },
  { key: "F1", label: "Help" },
  { key: "↑↓", label: "Select" },
  { key: "1-9", label: "Jump" },
];

export const FORM_KEYS = [
  { key: "Esc", label: "Cancel" },
  { key: "Cntr_W", label: "Save & Exit" },
  { key: "↑↓", label: "Edit=Arrow_Key" },
];
