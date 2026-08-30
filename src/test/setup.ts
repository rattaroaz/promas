import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { resetUpdateUiForTests } from "../stores/uiStore";
import { resetPrintPreviewForTests } from "../stores/printPreviewStore";
import { resetObservabilityForTests } from "../lib/observability";

afterEach(() => {
  cleanup();
  resetUpdateUiForTests();
  resetPrintPreviewForTests();
  resetObservabilityForTests();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
