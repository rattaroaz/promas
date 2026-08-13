import { ReactNode } from "react";

export function StatusBar({
  keys,
}: {
  keys: { key: string; label: string }[];
}) {
  return (
    <div className="dos-statusbar">
      {keys.map((k) => (
        <span key={k.key + k.label}>
          <span className="key">{k.key}</span>
          {k.label ? <span className="hint">{k.label}</span> : <span className="hint"> </span>}
        </span>
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
      {statusKeys && <StatusBar keys={statusKeys} />}
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
  { key: "Ins", label: "" },
  { key: "Ctrl-Home", label: "" },
  { key: "Del", label: "" },
  { key: "PgUp", label: "" },
  { key: "PgDn", label: "" },
  { key: "Home", label: "" },
  { key: "End", label: "" },
];

/** Company / property pick-list: Ins  Ctrl-Home  PgUp  PgDn  Esc */
export const SEARCH_BROWSE_KEYS = [
  { key: "Ins", label: "" },
  { key: "Ctrl-Home", label: "" },
  { key: "PgUp", label: "" },
  { key: "PgDn", label: "" },
  { key: "Esc", label: "" },
];

/** Cash receipts: Ins  Home  PgUp  PgDn  Esc  (A)uto_Receipt */
export const CASH_KEYS = [
  { key: "Ins", label: "" },
  { key: "Home", label: "" },
  { key: "PgUp", label: "" },
  { key: "PgDn", label: "" },
  { key: "Esc", label: "" },
  { key: "(A)", label: "uto_Receipt" },
];

export const MENU_KEYS = [
  { key: "↑↓", label: "Select" },
  { key: "Enter", label: "Run" },
  { key: "Esc", label: "Exit" },
  { key: "1-9", label: "Jump" },
  { key: "F1", label: "Help" },
];

export const FORM_KEYS = [
  { key: "Esc", label: "Cancel" },
  { key: "Cntr_W", label: "Save & Exit" },
  { key: "↑↓", label: "Edit=Arrow_Key" },
];
