import { useCallback, useEffect, useState } from "react";
import { api, Employee, emptyEmployee } from "../api";
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
import { padR, padL } from "../dos/utils";

export function WorkerBrowse({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Employee | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [msg, setMsg] = useState("Ins=Add  Ctrl-Home=Edit  Del=Void  Esc=Exit");
  const [voidAsk, setVoidAsk] = useState(false);
  const [help, setHelp] = useState(false);
  const { index, setIndex, up, down, pageUp, pageDown, home, end } =
    useBrowseIndex(rows.length);

  const load = useCallback(async () => {
    setRows(await api.listEmployees({ search }));
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
        setEditing(emptyEmployee());
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
    if (!editing?.empNo || !editing.name) {
      setMsg("--> Worker No and Name required !!");
      return;
    }
    await api.saveEmployee(editing);
    setEditing(null);
    await load();
    setMsg(`Worker ${editing.empNo} saved.`);
  }

  async function doVoid() {
    if (!current) return;
    await api.deleteEmployee(current.empNo);
    setVoidAsk(false);
    await load();
  }

  return (
    <Screen
      statusKeys={editing ? FORM_KEYS : BROWSE_KEYS}
      title=" Worker Information "
      message={msg}
    >
      {!editing && (
        <>
          <div className="dos-searchline">
            <label>Search:</label>
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
              {"Worker No....Worker Name........................Phone........  Rate%"}
            </div>
            <div className="dos-browse-body">
              {rows.map((e, i) => (
                <button
                  key={e.empNo}
                  className={`dos-row ${i === index ? "selected" : ""} ${e.voided ? "voided" : ""}`}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => {
                    setIsNew(false);
                    setEditing({ ...e });
                  }}
                >
                  {padR(e.empNo, 12)} {padR(e.name, 32)} {padR(e.phone, 13)}{" "}
                  {padL(e.commission.toFixed(2), 6)}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {editing && (
        <Dialog
          title="Worker Information"
          foot="Esc=Cancel, Ctrl-W=Save & Exit"
        >
          <div className="dos-form">
            <DotField label="Worker No" width={14}>
              <input
                className="dos-input w5"
                value={editing.empNo}
                disabled={!isNew}
                onChange={(e) =>
                  setEditing({ ...editing, empNo: e.target.value })
                }
                autoFocus
              />
            </DotField>
            <DotField label="Worker Name" width={14}>
              <input
                className="dos-input w30"
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
              />
            </DotField>
            <DotField label="Phone" width={14}>
              <input
                className="dos-input w15"
                value={editing.phone}
                onChange={(e) =>
                  setEditing({ ...editing, phone: e.target.value })
                }
              />
            </DotField>
            <DotField label="Wages Rate %" width={14}>
              <input
                className="dos-input w8 num"
                type="number"
                step="0.01"
                value={editing.commission}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    commission: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </DotField>
            <DotField label="S.S.#" width={14}>
              <input
                className="dos-input w12"
                value={editing.ssno}
                onChange={(e) =>
                  setEditing({ ...editing, ssno: e.target.value })
                }
              />
            </DotField>
            <DotField label="Birth Date" width={14}>
              <input
                className="dos-input w12"
                type="date"
                value={editing.birthDate || ""}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    birthDate: e.target.value || null,
                  })
                }
              />
            </DotField>
          </div>
        </Dialog>
      )}

      {voidAsk && (
        <Prompt
          question={`Do you want delete (Y/N) ?  ${current?.empNo} ${current?.name}`}
          onYes={doVoid}
          onNo={() => setVoidAsk(false)}
        />
      )}
      {help && <HelpOverlay onClose={() => setHelp(false)} />}
    </Screen>
  );
}
