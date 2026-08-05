import { useEffect, useState } from "react";
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

export function UpdateDialog() {
  const [state, setState] = useState(getUpdateUiState);

  useEffect(() => subscribeUpdateUi(() => setState(getUpdateUiState())), []);

  if (!state.showUpdateDialog) return null;

  const busy =
    state.updatePhase === "checking" ||
    state.updatePhase === "downloading" ||
    state.updatePhase === "installing";

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
          <button className="dos-btn" onClick={closeUpdateDialog} autoFocus>
            Close
          </button>
        </div>
      )}
    </Dialog>
  );
}
