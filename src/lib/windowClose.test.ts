import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const listen = vi.fn();
const onCloseRequested = vi.fn();
const close = vi.fn();
const exit = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => listen(...args),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  exit: (...args: unknown[]) => exit(...args),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    close: (...args: unknown[]) => close(...args),
    onCloseRequested: (...args: unknown[]) => onCloseRequested(...args),
  }),
}));

describe("windowClose", () => {
  beforeEach(async () => {
    invoke.mockReset();
    listen.mockReset();
    onCloseRequested.mockReset();
    close.mockReset();
    exit.mockReset();
    listen.mockResolvedValue(() => {});
    onCloseRequested.mockResolvedValue(() => {});
    const { resetWindowCloseForTests } = await import("./windowClose");
    resetWindowCloseForTests();
  });

  it("confirmAppQuit invokes confirm_quit after allowing close", async () => {
    invoke.mockResolvedValue(undefined);
    const { confirmAppQuit } = await import("./windowClose");
    await confirmAppQuit();
    expect(invoke).toHaveBeenCalledWith("confirm_quit");
    expect(exit).toHaveBeenCalledWith(0);
    expect(close).not.toHaveBeenCalled();
  });

  it("confirmAppQuit falls back to window.close when invoke fails", async () => {
    invoke.mockRejectedValue(new Error("no tauri"));
    exit.mockRejectedValue(new Error("no process plugin"));
    close.mockResolvedValue(undefined);
    const { confirmAppQuit } = await import("./windowClose");
    await confirmAppQuit();
    expect(close).toHaveBeenCalled();
  });

  it("onCloseRequested prevents close and asks unless already confirmed", async () => {
    let handler: ((e: { preventDefault: () => void }) => void) | undefined;
    onCloseRequested.mockImplementation(async (h: typeof handler) => {
      handler = h;
      return () => {};
    });
    const onAsk = vi.fn();
    const { subscribeQuitRequested, confirmAppQuit } = await import(
      "./windowClose"
    );
    subscribeQuitRequested(onAsk);
    await Promise.resolve();
    await Promise.resolve();

    const preventDefault = vi.fn();
    handler!({ preventDefault });
    expect(preventDefault).toHaveBeenCalled();
    expect(onAsk).toHaveBeenCalledTimes(1);

    invoke.mockResolvedValue(undefined);
    await confirmAppQuit();
    preventDefault.mockClear();
    onAsk.mockClear();
    handler!({ preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(onAsk).not.toHaveBeenCalled();
  });
});
