import { useEffect, useState } from "react";
import { DeletePrompt, Screen } from "../dos/Shell";

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
    if (names.some((row) => row.toLowerCase() === name.toLowerCase())) {
      setMsg("Already in the list.");
      setMsgKind("info");
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
        <div className="dos-menu-frame catalog-frame">
          <div className="menu-body">
            <div className="catalog-add">
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
            <div className="catalog-list">
              {names.length === 0 && (
                <div style={{ color: "var(--app-highlight)" }}>No names yet.</div>
              )}
              {names.map((name) => (
                <div key={name} className="catalog-row">
                  <div className="catalog-name" title={name}>
                    {name}
                  </div>
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
      </div>
      {pending && (
        <DeletePrompt
          onYes={() => void confirmDelete()}
          onNo={() => setPending(null)}
        />
      )}
    </Screen>
  );
}
