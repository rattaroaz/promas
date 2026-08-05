import { beforeEach, describe, expect, it, vi } from "vitest";
import { APP_VERSION } from "../lib/constants";
import { getUpdateUiState } from "../stores/uiStore";

const check = vi.fn();
const relaunch = vi.fn();
const downloadAndInstall = vi.fn();

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: (...args: unknown[]) => check(...args),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: (...args: unknown[]) => relaunch(...args),
}));

describe("checkForUpdatesAndApply", () => {
  beforeEach(() => {
    check.mockReset();
    relaunch.mockReset();
    downloadAndInstall.mockReset();
  });

  it("shows up to date when check returns null", async () => {
    check.mockResolvedValue(null);
    const { checkForUpdatesAndApply } = await import("./updateService");
    await checkForUpdatesAndApply();
    expect(getUpdateUiState().updatePhase).toBe("up_to_date");
    expect(getUpdateUiState().updateMessage).toContain(APP_VERSION);
    expect(downloadAndInstall).not.toHaveBeenCalled();
  });

  it("shows up to date when remote version is not newer", async () => {
    check.mockResolvedValue({
      version: APP_VERSION,
      downloadAndInstall,
    });
    const { checkForUpdatesAndApply } = await import("./updateService");
    await checkForUpdatesAndApply();
    expect(getUpdateUiState().updatePhase).toBe("up_to_date");
    expect(downloadAndInstall).not.toHaveBeenCalled();
  });

  it("downloads, installs, and relaunches when newer", async () => {
    downloadAndInstall.mockImplementation(async (cb?: (e: { event: string }) => void) => {
      cb?.({ event: "Started" });
      cb?.({ event: "Finished" });
    });
    check.mockResolvedValue({
      version: "99.0.0",
      downloadAndInstall,
    });
    relaunch.mockResolvedValue(undefined);

    const { checkForUpdatesAndApply } = await import("./updateService");
    await checkForUpdatesAndApply();

    expect(downloadAndInstall).toHaveBeenCalled();
    expect(relaunch).toHaveBeenCalled();
    expect(getUpdateUiState().updatePhase).toBe("installing");
  });

  it("shows setup guidance when update feed is missing", async () => {
    check.mockRejectedValue(
      new Error("Could not fetch a valid release JSON from the remote")
    );
    const { checkForUpdatesAndApply } = await import("./updateService");
    await checkForUpdatesAndApply();
    expect(getUpdateUiState().updatePhase).toBe("error");
    expect(getUpdateUiState().updateMessage).toMatch(/No update feed/i);
  });

  it("shows raw error for other failures", async () => {
    check.mockRejectedValue(new Error("signature invalid"));
    const { checkForUpdatesAndApply } = await import("./updateService");
    await checkForUpdatesAndApply();
    expect(getUpdateUiState().updatePhase).toBe("error");
    expect(getUpdateUiState().updateMessage).toContain("signature invalid");
  });

  it("short-circuits to up to date in VITE_E2E mode", async () => {
    vi.stubEnv("VITE_E2E", "true");
    // Re-import is cached; function reads env at call time.
    const { checkForUpdatesAndApply } = await import("./updateService");
    await checkForUpdatesAndApply();
    expect(check).not.toHaveBeenCalled();
    expect(getUpdateUiState().updatePhase).toBe("up_to_date");
  });
});
