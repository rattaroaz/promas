import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderApp, screen, userEvent, waitFor } from "../test/render";
import { SettingsScreen } from "./SettingsScreen";
import { UpdateDialog } from "../components/UpdateDialog";
import { api } from "../api";
import { APP_VERSION } from "../lib/constants";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  closeUpdateDialog,
  openUpdateDialog,
  setUpdateDialog,
} from "../stores/uiStore";

vi.mock("../services/updateService", () => ({
  checkForUpdatesAndApply: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(),
  open: vi.fn(),
}));

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    api: {
      ...actual.api,
      getDbPath: vi.fn().mockResolvedValue("C:\\mock\\promas.db"),
      backupDatabase: vi.fn().mockResolvedValue(undefined),
      setDbLocation: vi.fn().mockResolvedValue({
        path: "D:\\data\\promas.db",
        created: false,
      }),
      importDatabase: vi.fn().mockResolvedValue("C:\\mock\\promas.db"),
      getBackendDiagnostics: vi.fn().mockResolvedValue({
        dbPath: "C:\\mock\\promas.db",
        logDir: "C:\\mock\\logs",
        rustVersion: "rustc 1.80.0 (051478957 2024-07-21)",
        crateVersion: "2.0.0",
        targetTriple: "x86_64-pc-windows-msvc",
      }),
      openLogDir: vi.fn().mockResolvedValue(undefined),
    },
  };
});

