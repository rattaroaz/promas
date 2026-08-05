import { useEffect, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { api } from "../api";
import { useDosKeys } from "../dos/hooks";
import { Screen, HelpOverlay, Prompt } from "../dos/Shell";
import { SubMenu, MenuItem } from "./SubMenu";
import { checkForUpdatesAndApply } from "../services/updateService";
import { APP_VERSION } from "../lib/constants";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { log } from "../lib/observability";

const SETTINGS_ITEMS: MenuItem[] = [
  { id: "update", num: "1", label: "Update Application", accel: "U" },
  { id: "export", num: "2", label: "Export Database", accel: "E" },
  { id: "location", num: "3", label: "Choose Location of Database", accel: "L" },
  { id: "backup", num: "4", label: "Backup Database", accel: "B" },
  { id: "import", num: "5", label: "Import Database", accel: "I" },
  { id: "diagnostics", num: "6", label: "Diagnostics", accel: "D" },
];

function todayStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const [screen, setScreen] = useState<string | null>(null);
  const [dbPath, setDbPath] = useState("");
  const [msg, setMsg] = useState("");
  const [msgKind, setMsgKind] = useState<"default" | "error" | "info">("default");
  const [busy, setBusy] = useState(false);
  const [confirmImport, setConfirmImport] = useState(false);
  const [pendingImport, setPendingImport] = useState<string | null>(null);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    if (screen) {
      api
        .getDbPath()
        .then(setDbPath)
        .catch((e) => {
          setMsg(String(e));
          setMsgKind("error");
        });
    }
  }, [screen]);

  useDosKeys(
    {
      onEscape: () => {
        if (help) setHelp(false);
        else if (confirmImport) {
          setConfirmImport(false);
          setPendingImport(null);
        } else if (screen) {
          setScreen(null);
          setMsg("");
          setMsgKind("default");
        } else onBack();
      },
      onF1: () => setHelp(true),
      onChar: (ch) => {
        if (confirmImport) {
          if (ch === "y" || ch === "Y") {
            void doImport();
            return true;
          }
          if (ch === "n" || ch === "N") {
            setConfirmImport(false);
            setPendingImport(null);
            return true;
          }
          return true;
        }
        return false;
      },
    },
    !!screen
  );

  async function doExport() {
    try {
      const dest = await save({
        title: "Export Database",
        defaultPath: `promas-export-${todayStamp()}.db`,
        filters: [{ name: "SQLite Database", extensions: ["db"] }],
      });
      if (!dest) return;
      setBusy(true);
      setMsg("Exporting database…");
      setMsgKind("info");
      await api.exportDatabase(dest);
      setMsg(`Exported to: ${dest}`);
      setMsgKind("info");
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    } finally {
      setBusy(false);
    }
  }

  async function doBackup() {
    try {
      const dest = await save({
        title: "Backup Database",
        defaultPath: `promas-backup-${todayStamp()}.db`,
        filters: [{ name: "SQLite Database", extensions: ["db"] }],
      });
      if (!dest) return;
      setBusy(true);
      setMsg("Backing up database…");
      setMsgKind("info");
      await api.backupDatabase(dest);
      setMsg(`Backup saved to: ${dest}`);
      setMsgKind("info");
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    } finally {
      setBusy(false);
    }
  }

  async function doChooseLocation() {
    try {
      const selected = await save({
        title: "Choose or create PROMAS database file",
        defaultPath: "promas.db",
        filters: [{ name: "SQLite Database", extensions: ["db", "sqlite"] }],
      });
      if (!selected) return;
      setBusy(true);
      setMsg("Setting database file…");
      setMsgKind("info");
      const path = await api.setDbLocation(selected);
      setDbPath(path);
      setMsg(`Database file set to: ${path}`);
      setMsgKind("info");
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    } finally {
      setBusy(false);
    }
  }

  async function pickImport() {
    try {
      const selected = await open({
        multiple: false,
        title: "Select SQLite database to import",
        filters: [{ name: "SQLite Database", extensions: ["db", "sqlite"] }],
      });
      if (!selected || Array.isArray(selected)) return;
      setPendingImport(selected);
      setConfirmImport(true);
      setMsg("Import REPLACES the current database. Are you sure(Y/N) ?");
      setMsgKind("default");
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    }
  }

  async function doImport() {
    if (!pendingImport) return;
    setConfirmImport(false);
    setBusy(true);
    setMsg("Importing database…");
    setMsgKind("info");
    try {
      const path = await api.importDatabase(pendingImport);
      setDbPath(path);
      setMsg(`Imported successfully. Active database: ${path}`);
      setMsgKind("info");
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    } finally {
      setBusy(false);
      setPendingImport(null);
    }
  }

  async function handleSelect(id: string) {
    if (id === "update") {
      await checkForUpdatesAndApply();
      return;
    }
    log.info("ui", `settings → ${id}`);
    setScreen(id);
    setMsg("");
    setMsgKind("default");
  }

  if (!screen) {
    return (
      <SubMenu
        title=" Settings "
        items={SETTINGS_ITEMS}
        onBack={onBack}
        onSelect={(id) => void handleSelect(id)}
      />
    );
  }

  if (screen === "diagnostics") {
    return <DiagnosticsPanel onBack={() => setScreen(null)} />;
  }

  const titles: Record<string, string> = {
    export: " Export Database ",
    location: " Choose Location of Database ",
    backup: " Backup Database ",
    import: " Import Database ",
  };

  const blurbs: Record<string, string> = {
    export:
      "Save a full copy of the current SQLite database to a file you choose.",
    location:
      "Choose a .db file (or type a new name). An existing file is opened; a new name creates an empty database. The path is remembered for next startup.",
    backup:
      "Create a dated backup copy of the current database.",
    import:
      "Replace the current database with a previously exported or backed-up .db file. A .db.bak safety copy is kept.",
  };

  return (
    <Screen
      statusKeys={[
        { key: "Esc", label: "Back" },
        { key: "Enter", label: "Run" },
        { key: "F1", label: "Help" },
      ]}
      title={titles[screen] ?? " Settings "}
      message={msg || `Version ${APP_VERSION}`}
      messageKind={msgKind}
    >
      <div className="dos-main-wrap">
        <div className="dos-menu-frame" style={{ minWidth: "56ch" }}>
          <div className="menu-header">{titles[screen]}</div>
          <div className="menu-body" style={{ padding: "1em 2ch" }}>
            <div style={{ color: "var(--dos-yellow)", marginBottom: "1em" }}>
              {blurbs[screen]}
            </div>
            <div
              style={{
                color: "var(--dos-cyan-bright)",
                marginBottom: "1em",
                fontSize: "0.9em",
                wordBreak: "break-all",
              }}
            >
              Current database: {dbPath || "…"}
            </div>
            {screen === "export" && (
              <button
                className="dos-btn"
                disabled={busy}
                onClick={() => void doExport()}
                autoFocus
              >
                {busy ? "Exporting…" : "Choose File & Export"}
              </button>
            )}
            {screen === "backup" && (
              <button
                className="dos-btn"
                disabled={busy}
                onClick={() => void doBackup()}
                autoFocus
              >
                {busy ? "Backing up…" : "Choose File & Backup"}
              </button>
            )}
            {screen === "location" && (
              <button
                className="dos-btn"
                disabled={busy}
                onClick={() => void doChooseLocation()}
                autoFocus
              >
                {busy ? "Updating location…" : "Choose Database File"}
              </button>
            )}
            {screen === "import" && (
              <button
                className="dos-btn"
                disabled={busy}
                onClick={() => void pickImport()}
                autoFocus
              >
                {busy ? "Importing…" : "Select Database File & Import"}
              </button>
            )}
          </div>
        </div>
      </div>
      {confirmImport && (
        <Prompt
          question="Are you sure(Y/N) ?  This REPLACES all current data."
          onYes={() => void doImport()}
          onNo={() => {
            setConfirmImport(false);
            setPendingImport(null);
          }}
        />
      )}
      {help && <HelpOverlay onClose={() => setHelp(false)} />}
    </Screen>
  );
}
