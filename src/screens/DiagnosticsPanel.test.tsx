import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderApp, screen, userEvent, waitFor } from "../test/render";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { api } from "../api";
import { getAppState, log, metrics } from "../lib/observability";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    api: {
      ...actual.api,
      getBackendDiagnostics: vi.fn(),
      saveTextFile: vi.fn(),
      openLogDir: vi.fn(),
    },
  };
});

const backend = {
  dbPath: "C:\\Users\\kim\\AppData\\promas.db",
  logDir: "C:\\Users\\kim\\AppData\\logs",
  rustVersion: "1.80.0",
  crateVersion: "2.7.0",
  targetTriple: "x86_64-pc-windows-msvc",
};

function report() {
  return document.querySelector("pre")?.textContent ?? "";
}

async function openPanel() {
  const user = userEvent.setup();
  const onBack = vi.fn();
  const view = renderApp(<DiagnosticsPanel onBack={onBack} />);
  await waitFor(() => expect(report()).toContain("crateVersion: 2.7.0"));
  return { user, onBack, ...view };
}

describe("DiagnosticsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getBackendDiagnostics).mockResolvedValue({ ...backend });
    vi.mocked(api.saveTextFile).mockResolvedValue("D:\\share\\diag.txt");
    vi.mocked(api.openLogDir).mockResolvedValue(undefined);
  });

  it("shows the backend details with full paths on screen", async () => {
    await openPanel();
    expect(report()).toContain("dbPath: C:\\Users\\kim\\AppData\\promas.db");
    expect(report()).toContain("target: x86_64-pc-windows-msvc");
    expect(report()).toContain("May include local paths");
    expect(getAppState().currentScreen).toBe("diagnostics");
  });

  it("copies the bundle with local paths redacted", async () => {
    const { user } = await openPanel();
    await user.keyboard("c");
    expect(await screen.findByText("Diagnostics copied (local paths redacted).")).toBeInTheDocument();
    const copied = await navigator.clipboard.readText();
    expect(copied).toContain("dbPath: <redacted-path>");
    expect(copied).toContain("NOTE: Local paths redacted for sharing.");
    expect(copied).not.toContain("kim");
    expect(metrics.snapshot().counters["diagnostics.copy"]).toBe(1);
  });

  it("shows a clipboard failure", async () => {
    const { user } = await openPanel();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("clipboard denied"));
    await user.click(screen.getByRole("button", { name: "Copy bundle (C)" }));
    expect(await screen.findByText(/clipboard denied/)).toBeInTheDocument();
  });

  it("saves the redacted bundle where the user chooses", async () => {
    const { user } = await openPanel();
    await user.keyboard("s");
    await waitFor(() => expect(api.saveTextFile).toHaveBeenCalledTimes(1));
    const [dialog, body] = vi.mocked(api.saveTextFile).mock.calls[0];
    expect(dialog).toMatchObject({ title: "Save Diagnostics Bundle", filterName: "Text", extensions: ["txt"] });
    expect(dialog.fileName).toMatch(/^promas-diagnostics-\d{8}\.txt$/);
    expect(body).toContain("dbPath: <redacted-path>");
    expect(body).not.toContain("kim");
    expect(await screen.findByText("Diagnostics saved (paths redacted): D:\\share\\diag.txt")).toBeInTheDocument();
  });

  it("reports nothing saved when the save is cancelled, and shows a failed write", async () => {
    vi.mocked(api.saveTextFile).mockResolvedValue(null);
    const { user } = await openPanel();
    await user.click(screen.getByRole("button", { name: "Save to file (S)" }));
    await waitFor(() => expect(api.saveTextFile).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(screen.queryByText(/Diagnostics saved/)).not.toBeInTheDocument();

    vi.mocked(api.saveTextFile).mockRejectedValue(new Error("disk full"));
    await user.keyboard("S");
    expect(await screen.findByText(/disk full/)).toBeInTheDocument();
  });

  it("opens the log folder, or shows why it could not", async () => {
    const { user } = await openPanel();
    await user.keyboard("l");
    expect(await screen.findByText("Opened log folder.")).toBeInTheDocument();
    vi.mocked(api.openLogDir).mockRejectedValue(new Error("no file manager"));
    await user.click(screen.getByRole("button", { name: "Open log folder (L)" }));
    expect(await screen.findByText(/no file manager/)).toBeInTheDocument();
  });

  it("shows new log lines as they arrive and on Refresh", async () => {
    const { user } = await openPanel();
    act(() => log.info("app", "first marker"));
    await waitFor(() => expect(report()).toContain("first marker"));
    await user.keyboard("r");
    expect(await screen.findByText("Refreshed.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh (R)" }));
    expect(report()).toContain("first marker");
  });

  it("clears logs, spans, and metrics", async () => {
    const { user } = await openPanel();
    metrics.inc("invoice.save");
    act(() => log.info("app", "old marker"));
    await waitFor(() => expect(report()).toContain("old marker"));
    await user.keyboard("x");
    expect(await screen.findByText("Cleared in-memory logs, spans, and metrics.")).toBeInTheDocument();
    expect(report()).not.toContain("old marker");
    expect(metrics.snapshot().counters["invoice.save"]).toBeUndefined();
    expect(metrics.snapshot().counters["diagnostics.clear"]).toBe(1);
  });

  it("reports an unavailable backend", async () => {
    vi.mocked(api.getBackendDiagnostics).mockRejectedValue(new Error("command not found"));
    renderApp(<DiagnosticsPanel onBack={vi.fn()} />);
    expect(await screen.findByText("Error: command not found")).toBeInTheDocument();
    expect(report()).toContain("--- backend ---\n(unavailable)");
    expect(log.getRecent().some((e) => e.message === "backend diagnostics unavailable")).toBe(true);
  });

  it("closes help on Esc, then goes back, and restores the settings screen name", async () => {
    const { user, onBack, unmount } = await openPanel();
    await user.keyboard("{F1}");
    expect(screen.getByText(/Function Key Description/)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByText(/Function Key Description/)).not.toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(onBack).toHaveBeenCalledTimes(1);
    unmount();
    expect(getAppState().currentScreen).toBe("settings");
  });

  it("refreshes on its own every two seconds", async () => {
    vi.useFakeTimers();
    try {
      renderApp(<DiagnosticsPanel onBack={vi.fn()} />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      const counter = () => Number(/#(\d+)$/.exec(document.querySelector(".dos-messagebar")?.textContent ?? "")?.[1]);
      const before = counter();
      expect(before).toBeGreaterThan(0);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });
      expect(counter()).toBe(before + 2);
    } finally {
      vi.useRealTimers();
    }
  });
});
