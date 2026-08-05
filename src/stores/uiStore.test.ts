import { describe, expect, it, vi } from "vitest";
import {
  closeUpdateDialog,
  getUpdateUiState,
  openUpdateDialog,
  setUpdateDialog,
  subscribeUpdateUi,
} from "./uiStore";

describe("uiStore update dialog", () => {
  it("opens in checking phase", () => {
    openUpdateDialog();
    expect(getUpdateUiState()).toMatchObject({
      showUpdateDialog: true,
      updatePhase: "checking",
    });
  });

  it("updates phase/message and notifies subscribers", () => {
    const spy = vi.fn();
    const unsub = subscribeUpdateUi(spy);
    setUpdateDialog({ phase: "error", message: "boom" });
    expect(spy).toHaveBeenCalled();
    expect(getUpdateUiState()).toEqual({
      showUpdateDialog: true,
      updatePhase: "error",
      updateMessage: "boom",
    });
    unsub();
  });

  it("closes and resets to idle", () => {
    openUpdateDialog();
    closeUpdateDialog();
    expect(getUpdateUiState()).toEqual({
      showUpdateDialog: false,
      updatePhase: "idle",
      updateMessage: "",
    });
  });

  it("stops notifying after unsubscribe", () => {
    const spy = vi.fn();
    const unsub = subscribeUpdateUi(spy);
    unsub();
    openUpdateDialog();
    expect(spy).not.toHaveBeenCalled();
  });
});
