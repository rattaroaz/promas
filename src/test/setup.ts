import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { resetUpdateUiForTests } from "../stores/uiStore";

afterEach(() => {
  cleanup();
  resetUpdateUiForTests();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
