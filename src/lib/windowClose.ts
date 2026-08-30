import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

export const QUIT_REQUESTED_EVENT = "quit-requested";

export const QUIT_PROMPT = "Do you want quit (Y/N) ?";

let allowClose = false;

/** @internal tests */
export function resetWindowCloseForTests() {
  allowClose = false;
}

/** After the user answers Yes — allow the next close and quit. */
export async function confirmAppQuit(): Promise<void> {
  allowClose = true;
  try {
    await invoke("confirm_quit");
    return;
  } catch {
    /* browser / e2e / missing command */
  }
  try {
    await getCurrentWindow().close();
  } catch {
    window.close();
  }
}

/**
 * Ask before the native window close (title-bar X / Alt+F4).
 * Rust also emits `quit-requested` after prevent_close.
 */
export function subscribeQuitRequested(onAsk: () => void): () => void {
  let cancelled = false;
  const unsubs: Array<() => void> = [];

  void listen(QUIT_REQUESTED_EVENT, () => {
    if (!cancelled) onAsk();
  })
    .then((fn) => {
      if (cancelled) fn();
      else unsubs.push(fn);
    })
    .catch(() => {
      /* not running under Tauri */
    });

  void getCurrentWindow()
    .onCloseRequested((event) => {
      if (allowClose) return;
      event.preventDefault();
      if (!cancelled) onAsk();
    })
    .then((fn) => {
      if (cancelled) fn();
      else unsubs.push(fn);
    })
    .catch(() => {
      /* not running under Tauri */
    });

  return () => {
    cancelled = true;
    for (const u of unsubs) u();
  };
}
