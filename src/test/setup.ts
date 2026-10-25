import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup, configure } from "@testing-library/react";
import { resetUpdateUiForTests } from "../stores/uiStore";
import { resetPrintPreviewForTests } from "../stores/printPreviewStore";
import { resetObservabilityForTests } from "../lib/observability";
import { resetPointerHoverMute } from "../dos/hooks";
import { resetUndoDeletesForTests } from "../lib/undoDelete";

// The whole suite runs files in parallel; one second is too tight for a
// findBy on a busy machine. A real hang still fails, just later.
configure({ asyncUtilTimeout: 3000 });

// jsdom does no layout and leaves scrollIntoView out; browse lists call it
// whenever the selected row moves.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => undefined;
}

afterEach(() => {
  cleanup();
  resetUpdateUiForTests();
  resetPrintPreviewForTests();
  resetObservabilityForTests();
  resetPointerHoverMute();
  resetUndoDeletesForTests();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
