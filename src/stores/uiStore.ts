export type UpdateDialogPhase =
  | "idle"
  | "checking"
  | "up_to_date"
  | "downloading"
  | "installing"
  | "error";

type Listener = () => void;

let showUpdateDialog = false;
let updatePhase: UpdateDialogPhase = "idle";
let updateMessage = "";
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

export function getUpdateUiState() {
  return { showUpdateDialog, updatePhase, updateMessage };
}

export function subscribeUpdateUi(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function openUpdateDialog() {
  showUpdateDialog = true;
  updatePhase = "checking";
  updateMessage = "Checking for updates…";
  emit();
}

export function closeUpdateDialog() {
  showUpdateDialog = false;
  updatePhase = "idle";
  updateMessage = "";
  emit();
}

export function setUpdateDialog(opts: {
  phase: UpdateDialogPhase;
  message: string;
}) {
  updatePhase = opts.phase;
  updateMessage = opts.message;
  showUpdateDialog = true;
  emit();
}

/** Reset module state between unit tests. */
export function resetUpdateUiForTests() {
  showUpdateDialog = false;
  updatePhase = "idle";
  updateMessage = "";
  listeners.clear();
}
