import { useEffect, useRef, useState } from "react";
import { api, JobDescription } from "../api";
import { MoneyInput } from "../dos/MoneyInput";
import { Screen, Prompt } from "../dos/Shell";
import { pushUndoDelete } from "../lib/undoDelete";
import {
  blankJobDescription,
  JOB_SIZES,
  jobWithSizePrice,
  priceShownForSize,
  sizesEditedOnJob,
} from "../lib/jobCatalog";

type Row = JobDescription & { key: string; size: string; editedSizes: string[] };

/** Shown when leaving Job Descriptions with prices or names that are not saved. */
export const UNSAVED_JOB_CHANGES =
  "You made changes without saving. Any changes will be lost. Are you sure you want to quit? Y/N";

/** Miscellaneous reads this before Esc closes the screen. */
export const JOB_LEAVE_EVENT = "promas:job-leave";

const PRICE_FIELDS = [
  "single",
  "onePlusOne",
  "twoPlusOne",
  "twoPlusTwo",
  "threePlusTwo",
  "fourPlusTwo",
  "occupied",
  "fixed",
] as const;

function rowFromJob(job: JobDescription, key: string, size = "single"): Row {
  return {
    ...blankJobDescription(),
    ...job,
    key,
    size,
    originalDescription: job.description,
    editedSizes: sizesEditedOnJob(job),
  };
}

function pricesMatch(a: JobDescription, b: JobDescription): boolean {
  return PRICE_FIELDS.every((field) => a[field] === b[field]);
}

function snapshot(row: Row): JobDescription {
  return {
    description: row.description,
    originalDescription: row.originalDescription ?? "",
    single: row.single,
    onePlusOne: row.onePlusOne,
    twoPlusOne: row.twoPlusOne,
    twoPlusTwo: row.twoPlusTwo,
    threePlusTwo: row.threePlusTwo,
    fourPlusTwo: row.fourPlusTwo,
    occupied: row.occupied,
    fixed: row.fixed,
  };
}

/**
 * Job-description catalog. Text stored on invoices is independent of this
 * list: deleting or renaming a row never rewrites an invoice. Edits stay on
 * the screen until Save Changes.
 */
