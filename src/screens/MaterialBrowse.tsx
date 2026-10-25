/**
 * Material Process browse — supports original sort orders:
 *  1 Add/Modify (default date order)
 *  2 Worker Name order
 *  3 Date order
 *  4 Descript order
 */
import { useCallback, useEffect, useState } from "react";
import { api, Material, Employee, WorkPerson, emptyMaterial } from "../api";
import { pointerHoverMuted, useBrowseIndex, useDosKeys } from "../dos/hooks";
import {
  Screen,
  BROWSE_KEYS,
  Dialog,
  FORM_KEYS,
  Prompt,
  HelpOverlay,
} from "../dos/Shell";
import { DotField, InlineField } from "../dos/Field";
import { MoneyInput } from "../dos/MoneyInput";
import { money, fmtDate, today } from "../dos/utils";

export type MaterialSort = "default" | "worker" | "date" | "desc";

const SORT_TITLE: Record<MaterialSort, string> = {
  default: "******    Material Maintenance   ******",
  worker: "*****   Worker Material Report (Worker Order)   *****",
  date: "*****   Worker Material Report (Date Order)   *****",
  desc: "***   Worker Material Report (Descript Order) ***",
};

/** Tracks keep MM/DD/YYYY and worker names fully inside the cell. */
function materialColumns(sort: MaterialSort): string {
  if (sort === "worker") return "13ch 30ch 17ch";
  if (sort === "date") return "18ch 30ch 17ch";
  if (sort === "desc") return "18ch 13ch 17ch";
  return "13ch 30ch 14ch";
}

export function MaterialBrowse({
  onBack,
  sort = "default",
}: {
  onBack: () => void;
  sort?: MaterialSort;
}) {
  const [rows, setRows] = useState<Material[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [workPersons, setWorkPersons] = useState<WorkPerson[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Material | null>(null);
  const [msg, setMsg] = useState(
    `${SORT_TITLE[sort]}  0  Total Material: 0.00  Ins=Add  Delete=Void  Esc=Exit`
  );
  const [msgKind, setMsgKind] = useState<"default" | "error" | "info">(
    "default"
  );
  const [voidAsk, setVoidAsk] = useState(false);
  const [help, setHelp] = useState(false);
  const { index, setIndex, up, down, pageUp, pageDown, home, end } =
    useBrowseIndex(rows.length);

  const load = useCallback(async () => {
    try {
      const [data, emps] = await Promise.all([
        api.listMaterials({
          search,
          sort: sort === "default" ? undefined : sort,
        }),
        api.listEmployees({}),
      ]);
      setRows(data);
      setEmployees(emps);
      const tot = data.reduce((s, r) => s + r.amount, 0);
      setMsg(
        `${SORT_TITLE[sort]}  ${data.length}  Total Material: ${money(tot)}  Ins=Add  Delete=Void  Esc=Exit`
      );
      setMsgKind("default");
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    }
  }, [search, sort]);

  useEffect(() => {
    const t = setTimeout(load, 150);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    let cancel = false;
    api
      .listWorkPersons()
      .then((list) => {
        if (!cancel) setWorkPersons(list ?? []);
      })
      .catch(() => {
        if (!cancel) setWorkPersons([]);
      });
    return () => {
      cancel = true;
    };
  }, []);

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
    onEnd: !editing ? () => window.print() : end,
    onCtrlS: () => {
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
      await api.saveMaterial({ ...editing, matDate: editing.matDate || today() });
      setEditing(null);
      await load();
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    }
  }

  async function doVoid() {
    if (!current?.id) return;
    setVoidAsk(false);
    try {
      await api.deleteMaterial(current.id);
      await load();
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    }
  }

  const headerCells =
    sort === "worker"
      ? ["TransDate", "Material Description", "Material Amount"]
      : sort === "desc"
        ? ["Empno", "Trans Date", "Material Amount"]
        : sort === "date"
          ? ["Empno", "Material Description", "Material Amount"]
          : ["Mat_Date", "Material Description", "Mater.Amount"];

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
            <InlineField
              label={
                sort === "worker"
                  ? "From Worker Name :"
                  : sort === "desc"
                    ? "From Descript :"
                    : "Search:"
              }
            >
              {sort === "worker" ? (
                <select
                  className="dos-select"
                  aria-label="From Worker Name"
                  value={
                    workPersons.some(
                      (person) => person.active !== false && person.name === search
                    )
                      ? search
                      : ""
                  }
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setIndex(0);
                  }}
                >
                  <option value="">All</option>
                  {workPersons
                    .filter((person) => person.active !== false)
                    .map((person) => (
                      <option key={person.name} value={person.name}>
                        {person.name}
                      </option>
                    ))}
                </select>
              ) : (
                <input
                  className="dos-input"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setIndex(0);
                  }}
                />
              )}
            </InlineField>
          </div>
          <div className="dos-browse">
            <div className="browse-grid browse-grid-header" style={{ gridTemplateColumns: materialColumns(sort) }}>
              {headerCells.map((h, i) => <div key={i}>{h}</div>)}
            </div>
            <div className="dos-browse-body">
              {rows.map((m, i) => (
                <button
                  key={m.id}
                  className={`dos-row ${i === index ? "selected" : ""} browse-grid`}
                  style={{ gridTemplateColumns: materialColumns(sort) }}
                  onMouseEnter={() => {
                    if (pointerHoverMuted()) return;
                    setIndex(i);
                  }}
                  onClick={() => {
                    setIndex(i);
                    setEditing({ ...m });
                  }}
                >
                  {sort === "worker" ? (
                    <>
                      <div>{fmtDate(m.matDate)}</div>
                      <div className="desc-truncate">{m.description}</div>
                      <div>{money(m.amount)}</div>
                    </>
                  ) : sort === "desc" ? (
                    <>
                      <div>{m.empNo}</div>
                      <div>{fmtDate(m.matDate)}</div>
                      <div>{money(m.amount)}</div>
                    </>
                  ) : sort === "date" ? (
                    <>
                      <div>{m.empNo}</div>
                      <div className="desc-truncate">{m.description}</div>
                      <div>{money(m.amount)}</div>
                    </>
                  ) : (
                    <>
                      <div>{fmtDate(m.matDate)}</div>
                      <div className="desc-truncate">{m.description}</div>
                      <div>{money(m.amount)}</div>
                    </>
                  )}
                </button>
              ))}
              {rows.length === 0 && (
                <div className="dos-row" style={{ color: "var(--app-highlight)" }}>
                  {"  Do you want add Material Data (Y/N) ?  Press Ins"}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {editing && (
        <Dialog
          title={SORT_TITLE[sort]}
          foot="Esc=Cancel  Ctrl-S=Save & Exit"
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
              <MoneyInput
                className="dos-input w12 num"
                aria-label="Amount"
                value={editing.amount}
                onValueChange={(amount) =>
                  setEditing({ ...editing, amount })
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
