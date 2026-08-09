import { useCallback, useEffect, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { api, BackendDiagnostics } from "../api";
import {
  clearSpans,
  formatDiagnosticsText,
  getAppState,
  log,
  metrics,
  setCurrentScreen,
  subscribeAppState,
} from "../lib/observability";
import { APP_VERSION } from "../lib/constants";
import { useDosKeys } from "../dos/hooks";
import { Screen, HelpOverlay } from "../dos/Shell";

function todayStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/** In-app observability viewer: metrics, logs, spans, backend paths. */
export function DiagnosticsPanel({ onBack }: { onBack: () => void }) {
  const [backend, setBackend] = useState<BackendDiagnostics | null>(null);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [msgKind, setMsgKind] = useState<"default" | "error" | "info">("default");
  const [help, setHelp] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setCurrentScreen("diagnostics");
    return () => setCurrentScreen("settings");
  }, []);

  const refresh = useCallback(() => {
    setText(formatDiagnosticsText(backend));
    setTick((t) => t + 1);
  }, [backend]);

  useEffect(() => {
    let cancelled = false;
    api
      .getBackendDiagnostics()
      .then((d) => {
        if (!cancelled) setBackend(d);
      })
      .catch((e) => {
        if (!cancelled) {
          setMsg(String(e));
          setMsgKind("error");
          log.warn("app", "backend diagnostics unavailable", {
            error: String(e),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    refresh();
  }, [backend, refresh]);

  useEffect(() => {
    const unsubLog = log.subscribe(() => refresh());
    const unsubState = subscribeAppState(() => refresh());
    const interval = setInterval(refresh, 2000);
    return () => {
      unsubLog();
      unsubState();
      clearInterval(interval);
    };
  }, [refresh]);

  function clearMemory() {
    log.clear();
    clearSpans();
    metrics.reset();
    refresh();
    setMsg("Cleared in-memory logs, spans, and metrics.");
    setMsgKind("info");
    metrics.inc("diagnostics.clear");
  }

  async function copyBundle() {
    try {
      const body = formatDiagnosticsText(backend, { sanitize: true });
      await navigator.clipboard.writeText(body);
      setMsg("Diagnostics copied (local paths redacted).");
      setMsgKind("info");
      log.info("app", "diagnostics copied");
      metrics.inc("diagnostics.copy");
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    }
  }

  async function saveBundle() {
    try {
      const dest = await save({
        title: "Save Diagnostics Bundle",
        defaultPath: `promas-diagnostics-${todayStamp()}.txt`,
        filters: [{ name: "Text", extensions: ["txt"] }],
      });
      if (!dest) return;
      const body = formatDiagnosticsText(backend, { sanitize: true });
      await api.saveTextFile(dest, body);
      setMsg(`Diagnostics saved (paths redacted): ${dest}`);
      setMsgKind("info");
      log.info("app", "diagnostics saved to file");
      metrics.inc("diagnostics.save_file");
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    }
  }

  async function openLogs() {
    try {
      await api.openLogDir();
      setMsg("Opened log folder.");
      setMsgKind("info");
      metrics.inc("diagnostics.open_log_dir");
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    }
  }

  useDosKeys({
    onEscape: () => {
      if (help) setHelp(false);
      else onBack();
    },
    onF1: () => setHelp(true),
    onChar: (ch) => {
      const c = ch.toLowerCase();
      if (c === "c") {
        void copyBundle();
        return true;
      }
      if (c === "s") {
        void saveBundle();
        return true;
      }
      if (c === "r") {
        refresh();
        setMsg("Refreshed.");
        setMsgKind("info");
        return true;
      }
      if (c === "l") {
        void openLogs();
        return true;
      }
      if (c === "x") {
        clearMemory();
        return true;
      }
      return false;
    },
  });

  const state = getAppState();

  return (
    <Screen
      statusKeys={[
        { key: "Esc", label: "Back" },
        { key: "C", label: "Copy" },
        { key: "S", label: "Save" },
        { key: "R", label: "Refresh" },
        { key: "L", label: "Log folder" },
        { key: "X", label: "Clear" },
        { key: "F1", label: "Help" },
      ]}
      title=" Diagnostics / Observability "
      message={
        msg ||
        `v${APP_VERSION}  screen=${state.currentScreen}  logs=${log.getRecent().length}  #${tick}`
      }
      messageKind={msgKind}
    >
      <div
        className="dos-main-wrap"
        style={{ alignItems: "stretch", width: "100%" }}
      >
        <div
          className="dos-menu-frame"
          style={{
            minWidth: "min(92ch, 96vw)",
            maxWidth: "96vw",
            width: "100%",
          }}
        >
          <div className="menu-header"> Metrics · Traces · Logs · State </div>
          <div className="menu-body" style={{ padding: "0.6em 1ch" }}>
            <div
              style={{
                display: "flex",
                gap: "1ch",
                flexWrap: "wrap",
                marginBottom: "0.6em",
              }}
            >
              <button
                className="dos-btn"
                onClick={() => void copyBundle()}
                autoFocus
              >
                Copy bundle (C)
              </button>
              <button className="dos-btn" onClick={() => void saveBundle()}>
                Save to file (S)
              </button>
              <button className="dos-btn" onClick={refresh}>
                Refresh (R)
              </button>
              <button className="dos-btn" onClick={() => void openLogs()}>
                Open log folder (L)
              </button>
              <button className="dos-btn" onClick={clearMemory}>
                Clear memory (X)
              </button>
            </div>
            <pre
              style={{
                margin: 0,
                maxHeight: "58vh",
                overflow: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                color: "var(--dos-white-bright)",
                fontSize: "0.85em",
                lineHeight: 1.35,
                background: "rgba(0,0,0,0.25)",
                padding: "0.6em 1ch",
                border: "1px solid var(--dos-cyan)",
              }}
            >
              {text || "Loading…"}
            </pre>
          </div>
        </div>
      </div>
      {help && <HelpOverlay onClose={() => setHelp(false)} />}
    </Screen>
  );
}
