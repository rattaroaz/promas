import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, WorkPerson } from "../api";
import { useDosKeys } from "../dos/hooks";
import { DotField } from "../dos/Field";
import { Screen } from "../dos/Shell";
import { pushUndoDelete } from "../lib/undoDelete";
import {
  duplicateWorkerWarning,
  workerIdAlreadyShared,
  workerIdBlocksSave,
} from "../lib/workerIds";

type Row = {
  key: string;
  originalName: string;
  name: string;
  workerNo: string;
  address: string;
  phone: string;
  active: boolean;
};

type Draft = {
  originalName: string;
  name: string;
  workerNo: string;
  address: string;
  phone: string;
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
 * Name column for the catalog. It is the longest saved name, at least the
 * "Work Person" header, and never wider than 30ch or the space that leaves
 * Active?, the ID, Delete, and Edit inside the scrollport.
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
    address: person.address ?? "",
    phone: person.phone ?? "",
    active: person.active !== false,
  };
}

function draftFromRow(row: Row): Draft {
  return {
    originalName: row.originalName,
    name: row.name,
    workerNo: row.workerNo,
    address: row.address,
    phone: row.phone,
    active: row.active,
  };
}

const EMPTY_DRAFT: Draft = {
  originalName: "",
  name: "",
  workerNo: "",
  address: "",
  phone: "",
  active: true,
};

/**
 * Work-person catalog. Names stored on invoices are independent of this list:
 * deleting or renaming a row never rewrites invoice lines.
 */
