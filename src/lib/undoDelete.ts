/** Recent Delete-button actions. F2 and the status control undo the latest one. */

type UndoEntry = {
  undo: () => void | Promise<void>;
  scope?: string;
};

let stack: UndoEntry[] = [];
let hooks = 0;
let busy = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function undoDeleteCount(): number {
  return stack.length;
}

export function subscribeUndoDeletes(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Remember a delete so F2 can put it back. `scope` can be dropped when a form is discarded. */
export function pushUndoDelete(undo: () => void | Promise<void>, scope?: string) {
  stack = [...stack, { undo, scope }];
  emit();
}

export function clearUndoScope(scope: string) {
  const next = stack.filter((entry) => entry.scope !== scope);
  if (next.length === stack.length) return;
  stack = next;
  emit();
}

export function resetUndoDeletesForTests() {
  stack = [];
  busy = false;
  emit();
}

/** Put back the most recent delete. Earlier ones stay until F2 is used again. */
export async function undoLastDelete() {
  if (busy) return;
  const entry = stack[stack.length - 1];
  if (!entry) return;
  busy = true;
  stack = stack.slice(0, -1);
  emit();
  try {
    await entry.undo();
  } catch (err) {
    stack = [...stack, entry];
    emit();
    throw err;
  } finally {
    busy = false;
  }
}

function onUndoKey(e: KeyboardEvent) {
  if (e.key !== "F2" || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
  if (stack.length === 0 || busy) return;
  e.preventDefault();
  e.stopPropagation();
  void undoLastDelete();
}

/** One window listener, shared by every status bar. */
export function mountUndoDeleteKeys(): () => void {
  hooks += 1;
  if (hooks === 1) window.addEventListener("keydown", onUndoKey, true);
  return () => {
    hooks -= 1;
    if (hooks === 0) window.removeEventListener("keydown", onUndoKey, true);
  };
}
