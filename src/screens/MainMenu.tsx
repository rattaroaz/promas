import { useState, useEffect } from "react";
import { useDosKeys } from "../dos/hooks";
import { Screen, MENU_KEYS, HelpOverlay, Prompt } from "../dos/Shell";

export type MainAction =
  | "estimate"
  | "workorder"
  | "invoice"
  | "cash"
  | "material"
  | "reports"
  | "misc"
  | "settings"
  | "quit";

const ITEMS: { id: MainAction; num: string; label: string; accel: string }[] = [
  { id: "estimate", num: "1", label: "Estimate Process", accel: "E" },
  { id: "workorder", num: "2", label: "Work Order Process", accel: "W" },
  { id: "invoice", num: "3", label: "Invoice Process", accel: "I" },
  { id: "cash", num: "4", label: "Cash Receipts Process", accel: "C" },
  { id: "material", num: "5", label: "Material Process", accel: "M" },
  { id: "reports", num: "6", label: "Reports Menu", accel: "R" },
  { id: "misc", num: "7", label: "Miscellaneous", accel: "S" },
  { id: "settings", num: "8", label: "Settings", accel: "T" },
];

export function MainMenu({ onSelect }: { onSelect: (a: MainAction) => void }) {
  const [hot, setHot] = useState(0);
  const [help, setHelp] = useState(false);
  const [quitAsk, setQuitAsk] = useState(false);
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const dateStr = clock.toLocaleDateString("en-US", {
    weekday: "short",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
  const timeStr = clock.toLocaleTimeString("en-US", { hour12: false });

  useDosKeys(
    {
      onArrowUp: () => setHot((h) => (h <= 0 ? ITEMS.length - 1 : h - 1)),
      onArrowDown: () => setHot((h) => (h >= ITEMS.length - 1 ? 0 : h + 1)),
      onHome: () => setHot(0),
      onEnd: () => setHot(ITEMS.length - 1),
      onEnter: () => {
        if (help) {
          setHelp(false);
          return;
        }
        if (quitAsk) return;
        onSelect(ITEMS[hot].id);
      },
      onEscape: () => {
        if (help) setHelp(false);
        else if (quitAsk) setQuitAsk(false);
        else setQuitAsk(true);
      },
      onF1: () => setHelp(true),
      onChar: (ch) => {
        if (quitAsk) {
          if (ch === "y" || ch === "Y") {
            onSelect("quit");
            return true;
          }
          if (ch === "n" || ch === "N") {
            setQuitAsk(false);
            return true;
          }
          return true;
        }
        if (help) {
          setHelp(false);
          return true;
        }
        const num = ITEMS.findIndex((i) => i.num === ch);
        if (num >= 0) {
          setHot(num);
          onSelect(ITEMS[num].id);
          return true;
        }
        const acc = ITEMS.findIndex(
          (i) => i.accel.toLowerCase() === ch.toLowerCase()
        );
        if (acc >= 0) {
          setHot(acc);
          onSelect(ITEMS[acc].id);
          return true;
        }
        return false;
      },
    },
    true
  );

  return (
    <Screen
      statusKeys={MENU_KEYS}
      title="Promas(P) Version 2.0  —  Property Management System"
      left={dateStr}
      right={timeStr}
      message={
        quitAsk
          ? "Do you want quit (Y/N) ?"
          : "Select menu item and press Enter  —  or click with mouse"
      }
    >
      <div className="dos-main-wrap">
        <div className="dos-menu-frame">
          <div className="menu-header"> Property Management System </div>
          <div className="menu-body">
            {ITEMS.map((item, i) => (
              <button
                key={item.id}
                className={`dos-menu-item ${i === hot ? "hot" : ""}`}
                onMouseEnter={() => setHot(i)}
                onClick={() => onSelect(item.id)}
              >
                <span className="num">{item.num}.</span>
                {renderLabel(item.label, item.accel)}
              </button>
            ))}
          </div>
        </div>
        <div className="dos-copyright">
          {`Amateurmas(P) Version 2.0 - Public Domain Software.
Han Qi Mo Pho
Modern rewrite — Tauri + SQLite`}
        </div>
      </div>
      {help && <HelpOverlay onClose={() => setHelp(false)} />}
      {quitAsk && (
        <Prompt
          question="Do you want quit (Y/N) ?"
          onYes={() => onSelect("quit")}
          onNo={() => setQuitAsk(false)}
        />
      )}
    </Screen>
  );
}

function renderLabel(label: string, accel: string) {
  const i = label.toLowerCase().indexOf(accel.toLowerCase());
  if (i < 0) return label;
  return (
    <>
      {label.slice(0, i)}
      <span className="accel">{label[i]}</span>
      {label.slice(i + 1)}
    </>
  );
}