export function WorkersScreen() {
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState("");
  const [msgKind, setMsgKind] = useState<"default" | "error" | "info">("default");
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
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

  function applyList(list: WorkPerson[]) {
    const prev = rowsRef.current;
    const used = new Set<string>();
    replaceRows(
      list.map((person) => {
        const existing = prev.find(
          (row) =>
            !used.has(row.key) &&
            row.name.toLowerCase() === person.name.toLowerCase()
        );
        if (existing) used.add(existing.key);
        return rowFromPerson(person, existing?.key ?? nextKey());
      })
    );
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

  useEffect(() => {
    if (draft) document.documentElement.dataset.workPersonForm = "yes";
    else delete document.documentElement.dataset.workPersonForm;
    return () => {
      delete document.documentElement.dataset.workPersonForm;
    };
  }, [draft]);

  function patchRow(key: string, patch: Partial<Row>) {
    const next = rowsRef.current.map((row) =>
      row.key === key ? { ...row, ...patch } : row
    );
    replaceRows(next);
  }

  function queueActive(key: string) {
    const run = async () => {
      const row = rowsRef.current.find((r) => r.key === key);
      if (!row || !row.originalName) return;
      try {
        await api.saveWorkPerson({
          name: row.name.trim(),
          workerNo: row.workerNo.trim(),
          address: row.address,
          phone: row.phone,
          active: row.active,
          originalName: row.originalName,
        });
        setMsg("");
        setMsgKind("default");
      } catch (e) {
        setMsg(String(e));
        setMsgKind("error");
      }
    };
    saveQueue.current = saveQueue.current.then(run, run);
  }

  function idRows() {
    return rowsRef.current.map((row) => ({
      name: row.name,
      workerNo: row.workerNo,
      originalName: row.originalName,
    }));
  }

  function idTaken(workerNo: string, originalName: string): boolean {
    return workerIdBlocksSave(idRows(), workerNo, originalName);
  }

  async function saveDraft() {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      setMsg("Work person name required");
      setMsgKind("error");
      return;
    }
    if (idTaken(draft.workerNo, draft.originalName)) {
      setMsg("Worker ID must be unique");
      setMsgKind("error");
      return;
    }
    try {
      const list = await api.saveWorkPerson({
        name,
        workerNo: draft.workerNo.trim(),
        address: draft.address.trim(),
        phone: draft.phone.trim(),
        active: draft.active,
        originalName: draft.originalName,
      });
      applyList(list ?? []);
      setDraft(null);
      setMsg("");
      setMsgKind("default");
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    }
  }

  useDosKeys({
    onEscape: () => {
      if (draft) {
        setDraft(null);
        setMsg("");
        setMsgKind("default");
      }
    },
    onInsert: () => {
      if (draft || pendingDelete) return;
      setMsg("");
      setMsgKind("default");
      setDraft(EMPTY_DRAFT);
    },
    onCtrlS: () => {
      if (draft) void saveDraft();
    },
  });

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const nameCell = frame.querySelector(
      "[aria-label^='Worker name']"
    ) as HTMLElement | null;
    const header = frame.querySelector(
      ".workers-head > div:nth-child(2)"
    ) as HTMLElement | null;
    const scroll = frame.querySelector(".workers-scroll") as HTMLElement | null;
    const font = getComputedStyle(nameCell ?? header ?? frame).font;
    const headerFont = getComputedStyle(header ?? nameCell ?? frame).font;
    const ch = textWidth("0", font) || 9;
    const names = rows.map((row) => row.name.trim()).filter(Boolean);
    const longest = names.reduce((max, name) => Math.max(max, textWidth(name, font)), 0);
    const headerPx = textWidth("Work Person", headerFont) + 1;
    const active = 7.6 * ch;
    const id = 9.8 * ch;
    const del = 10 * ch;
    const edit = 8 * ch;
    const gaps = 16 * 4;
    const bar = 16;
    const port = scroll?.clientWidth || frame.clientWidth || 1024;
    const room = port - active - id - del - edit - gaps - bar;
    const cap = Math.min(30 * ch, Math.max(room, 0));
    const next = workerNameTrack(longest + 2, headerPx, cap);
    setNameTrack((prev) => (prev === next ? prev : next));
  }, [rows, draft]);

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
                address: row.address,
                phone: row.phone,
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

  if (draft) {
    const shared = workerIdAlreadyShared(idRows(), draft.workerNo, draft.originalName);
    const formMessage = shared
      ? "This Worker ID is already shared. You can still save, or enter a new ID to resolve it."
      : "Worker ID is unique.";
    return (
      <Screen
        statusKeys={[
          { key: "Esc", label: "Exit" },
          { key: "Ctrl-S", label: "Save" },
        ]}
        title=" Work Person "
        message={msg || formMessage}
        messageKind={msg ? msgKind : shared ? "error" : "default"}
      >
        <div className="dos-main-wrap">
          <div className="dos-form work-person-form">
            <DotField label="Name" width={12}>
              <input
                className="dos-input w30"
                aria-label="Name"
                value={draft.name}
                autoFocus
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </DotField>
            <DotField label="Address" width={12}>
              <input
                className="dos-input w30"
                aria-label="Address"
                value={draft.address}
                onChange={(e) => setDraft({ ...draft, address: e.target.value })}
              />
            </DotField>
            <DotField label="Phone" width={12}>
              <input
                className="dos-input w16"
                aria-label="Phone"
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              />
            </DotField>
            <DotField label="Worker ID" width={12}>
              <input
                className="dos-input w12"
                aria-label="Worker ID"
                value={draft.workerNo}
                onChange={(e) => setDraft({ ...draft, workerNo: e.target.value })}
              />
            </DotField>
          </div>
        </div>
      </Screen>
    );
  }

  const duplicateWarning = duplicateWorkerWarning(rows);
  return (
    <Screen
      statusKeys={[
        { key: "Esc", label: "Exit" },
        { key: "Ins", label: "Add" },
        { key: "F1", label: "Help" },
      ]}
      title=" Workers "
      message={
        msg ||
        duplicateWarning ||
        "Active workers appear on new invoices. Deleting one leaves past invoices unchanged."
      }
      messageKind={msg ? msgKind : duplicateWarning ? "error" : "default"}
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
            <div></div>
          </div>
          <div className="workers-scroll">
        <div className="workers-list">
          {rows.map((row, index) => {
            const n = index + 1;
            const who = row.name.trim() || "worker";
            return (
              <div className="workers-row" key={row.key}>
                <input
                  type="checkbox"
                  aria-label={`Active ${who}`}
                  checked={row.active}
                  onChange={(e) => {
                    patchRow(row.key, { active: e.target.checked });
                    queueActive(row.key);
                  }}
                />
                <div
                  className="workers-name"
                  aria-label={`Worker name ${n}`}
                  title={row.name}
                  tabIndex={0}
                >
                  {row.name}
                </div>
                <div className="workers-id" aria-label={`Worker number ${n}`}>
                  {row.workerNo}
                </div>
                <button
                  type="button"
                  className="dos-btn"
                  aria-label={`Edit ${who}`}
                  onClick={() => {
                    setMsg("");
                    setMsgKind("default");
                    setDraft(draftFromRow(row));
                  }}
                >
                  Edit
                </button>
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
