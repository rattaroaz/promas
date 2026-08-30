type Listener = () => void;

let previewUrl: string | null = null;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

export function getPrintPreviewUrl() {
  return previewUrl;
}

export function subscribePrintPreview(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function openPrintPreview(url: string) {
  if (previewUrl?.startsWith("blob:")) {
    URL.revokeObjectURL(previewUrl);
  }
  previewUrl = url;
  emit();
}

/** Returns true if a preview was open and is now closed. */
export function closePrintPreview(): boolean {
  if (!previewUrl) return false;
  if (previewUrl.startsWith("blob:")) {
    URL.revokeObjectURL(previewUrl);
  }
  previewUrl = null;
  emit();
  return true;
}

export function resetPrintPreviewForTests() {
  previewUrl = null;
  listeners.clear();
}