export function JobDescriptionsScreen({ onBack }: { onBack?: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState("");
  const [msgKind, setMsgKind] = useState<"default" | "error" | "info">("default");
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null);
  const [pendingQuit, setPendingQuit] = useState(false);
  const rowsRef = useRef<Row[]>([]);
  const savedRef = useRef<Map<string, JobDescription>>(new Map());
  const dirtyRef = useRef(false);
  const pendingQuitRef = useRef(false);
  const onBackRef = useRef(onBack);
  const keySeq = useRef(0);
  onBackRef.current = onBack;

  function nextKey() {
    keySeq.current += 1;
    return `job-${keySeq.current}`;
  }

  function rowIsDirty(row: Row): boolean {
    const saved = savedRef.current.get(row.key);
    if (!saved) {
      return row.description.trim() !== "" || PRICE_FIELDS.some((field) => row[field] != null);
    }
    return row.description !== saved.description || !pricesMatch(row, saved);
  }

  function markDirty() {
    const dirty = rowsRef.current.some(rowIsDirty);
    dirtyRef.current = dirty;
    document.documentElement.dataset.unsavedJobChanges = dirty ? "yes" : "no";
  }

  function replaceRows(next: Row[]) {
    rowsRef.current = next;
    setRows(next);
    markDirty();
  }

  function rememberSaved(next: Row[]) {
    savedRef.current = new Map(next.map((row) => [row.key, snapshot(row)]));
    dirtyRef.current = false;
    document.documentElement.dataset.unsavedJobChanges = "no";
  }

  useEffect(() => {
    let cancel = false;
    api
      .listJobDescriptions()
      .then((list) => {
        if (cancel) return;
        const next = (list ?? []).map((job) => rowFromJob(job, nextKey()));
        rowsRef.current = next;
        setRows(next);
        rememberSaved(next);
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

  function leaveWithoutSaving() {
    pendingQuitRef.current = false;
    dirtyRef.current = false;
    document.documentElement.dataset.unsavedJobChanges = "no";
    setPendingQuit(false);
    onBackRef.current?.();
  }

  function askToLeave() {
    if (pendingQuitRef.current || !dirtyRef.current) return;
    pendingQuitRef.current = true;
    setPendingQuit(true);
  }

  useEffect(() => {
    const onLeave = () => askToLeave();
    window.addEventListener(JOB_LEAVE_EVENT, onLeave);
    return () => {
      window.removeEventListener(JOB_LEAVE_EVENT, onLeave);
      delete document.documentElement.dataset.unsavedJobChanges;
    };
  }, []);

  async function saveChanges() {
    const dirty = rowsRef.current.filter(rowIsDirty);
    if (dirty.length === 0) {
      setMsg("Changes saved.");
      setMsgKind("info");
      return;
    }
    if (dirty.some((row) => !row.description.trim())) {
      setMsg("Enter a description before saving.");
      setMsgKind("error");
      return;
    }
    try {
      let saved: JobDescription[] = [];
      for (const row of dirty) {
        saved = await api.saveJobDescription({
          description: row.description.trim(),
          originalDescription: row.originalDescription ?? "",
          single: row.single,
          onePlusOne: row.onePlusOne,
          twoPlusOne: row.twoPlusOne,
          twoPlusTwo: row.twoPlusTwo,
          threePlusTwo: row.threePlusTwo,
          fourPlusTwo: row.fourPlusTwo,
          occupied: row.occupied,
          fixed: row.fixed,
        });
      }
      const byName = new Map(
        rowsRef.current.map((row) => [row.description.trim().toLowerCase(), row])
      );
      const next = saved.map((job) => {
        const current = byName.get(job.description.toLowerCase());
        return rowFromJob(job, current?.key ?? nextKey(), current?.size ?? "single");
      });
      const blanks = rowsRef.current.filter(
        (row) => !row.originalDescription && !row.description.trim() && !rowIsDirty(row)
      );
      const kept = [...next, ...blanks];
      rowsRef.current = kept;
      setRows(kept);
      rememberSaved(next);
      setMsg("Changes saved.");
      setMsgKind("info");
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    }
  }

  useEffect(() => {
    if (!pendingQuit) return;
    let settled = false;
    const onKey = (e: KeyboardEvent) => {
      if (e.type !== "keydown") return;
      const key = e.key;
      if (key !== "y" && key !== "Y" && key !== "n" && key !== "N" && key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      if (settled) return;
      settled = true;
      if (key === "y" || key === "Y") leaveWithoutSaving();
      else {
        pendingQuitRef.current = false;
        setPendingQuit(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [pendingQuit]);

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
          if (row.originalDescription) {
            try {
              await api.deleteJobDescription(row.originalDescription);
            } catch (err) {
              setMsg(String(err));
              setMsgKind("error");
              return;
            }
          }
          const index = rowsRef.current.findIndex((r) => r.key === row.key);
          savedRef.current.delete(row.key);
          replaceRows(rowsRef.current.filter((r) => r.key !== row.key));
          setMsg("");
          setMsgKind("default");
          pushUndoDelete(async () => {
            const description = row.description.trim() || row.originalDescription || "";
            if (row.originalDescription && description) {
              await api.saveJobDescription({
                description,
                originalDescription: "",
                single: row.single,
                onePlusOne: row.onePlusOne,
                twoPlusOne: row.twoPlusOne,
                twoPlusTwo: row.twoPlusTwo,
                threePlusTwo: row.threePlusTwo,
                fourPlusTwo: row.fourPlusTwo,
                occupied: row.occupied,
                fixed: row.fixed,
              });
            }
            if (rowsRef.current.some((r) => r.key === row.key)) return;
            const next = [...rowsRef.current];
            next.splice(Math.min(Math.max(index, 0), next.length), 0, row);
            replaceRows(next);
            savedRef.current.set(row.key, snapshot(row));
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
      title=" Job Descriptions "
      message={
        msg ||
        "Invoice and work-order descriptions come from this list. Deleting one leaves past invoices unchanged."
      }
      messageKind={msgKind}
    >
      <div className="dos-main-wrap">
        <div className="job-desc-frame">
          <div className="job-desc-head">
            <div>Description</div>
            <div>Size</div>
            <div>Price</div>
            <div></div>
          </div>
          <div className="job-desc-scroll">
            <div className="job-desc-list">
              {rows.map((row, index) => {
                const n = index + 1;
                const who = row.description.trim() || "new job description";
                return (
                  <div className="job-desc-row" key={row.key}>
                    <input
                      className="dos-input"
                      aria-label={`Job description ${n}`}
                      value={row.description}
                      onChange={(e) => patchRow(row.key, { description: e.target.value })}
                    />
                    <select
                      className="dos-select"
                      aria-label={`Size ${n}`}
                      value={row.size}
                      onChange={(e) => patchRow(row.key, { size: e.target.value })}
                    >
                      {JOB_SIZES.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                    <MoneyInput
                      key={`${row.key}:${row.size}`}
                      className="job-desc-price"
                      aria-label={`Price ${n}`}
                      value={priceShownForSize(row, row.size)}
                      onValueChange={(price) => {
                        const current = rowsRef.current.find((r) => r.key === row.key);
                        if (!current) return;
                        patchRow(
                          row.key,
                          jobWithSizePrice(current, current.size, price, current.editedSizes)
                        );
                      }}
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
            </div>
          </div>
          <div className="job-desc-actions">
            <button
              type="button"
              className="dos-btn"
              onClick={() => {
                replaceRows([
                  ...rowsRef.current,
                  {
                    ...blankJobDescription(),
                    key: nextKey(),
                    size: "single",
                    originalDescription: "",
                    editedSizes: [],
                  },
                ]);
              }}
            >
              Add Job Description
            </button>
            <button type="button" className="dos-btn" onClick={() => void saveChanges()}>
              Save Changes
            </button>
          </div>
        </div>
      </div>
      {pendingDelete && (
        <div className="dos-overlay">
          <div className="dos-prompt" role="dialog" aria-label="Are you sure? Y/N">
            <div className="q">Are you sure? Y/N</div>
          </div>
        </div>
      )}
      {pendingQuit && (
        <Prompt question={UNSAVED_JOB_CHANGES} onYes={leaveWithoutSaving} onNo={() => {
          pendingQuitRef.current = false;
          setPendingQuit(false);
        }} />
      )}
    </Screen>
  );
}
