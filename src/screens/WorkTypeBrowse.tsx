import { useCallback, useEffect, useState } from "react";
import { api, WorkType, emptyWorkType } from "../api";
import { useBrowseIndex, useDosKeys } from "../dos/hooks";
import {
  Screen,
  BROWSE_KEYS,
  Dialog,
  FORM_KEYS,
  Prompt,
  HelpOverlay,
} from "../dos/Shell";
import { DotField } from "../dos/Field";
import { padR, padL, money } from "../dos/utils";

export function WorkTypeBrowse({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<WorkType[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<WorkType | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [msg, setMsg] = useState(
    "Ins=Add  Ctrl-Home=Edit  Del=Void  Esc=Exit"
  );
  const [voidAsk, setVoidAsk] = useState(false);
  const [help, setHelp] = useState(false);
  const { index, setIndex, up, down, pageUp, pageDown, home, end } =
    useBrowseIndex(rows.length);

  const load = useCallback(async () => {
    setRows(await api.listWorkTypes({ search }));
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 150);
    return () => clearTimeout(t);
  }, [load]);

  const current = rows[index] ?? null;

  useDosKeys({
    forceNav: !editing,
    onEscape: () => {
      if (help) setHelp(false);
      else if (voidAsk) setVoidAsk(false);
      else if (editing) setEditing(null);
      else onBack();
    },
    onF1: () => setHelp(true),
    onInsert: () => {
      if (!editing) {
        setIsNew(true);
        setEditing(emptyWorkType());
      }
    },
    onCtrlHome: () => {
      if (!editing && current) {
        setIsNew(false);
        setEditing({ ...current });
      }
    },
    onEnter: () => {
      if (!editing && current) {
        setIsNew(false);
        setEditing({ ...current });
      }
    },
    onDelete: () => {
      if (!editing && current) setVoidAsk(true);
    },
    onArrowUp: !editing ? up : undefined,
    onArrowDown: !editing ? down : undefined,
    onPageUp: !editing ? pageUp : undefined,
    onPageDown: !editing ? pageDown : undefined,
    onHome: !editing ? home : undefined,
    onEnd: !editing ? end : undefined,
    onCtrlW: () => {
      if (editing) save();
    },
    onChar: (ch) => {
      if (voidAsk) {
        if (ch === "y" || ch === "Y") {
          doVoid();
          return true;
        }
        if (ch === "n" || ch === "N") {
          setVoidAsk(false);
          return true;
        }
      }
      return false;
    },
  });

  async function save() {
    if (!editing?.codeNo) {
      setMsg("--> Code NO required !!");
      return;
    }
    await api.saveWorkType(editing);
    setEditing(null);
    await load();
    setMsg(`Code ${editing.codeNo} saved.`);
  }

  async function doVoid() {
    if (!current) return;
    await api.deleteWorkType(current.codeNo);
    setVoidAsk(false);
    await load();
  }

  return (
    <Screen
      statusKeys={editing ? FORM_KEYS : BROWSE_KEYS}
      title=" Work Type Information "
      message={msg}
    >
      {!editing && (
        <>
          <div className="dos-searchline">
            <label>Enter Job Code No (Esc=Exit) !</label>
            <input
              className="dos-input"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setIndex(0);
              }}
            />
          </div>
          <div className="dos-browse">
            <div className="dos-browse-header">
              {"Code NO......Description.......................W/T......Price"}
            </div>
            <div className="dos-browse-body">
              {rows.map((w, i) => (
                <button
                  key={w.codeNo}
                  className={`dos-row ${i === index ? "selected" : ""} ${w.voided ? "voided" : ""}`}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => {
                    setIsNew(false);
                    setEditing({ ...w });
                  }}
                >
                  {padR(w.codeNo, 12)} {padR(w.description, 32)}{" "}
                  {padR(w.workType, 8)} {padL(money(w.price), 10)}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {editing && (
        <Dialog
          title="Work Type Information"
          foot="Esc=Cancel, Ctrl-W=Save & Exit"
        >
          <div className="dos-form">
            <DotField label="Code NO" width={14}>
              <input
                className="dos-input w8"
                value={editing.codeNo}
                disabled={!isNew}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    codeNo: e.target.value.toUpperCase(),
                  })
                }
                autoFocus
              />
            </DotField>
            <DotField label="Description" width={14}>
              <input
                className="dos-input w30"
                value={editing.description}
                onChange={(e) =>
                  setEditing({ ...editing, description: e.target.value })
                }
              />
            </DotField>
            <DotField label="Work Type" width={14}>
              <select
                className="dos-select"
                value={editing.workType}
                onChange={(e) =>
                  setEditing({ ...editing, workType: e.target.value })
                }
              >
                <option value="P">P - Paint</option>
                <option value="C">C - Clean</option>
                <option value="S">S - Shampoo</option>
                <option value="F">F - Floor</option>
                <option value="O">O - Other</option>
              </select>
            </DotField>
            <DotField label="Price" width={14}>
              <input
                className="dos-input w10 num"
                type="number"
                step="0.01"
                value={editing.price}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    price: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </DotField>
          </div>
        </Dialog>
      )}

      {voidAsk && (
        <Prompt
          question={`Do you want delete (Y/N) ?  ${current?.codeNo}`}
          onYes={doVoid}
          onNo={() => setVoidAsk(false)}
        />
      )}
      {help && <HelpOverlay onClose={() => setHelp(false)} />}
    </Screen>
  );
}
