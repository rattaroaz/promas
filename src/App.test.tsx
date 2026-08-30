import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderApp, screen, userEvent } from "./test/render";
import App from "./App";
import { openPrintPreview } from "./stores/printPreviewStore";

const invoke = vi.fn();
let onAsk: (() => void) | undefined;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: async (_event: string, handler: () => void) => {
    onAsk = handler;
    return () => {
      onAsk = undefined;
    };
  },
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  exit: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    close: vi.fn(),
    onCloseRequested: async () => () => {},
  }),
}));

vi.mock("./components/UpdateDialog", () => ({
  UpdateDialog: () => null,
}));

describe("App window close", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(undefined);
    onAsk = undefined;
  });

  it("asks before quit when the window close event fires", async () => {
    renderApp(<App />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(onAsk).toBeTypeOf("function");
    act(() => onAsk!());
    expect(
      screen.getByText(/Do you want quit \(Y\/N\)/i)
    ).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith("confirm_quit");
  });

  it("does not quit when the user answers N", async () => {
    const user = userEvent.setup();
    renderApp(<App />);
    await act(async () => {
      await Promise.resolve();
    });
    act(() => onAsk!());
    await user.click(screen.getByRole("button", { name: /^N$/i }));
    expect(screen.queryByText(/Do you want quit \(Y\/N\)/i)).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith("confirm_quit");
  });

  it("closes print form with the overlay X without quitting", async () => {
    const user = userEvent.setup();
    renderApp(<App />);
    act(() => openPrintPreview("blob:test-invoice"));
    await user.click(screen.getByRole("button", { name: /Close print form/i }));
    expect(screen.queryByRole("dialog", { name: /Invoice print form/i })).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith("confirm_quit");
  });

  it("closes print form on window X instead of quitting", async () => {
    renderApp(<App />);
    await act(async () => {
      await Promise.resolve();
    });
    act(() => openPrintPreview("blob:test-invoice"));
    expect(screen.getByRole("dialog", { name: /Invoice print form/i })).toBeInTheDocument();
    act(() => onAsk!());
    expect(screen.queryByRole("dialog", { name: /Invoice print form/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Do you want quit \(Y\/N\)/i)).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith("confirm_quit");
  });

  it("quits only after the user answers Y", async () => {
    const user = userEvent.setup();
    renderApp(<App />);
    await act(async () => {
      await Promise.resolve();
    });
    act(() => onAsk!());
    await user.click(screen.getByRole("button", { name: /^Y$/i }));
    expect(invoke).toHaveBeenCalledWith("confirm_quit");
  });
});