describe("SettingsScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getDbPath).mockResolvedValue("C:\\mock\\promas.db");
    vi.mocked(api.backupDatabase).mockResolvedValue(undefined);
    vi.mocked(api.setDbLocation).mockResolvedValue({
      path: "D:\\data\\promas.db",
      created: false,
    });
    vi.mocked(api.importDatabase).mockResolvedValue("C:\\mock\\promas.db");
  });

  it("shows settings options including Diagnostics", () => {
    renderApp(<SettingsScreen onBack={vi.fn()} />);
    expect(screen.getByText(/Update Application/i)).toBeInTheDocument();
    expect(screen.queryByText(/Export Database/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Choose Location of Database/i)).toBeInTheDocument();
    expect(screen.getByText(/Backup Database/i)).toBeInTheDocument();
    expect(screen.getByText(/Import Database/i)).toBeInTheDocument();
    expect(screen.getByText(/Diagnostics/i)).toBeInTheDocument();
  });

  it("calls update service for Update Application", async () => {
    const user = userEvent.setup();
    const { checkForUpdatesAndApply } = await import("../services/updateService");
    renderApp(<SettingsScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Update Application/i }));
    expect(checkForUpdatesAndApply).toHaveBeenCalled();
  });

  it("closes the update popup on Enter and Esc without leaving Settings", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const { checkForUpdatesAndApply } = await import("../services/updateService");
    renderApp(
      <>
        <UpdateDialog />
        <SettingsScreen onBack={onBack} />
      </>
    );

    act(() => {
      setUpdateDialog({ phase: "up_to_date", message: "PROMAS is up to date." });
    });
    expect(await screen.findByRole("button", { name: "Close" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    expect(screen.getByText(/Update Application/i)).toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
    expect(checkForUpdatesAndApply).not.toHaveBeenCalled();

    act(() => {
      setUpdateDialog({ phase: "up_to_date", message: "PROMAS is up to date." });
    });
    expect(await screen.findByRole("button", { name: "Close" })).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
    expect(checkForUpdatesAndApply).not.toHaveBeenCalled();

    act(() => {
      openUpdateDialog();
    });
    expect(screen.getByText("Checking for Updates")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.keyboard("{Enter}");
    expect(screen.getByText("Checking for Updates")).toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
    expect(checkForUpdatesAndApply).not.toHaveBeenCalled();
    act(() => {
      closeUpdateDialog();
    });
  });

  it("opens backup panel from the settings menu", async () => {
    const user = userEvent.setup();
    renderApp(<SettingsScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Backup Database/i }));
    expect(screen.getByText(/Choose File & Backup/i)).toBeInTheDocument();
  });

  it("backs up when dialog returns a path", async () => {
    const user = userEvent.setup();
    vi.mocked(save).mockResolvedValue("C:\\backups\\promas-backup.db");
    renderApp(<SettingsScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Backup Database/i }));
    await user.click(screen.getByRole("button", { name: /Choose File & Backup/i }));
    await waitFor(() => {
      expect(api.backupDatabase).toHaveBeenCalledWith("C:\\backups\\promas-backup.db");
    });
    expect(await screen.findByText(/Backup saved to: C:\\backups\\promas-backup.db/i)).toBeInTheDocument();
  });

  it("opens existing database without overwrite messaging", async () => {
    const user = userEvent.setup();
    vi.mocked(open).mockResolvedValue("D:\\data\\existing.db");
    vi.mocked(api.setDbLocation).mockResolvedValue({
      path: "D:\\data\\existing.db",
      created: false,
    });
    renderApp(<SettingsScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Choose Location of Database/i }));
    await user.click(screen.getByRole("button", { name: /Open Existing Database/i }));
    await waitFor(() => {
      expect(api.setDbLocation).toHaveBeenCalledWith("D:\\data\\existing.db");
    });
    expect(
      await screen.findByText(/Using existing database \(not overwritten\): D:\\data\\existing.db/i)
    ).toBeInTheDocument();
  });

  it("creates a new database file via save dialog", async () => {
    const user = userEvent.setup();
    vi.mocked(save).mockResolvedValue("D:\\data\\new-promas.db");
    vi.mocked(api.setDbLocation).mockResolvedValue({
      path: "D:\\data\\new-promas.db",
      created: true,
    });
    renderApp(<SettingsScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Choose Location of Database/i }));
    await user.click(screen.getByRole("button", { name: /Create New Database File/i }));
    await waitFor(() => {
      expect(api.setDbLocation).toHaveBeenCalledWith("D:\\data\\new-promas.db");
    });
    expect(
      await screen.findByText(/Created new database: D:\\data\\new-promas.db/i)
    ).toBeInTheDocument();
  });

  it("imports after confirm when file dialog returns a path", async () => {
    const user = userEvent.setup();
    vi.mocked(open).mockResolvedValue("C:\\imports\\copy.db");
    renderApp(<SettingsScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Import Database/i }));
    await user.click(screen.getByRole("button", { name: /Select Database File & Import/i }));
    expect(await screen.findByRole("button", { name: /^Y$/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Y$/i }));
    await waitFor(() => {
      expect(api.importDatabase).toHaveBeenCalledWith("C:\\imports\\copy.db");
    });
    expect(
      await screen.findByText(/Imported successfully\. Active database: C:\\mock\\promas.db/i)
    ).toBeInTheDocument();
  });

  it("shows error when backup fails", async () => {
    const user = userEvent.setup();
    vi.mocked(save).mockResolvedValue("C:\\backups\\fail.db");
    vi.mocked(api.backupDatabase).mockRejectedValue(new Error("disk full"));
    renderApp(<SettingsScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Backup Database/i }));
    await user.click(screen.getByRole("button", { name: /Choose File & Backup/i }));
    expect(await screen.findByText(/disk full/i)).toBeInTheDocument();
  });

  it("no-ops backup when dialog is cancelled", async () => {
    const user = userEvent.setup();
    vi.mocked(save).mockResolvedValue(null);
    renderApp(<SettingsScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Backup Database/i }));
    await user.click(screen.getByRole("button", { name: /Choose File & Backup/i }));
    await waitFor(() => {
      expect(save).toHaveBeenCalled();
    });
    expect(api.backupDatabase).not.toHaveBeenCalled();
  });

  it("Esc goes from a panel back to the Settings menu, then out", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    renderApp(<SettingsScreen onBack={onBack} />);
    await user.click(screen.getByRole("button", { name: /Backup Database/i }));
    expect(await screen.findByText(/Current database: C:\\mock\\promas\.db/)).toBeInTheDocument();
    expect(messageBar()).toHaveTextContent(`Version ${APP_VERSION}`);
    key("Escape");
    expect(screen.getByRole("button", { name: /Update Application/i })).toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
    key("Escape");
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("shows why the database path could not be read", async () => {
    const user = userEvent.setup();
    vi.mocked(api.getDbPath).mockRejectedValue("no database is open");
    renderApp(<SettingsScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Backup Database/i }));
    expect(await screen.findByText("no database is open")).toBeInTheDocument();
    expect(screen.getByText("Current database: …")).toBeInTheDocument();
  });

  it("disables backup while it runs", async () => {
    const user = userEvent.setup();
    let finish!: () => void;
    vi.mocked(save).mockResolvedValue("C:\\backups\\slow.db");
    vi.mocked(api.backupDatabase).mockImplementation(
      () => new Promise<void>((resolve) => (finish = resolve))
    );
    renderApp(<SettingsScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Backup Database/i }));
    await user.click(screen.getByRole("button", { name: /Choose File & Backup/i }));
    expect(await screen.findByRole("button", { name: "Backing up…" })).toBeDisabled();
    expect(messageBar()).toHaveTextContent("Backing up database…");
    await act(async () => finish());
    expect(screen.getByRole("button", { name: "Choose File & Backup" })).toBeEnabled();
    expect(messageBar()).toHaveTextContent("Backup saved to: C:\\backups\\slow.db");
  });

  it.each([
    ["Open Existing Database", open],
    ["Create New Database File", save],
  ] as const)("%s reports a file dialog that fails to open", async (button, dialog) => {
    const user = userEvent.setup();
    vi.mocked(dialog).mockRejectedValue("dialog unavailable");
    renderApp(<SettingsScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Choose Location of Database/i }));
    await user.click(screen.getByRole("button", { name: button }));
    expect(await screen.findByText("dialog unavailable")).toBeInTheDocument();
    expect(api.setDbLocation).not.toHaveBeenCalled();
  });

  it("keeps the current database when the new location fails", async () => {
    const user = userEvent.setup();
    vi.mocked(open).mockResolvedValue("Z:\\gone\\promas.db");
    vi.mocked(api.setDbLocation).mockRejectedValue("Z: is not available");
    renderApp(<SettingsScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Choose Location of Database/i }));
    await user.click(screen.getByRole("button", { name: /Open Existing Database/i }));
    expect(await screen.findByText("Z: is not available")).toBeInTheDocument();
    expect(screen.getByText(/Current database: C:\\mock\\promas\.db/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Existing Database" })).toBeEnabled();
  });

  it.each([
    ["no file chosen", null],
    ["several files chosen", ["a.db", "b.db"]],
  ])("does not ask to import with %s", async (_label, picked) => {
    const user = userEvent.setup();
    vi.mocked(open).mockResolvedValue(picked);
    renderApp(<SettingsScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Import Database/i }));
    await user.click(screen.getByRole("button", { name: /Select Database File & Import/i }));
    await waitFor(() => expect(open).toHaveBeenCalled());
    expect(screen.queryByRole("dialog", { name: IMPORT_QUESTION })).not.toBeInTheDocument();
  });

  it("reports an import file dialog that fails to open", async () => {
    const user = userEvent.setup();
    vi.mocked(open).mockRejectedValue("dialog unavailable");
    renderApp(<SettingsScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Import Database/i }));
    await user.click(screen.getByRole("button", { name: /Select Database File & Import/i }));
    expect(await screen.findByText("dialog unavailable")).toBeInTheDocument();
  });

  async function askToImport() {
    const user = userEvent.setup();
    vi.mocked(open).mockResolvedValue("C:\\imports\\copy.db");
    renderApp(<SettingsScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Import Database/i }));
    await user.click(screen.getByRole("button", { name: /Select Database File & Import/i }));
    expect(await screen.findByRole("dialog", { name: IMPORT_QUESTION })).toBeInTheDocument();
    expect(messageBar()).toHaveTextContent("Import REPLACES the current database.");
    return user;
  }

  it("imports on the Y key", async () => {
    await askToImport();
    key("y");
    await waitFor(() => expect(api.importDatabase).toHaveBeenCalledWith("C:\\imports\\copy.db"));
    expect(await screen.findByText(/Imported successfully/)).toBeInTheDocument();
  });

  it.each(["n", "N", "Escape"])("%s cancels the import and stays on the Import panel", async (k) => {
    await askToImport();
    key(k);
    expect(screen.queryByRole("dialog", { name: IMPORT_QUESTION })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Select Database File & Import/i })).toBeInTheDocument();
    key("y");
    expect(api.importDatabase).not.toHaveBeenCalled();
  });

  it("ignores other keys while asking to import", async () => {
    await askToImport();
    key("x");
    expect(screen.getByRole("dialog", { name: IMPORT_QUESTION })).toBeInTheDocument();
    expect(api.importDatabase).not.toHaveBeenCalled();
  });

  it("cancels the import with the N button", async () => {
    const user = await askToImport();
    await user.click(screen.getByRole("button", { name: "N" }));
    expect(screen.queryByRole("dialog", { name: IMPORT_QUESTION })).not.toBeInTheDocument();
    expect(api.importDatabase).not.toHaveBeenCalled();
  });

  it("shows an import failure and forgets the chosen file", async () => {
    vi.mocked(api.importDatabase).mockRejectedValue("file is not a database");
    await askToImport();
    key("y");
    expect(await screen.findByText("file is not a database")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Select Database File & Import/i })).toBeEnabled();
    key("y");
    expect(api.importDatabase).toHaveBeenCalledOnce();
  });

  it("F1 shows help on a panel, and Esc closes only the help", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    renderApp(<SettingsScreen onBack={onBack} />);
    await user.click(screen.getByRole("button", { name: /Backup Database/i }));
    key("F1");
    expect(screen.getByText(/Function Key Description/)).toBeInTheDocument();
    key("Escape");
    expect(screen.queryByText(/Function Key Description/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Choose File & Backup/i })).toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
  });

  it("opens Diagnostics, and Esc returns to the Settings menu", async () => {
    const user = userEvent.setup();
    renderApp(<SettingsScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Diagnostics/i }));
    expect(document.querySelector(".dos-titlebar")).toHaveTextContent("Diagnostics / Observability");
    await waitFor(() => expect(api.getBackendDiagnostics).toHaveBeenCalled());
    key("Escape");
    expect(screen.getByRole("button", { name: /Update Application/i })).toBeInTheDocument();
  });
});

const IMPORT_QUESTION = /^Are you sure\(Y\/N\) \?\s+This REPLACES all current data\.$/;

const messageBar = () => document.querySelector(".dos-messagebar");

function key(k: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
  });
}
