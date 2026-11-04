import { useEffect, useState } from "react";
import { Screen, Prompt } from "../dos/Shell";

/**
 * Add and delete a named list (unit sizes, paint supply companies).
 * Escape while the confirm dialog is open is handled by the dialog.
 */
export function NameCatalogScreen({
  title,
  hint,
  load,
  save,
  remove,
}: {
  title: string;
  hint: string;
  load: () => Promise<string[]>;
  save: (name: string) => Promise<string[]>;
  remove: (name: string) => Promise<string[]>;
}) {
  const [names, setNames] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [msgKind, setMsgKind] = useState<"default" | "error" | "info">("default");

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "y" || e.key === "Y") {
        e.preventDefault();
        e.stopPropagation();
        void confirmDelete();
      } else if (e.key === "n" || e.key === "N" || e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setPending(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [pending]);

  useEffect(() => {
    let cancel = false;
    load()
      .then((list) => {
        if (!cancel) setNames(list ?? []);
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
  }, [load]);

  async function addName() {
    const name = draft.trim();
    if (!name) {
      setMsg("Enter a name before adding.");
      setMsgKind("error");
      return;
    }
    try {
      setNames(await save(name));
      setDraft("");
      setMsg("Saved.");
      setMsgKind("info");
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    }
  }

  async function confirmDelete() {
    if (!pending) return;
    const name = pending;
    setPending(null);
    try {
      setNames(await remove(name));
      setMsg("Deleted.");
      setMsgKind("info");
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    }
  }

  return (
    <Screen
      statusKeys={[
        { key: "Esc", label: "Exit" },
        { key: "F1", label: "Help" },
      ]}
      title={title}
      message={msg || hint}
      messageKind={msgKind}
    >
      <div className="dos-main-wrap">
        <div className="dos-menu-frame" style={{ minWidth: "min(46ch, 100%)" }}>
          <div className="menu-body" style={{ padding: "1em 2ch" }}>
            <div style={{ display: "flex", gap: "0.6em", marginBottom: "1em" }}>
              <input
                className="dos-input"
                aria-label={`Add ${title.trim()}`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addName();
                  }
                }}
                autoFocus
              />
              <button type="button" className="dos-btn" onClick={() => void addName()}>
                Add
              </button>
            </div>
            {names.length === 0 && (
              <div style={{ color: "var(--app-highlight)" }}>No names yet.</div>
            )}
            {names.map((name) => (
              <div
                key={name}
                className="workers-row"
                style={{ display: "flex", gap: "0.6em", alignItems: "center" }}
              >
                <div style={{ flex: 1 }}>{name}</div>
                <button
                  type="button"
                  className="dos-btn danger"
                  aria-label={`Delete ${name}`}
                  onClick={() => setPending(name)}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
      {pending && (
        <Prompt
          question="Are you sure? Y/N"
          onYes={() => void confirmDelete()}
          onNo={() => setPending(null)}
        />
      )}
    </Screen>
  );
}
