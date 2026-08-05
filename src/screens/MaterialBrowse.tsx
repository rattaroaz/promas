import { useCallback, useEffect, useState } from "react";
import { api, Material, Employee, emptyMaterial } from "../api";
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
import { padR, padL, money, fmtDate, today } from "../dos/utils";

export function MaterialBrowse({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<Material[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Material | null>(null);
  const [msg, setMsg] = useState("******    Material Maintenance   ******");
  const [msgKind, setMsgKind] = useState<"default" | "error" | "info">("default");
  const [voidAsk, setVoidAsk] = useState(false);
  const [help, setHelp] = useState(false);
  const { index, setIndex, up, down, pageUp, pageDown, home, end } =
    useBrowseIndex(rows.length);

  const load = useCallback(async () => {
    try {
      const [data, emps] = await Promise.all([
        api.listMaterials({ search }),
        api.listEmployees({}),
      ]);
      setRows(data);
      setEmployees(emps);
      setMsg(
        `******    Material Maintenance   ******  ${data.length} records  Ins=Add  Del=Void`
      );
      setMsgKind("default");
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    }
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
      if (!editing) setEditing(emptyMaterial());
    },
    onDelete: () => {
      if (!editing && current) setVoidAsk(true);
    },
    onEnter: () => {
      if (!editing && current) setEditing({ ...current });
      else if (editing) save();
    },
    onCtrlHome: () => {
      if (!editing && current) setEditing({ ...current });
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
    if (!editing?.empNo) {
      setMsg("--> Worker No required !!");
      setMsgKind("error");
      return;
    }
    try {
      await api.saveMaterial(editing);
      setEditing(null);
      await load();
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    }
  }

  async function doVoid() {
    if (!current?.id) return;
    await api.deleteMaterial(current.id);
    setVoidAsk(false);
    await load();
  }

  return (
    <Screen
      statusKeys={editing ? FORM_KEYS : BROWSE_KEYS}
      title=" Material Process "
      message={msg}
      messageKind={msgKind}
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
              {"Mat_Date.....Material Description................Mater.Amount  Worker"}
            </div>
            <div className="dos-browse-body">
              {rows.map((m, i) => (
                <button
                  key={m.id}
                  className={`dos-row ${i === index ? "selected" : ""}`}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => {
                    setIndex(i);
                    setEditing({ ...m });
                  }}
                >
                  {padR(fmtDate(m.matDate), 12)}{" "}
                  {padR(m.description, 36)}{" "}
                  {padL(money(m.amount), 12)}{" "}
                  {padR(`${m.empNo} ${m.empName || ""}`, 20)}
                </button>
              ))}
              {rows.length === 0 && (
                <div className="dos-row" style={{ color: "var(--dos-yellow)" }}>
                  {"  Do you want add Material Data (Y/N) ?  Press Ins"}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {editing && (
        <Dialog
          title="Material Transaction"
          foot="Esc=Cancel  Ctrl-W=Save & Exit"
        >
          <div className="dos-form">
            <DotField label="Worker No" width={14}>
              <select
                className="dos-select"
                value={editing.empNo}
                onChange={(e) =>
                  setEditing({ ...editing, empNo: e.target.value })
                }
                autoFocus
              >
                <option value="">---</option>
                {employees.map((e) => (
                  <option key={e.empNo} value={e.empNo}>
                    {e.empNo} {e.name}
                  </option>
                ))}
              </select>
            </DotField>
            <DotField label="Mat Date" width={14}>
              <input
                className="dos-input w12"
                type="date"
                value={editing.matDate || today()}
                onChange={(e) =>
                  setEditing({ ...editing, matDate: e.target.value })
                }
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
            <DotField label="Amount" width={14}>
              <input
                className="dos-input w12 num"
                type="number"
                step="0.01"
                value={editing.amount}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    amount: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </DotField>
          </div>
        </Dialog>
      )}

      {voidAsk && (
        <Prompt
          question="Do you want Void (Y/N) ?"
          onYes={doVoid}
          onNo={() => setVoidAsk(false)}
        />
      )}
      {help && <HelpOverlay onClose={() => setHelp(false)} />}
    </Screen>
  );
}
