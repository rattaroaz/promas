import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderApp, screen, userEvent, waitFor } from "../test/render";
import { SettingsScreen } from "./SettingsScreen";
import { api } from "../api";
import { open, save } from "@tauri-apps/plugin-dialog";

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
        rustVersion: "x86_64-windows",
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
});
