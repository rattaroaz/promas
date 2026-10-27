import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

/** Width of `text` in the worker field's font, before the input's padding. */
function textWidth(text: string, font: string): number {
  const probe = document.createElement("span");
  probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${font};`;
  probe.textContent = text;
  document.body.appendChild(probe);
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  return width;
}

/**
 * Name column for the catalog. It is the longest saved or typed name, at
 * least the "Work Person" header, and never wider than 30ch or the space
 * that leaves Active?, the ID, and Delete inside the scrollport.
 */
export function workerNameTrack(
  namePx: number,
  headerPx: number,
  capPx: number
): number {
  const needed = Math.max(namePx, headerPx);
  const cap = Math.max(headerPx, capPx);
  return Math.ceil(Math.min(needed, cap));
}

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
  const frameRef = useRef<HTMLDivElement>(null);
  const keySeq = useRef(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const [nameTrack, setNameTrack] = useState<number | null>(null);

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

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const input = frame.querySelector(
      "input[aria-label^='Worker name']"
    ) as HTMLInputElement | null;
    const header = frame.querySelector(
      ".workers-head > div:nth-child(2)"
    ) as HTMLElement | null;
    const scroll = frame.querySelector(".workers-scroll") as HTMLElement | null;
    const font = getComputedStyle(input ?? header ?? frame).font;
    const headerFont = getComputedStyle(header ?? input ?? frame).font;
    const pad = input
      ? parseFloat(getComputedStyle(input).paddingLeft) +
        parseFloat(getComputedStyle(input).paddingRight)
      : 0;
    const ch = textWidth("0", font) || 9;
    // Saved names set the track. The text currently in the field counts too,
    // so an ordinary name is fully visible as it is typed. Past the cap, the
    // track stops and the unfocused field ellipsizes.
    const names = rows
      .flatMap((row) => [row.originalName, row.name])
      .map((name) => name.trim())
      .filter(Boolean);
    const longest = names.reduce((max, name) => Math.max(max, textWidth(name, font)), 0);
    const headerPx = textWidth("Work Person", headerFont) + 1;
    const active = 7.6 * ch;
    const id = 9.8 * ch;
    const del = 10 * ch;
    const gaps = 16 * 3;
    const bar = 16;
    const port = scroll?.clientWidth || frame.clientWidth || 1024;
    const room = port - active - id - del - gaps - bar;
    const cap = Math.min(30 * ch, Math.max(room, 0));
    const next = workerNameTrack(longest + pad + 1, headerPx, cap);
    setNameTrack((prev) => (prev === next ? prev : next));
  }, [rows]);

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
        <div
          className="workers-frame"
          ref={frameRef}
          style={nameTrack ? { ["--workers-name" as string]: `${nameTrack}px` } : undefined}
        >
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
