import { useEffect, useRef, useState } from "react";
import { api, WorkPerson } from "../api";
import { Screen } from "../dos/Shell";
import { pushUndoDelete } from "../lib/undoDelete";

type Row = {
  key: string;
  originalName: string;
  name: string;
  workerNo: string;
  active: boolean;
};

function rowFromPerson(person: WorkPerson, key: string): Row {
  return {
    key,
    originalName: person.name,
    name: person.name,
    workerNo: person.workerNo ?? "",
    active: person.active !== false,
  };
}

/**
 * Work-person catalog. Names stored on invoices are independent of this list:
 * deleting or renaming a row never rewrites invoice lines.
 */
export function WorkersScreen() {
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState("");
  const [msgKind, setMsgKind] = useState<"default" | "error" | "info">("default");
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null);
  const rowsRef = useRef<Row[]>([]);
  const keySeq = useRef(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  function nextKey() {
    keySeq.current += 1;
    return `worker-${keySeq.current}`;
  }

  function replaceRows(next: Row[]) {
    rowsRef.current = next;
    setRows(next);
  }

  useEffect(() => {
    let cancel = false;
    api
      .listWorkPersons()
      .then((list) => {
        if (cancel) return;
        replaceRows((list ?? []).map((person) => rowFromPerson(person, nextKey())));
      })
      .catch((e) => {
        if (!cancel) {
          setMsg(String(e));
          setMsgKind("error");
        }
      });
    return () => {
      cancel = true;
    };
  }, []);

  function patchRow(key: string, patch: Partial<Row>) {
    const next = rowsRef.current.map((row) =>
      row.key === key ? { ...row, ...patch } : row
    );
    replaceRows(next);
  }

  function queueSave(key: string) {
    const run = async () => {
      const row = rowsRef.current.find((r) => r.key === key);
      if (!row) return;
      const name = row.name.trim();
      if (!name) return;
      try {
        await api.saveWorkPerson({
          name,
          workerNo: row.workerNo.trim(),
          active: row.active,
          originalName: row.originalName,
        });
        const current = rowsRef.current.map((r) =>
          r.key === key ? { ...r, originalName: name } : r
        );
        replaceRows(current);
        setMsg("");
        setMsgKind("default");
      } catch (e) {
        setMsg(String(e));
        setMsgKind("error");
      }
    };
    saveQueue.current = saveQueue.current.then(run, run);
  }

  useEffect(() => {
    if (!pendingDelete) return;
    const row = pendingDelete;
    let settled = false;
    const onKey = (e: KeyboardEvent) => {
      if (e.type !== "keydown") return;
      e.preventDefault();
      e.stopPropagation();
      if (settled) return;
      if (e.key === "y" || e.key === "Y") {
        settled = true;
        setPendingDelete(null);
        void (async () => {
          if (row.originalName) {
            try {
              await api.deleteWorkPerson(row.originalName);
            } catch (err) {
              setMsg(String(err));
              setMsgKind("error");
              return;
            }
          }
          const index = rowsRef.current.findIndex((r) => r.key === row.key);
          replaceRows(rowsRef.current.filter((r) => r.key !== row.key));
          setMsg("");
          setMsgKind("default");
          pushUndoDelete(async () => {
            const name = row.name.trim() || row.originalName;
            if (row.originalName && name) {
              await api.saveWorkPerson({
                name,
                workerNo: row.workerNo.trim(),
                active: row.active,
                originalName: "",
              });
            }
            if (rowsRef.current.some((r) => r.key === row.key)) return;
            const next = [...rowsRef.current];
            next.splice(Math.min(Math.max(index, 0), next.length), 0, row);
            replaceRows(next);
            setMsg("Delete undone.");
            setMsgKind("info");
          });
        })();
        return;
      }
      if (e.key === "n" || e.key === "N" || e.key === "Escape") {
        settled = true;
        setPendingDelete(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [pendingDelete]);

  return (
    <Screen
      statusKeys={[
        { key: "Esc", label: "Exit" },
        { key: "F1", label: "Help" },
      ]}
      title=" Workers "
      message={
        msg ||
        "Active workers appear on new invoices. Deleting one leaves past invoices unchanged."
      }
      messageKind={msgKind}
    >
      <div className="dos-main-wrap">
        <div className="workers-frame">
          <div className="workers-head">
            <div>Active?</div>
            <div>Work Person</div>
            <div>ID number</div>
            <div></div>
          </div>
          <div className="workers-scroll">
        <div className="workers-list">
          {rows.map((row, index) => {
            const n = index + 1;
            const who = row.name.trim() || "new worker";
            return (
              <div className="workers-row" key={row.key}>
                <input
                  type="checkbox"
                  aria-label={`Active ${who}`}
                  checked={row.active}
                  onChange={(e) => {
                    patchRow(row.key, { active: e.target.checked });
                    queueSave(row.key);
                  }}
                />
                <input
                  className="dos-input"
                  aria-label={`Worker name ${n}`}
                  value={row.name}
                  onChange={(e) => patchRow(row.key, { name: e.target.value })}
                  onBlur={() => queueSave(row.key)}
                />
                <input
                  className="dos-input"
                  aria-label={`Worker number ${n}`}
                  value={row.workerNo}
                  onChange={(e) =>
                    patchRow(row.key, { workerNo: e.target.value })
                  }
                  onBlur={() => queueSave(row.key)}
                />
                <button
                  type="button"
                  className="dos-btn danger"
                  aria-label={`Delete ${who}`}
                  onClick={() => setPendingDelete(row)}
                >
                  Delete
                </button>
              </div>
            );
          })}
          <div className="workers-add">
            <button
              type="button"
              className="dos-btn"
              onClick={() => {
                const row: Row = {
                  key: nextKey(),
                  originalName: "",
                  name: "",
                  workerNo: "",
                  active: true,
                };
                replaceRows([...rowsRef.current, row]);
              }}
            >
              Add Work Person
            </button>
          </div>
        </div>
          </div>
        </div>
      </div>
      {pendingDelete && (
        <div className="dos-overlay">
          <div
            className="dos-prompt"
            role="dialog"
            aria-label="Are you sure? Y/N"
          >
            <div className="q">Are you sure? Y/N</div>
          </div>
        </div>
      )}
    </Screen>
  );
}
