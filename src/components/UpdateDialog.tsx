import { useEffect, useLayoutEffect, useState } from "react";
import {
  closeUpdateDialog,
  getUpdateUiState,
  subscribeUpdateUi,
  UpdateDialogPhase,
} from "../stores/uiStore";
import { Dialog } from "../dos/Shell";

function titleForPhase(phase: UpdateDialogPhase): string {
  switch (phase) {
    case "checking":
      return "Checking for Updates";
    case "downloading":
      return "Downloading Update";
    case "installing":
      return "Installing Update";
    case "up_to_date":
      return "Up to Date";
    case "error":
      return "Update Error";
    default:
      return "Updates";
  }
}

function updateDialogBusy(phase: UpdateDialogPhase): boolean {
  return (
    phase === "checking" || phase === "downloading" || phase === "installing"
  );
}

/** WebView2 still clicks a focused button after Enter. Swallow that click so it cannot land on the menu underneath and reopen the popup. */
function swallowButtonActivation() {
  const swallow = (ev: Event) => {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
  };
  window.addEventListener("click", swallow, true);
  window.addEventListener("keypress", swallow, true);
  window.addEventListener("keyup", swallow, true);
  window.setTimeout(() => {
    window.removeEventListener("click", swallow, true);
    window.removeEventListener("keypress", swallow, true);
    window.removeEventListener("keyup", swallow, true);
  }, 0);
}

export function UpdateDialog() {
  const [state, setState] = useState(getUpdateUiState);

  useEffect(() => subscribeUpdateUi(() => setState(getUpdateUiState())), []);

  // Registered for the life of the app, ahead of each screen's key handler.
  // Re-binding when the popup opens would run after those handlers, so Esc
  // would leave Settings instead of closing this dialog.
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = getUpdateUiState();
      if (!ui.showUpdateDialog) return;
      if (e.key !== "Enter" && e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (updateDialogBusy(ui.updatePhase)) return;
      if (e.key === "Enter") swallowButtonActivation();
      closeUpdateDialog();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  if (!state.showUpdateDialog) return null;

  const busy = updateDialogBusy(state.updatePhase);

  return (
    <Dialog
      title={titleForPhase(state.updatePhase)}
      wide
      red={state.updatePhase === "error"}
      foot={busy ? "Please wait…" : "Enter / Esc = Close"}
    >
      <div style={{ whiteSpace: "pre-wrap", marginBottom: "1em" }}>
        {state.updateMessage}
      </div>
      {!busy && (
        <div style={{ textAlign: "center" }}>
          <button
            type="button"
            className="dos-btn"
            autoFocus
            onClick={closeUpdateDialog}
            onKeyDown={(e) => {
              // Backup if Enter is delivered only to the focused button.
              // preventDefault stops WebView2 from also synthesizing a click.
              if (e.key !== "Enter") return;
              e.preventDefault();
              e.stopPropagation();
              const ui = getUpdateUiState();
              if (!ui.showUpdateDialog || updateDialogBusy(ui.updatePhase)) return;
              swallowButtonActivation();
              closeUpdateDialog();
            }}
          >
            Close
          </button>
        </div>
      )}
    </Dialog>
  );
}
