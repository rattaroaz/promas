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
      exportDatabase: vi.fn().mockResolvedValue(undefined),
      backupDatabase: vi.fn().mockResolvedValue(undefined),
      setDbLocation: vi.fn().mockResolvedValue("D:\\data\\promas.db"),
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
    vi.mocked(api.exportDatabase).mockResolvedValue(undefined);
    vi.mocked(api.backupDatabase).mockResolvedValue(undefined);
    vi.mocked(api.setDbLocation).mockResolvedValue("D:\\data\\promas.db");
    vi.mocked(api.importDatabase).mockResolvedValue("C:\\mock\\promas.db");
  });

  it("shows settings options including Diagnostics", () => {
    renderApp(<SettingsScreen onBack={vi.fn()} />);
    expect(screen.getByText(/Update Application/i)).toBeInTheDocument();
    expect(screen.getByText(/Export Database/i)).toBeInTheDocument();
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

  it("opens export panel and returns on Esc via onBack from menu", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    renderApp(<SettingsScreen onBack={onBack} />);
    await user.click(screen.getByRole("button", { name: /Export Database/i }));
    expect(screen.getByText(/Choose File & Export/i)).toBeInTheDocument();
  });

  it("exports when dialog returns a path", async () => {
    const user = userEvent.setup();
    vi.mocked(save).mockResolvedValue("C:\\exports\\promas-export.db");
    renderApp(<SettingsScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Export Database/i }));
    await user.click(screen.getByRole("button", { name: /Choose File & Export/i }));
    await waitFor(() => {
      expect(api.exportDatabase).toHaveBeenCalledWith("C:\\exports\\promas-export.db");
    });
    expect(await screen.findByText(/Exported to: C:\\exports\\promas-export.db/i)).toBeInTheDocument();
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

  it("sets location when file dialog returns a path", async () => {
    const user = userEvent.setup();
    vi.mocked(save).mockResolvedValue("D:\\data\\my-promas.db");
    vi.mocked(api.setDbLocation).mockResolvedValue("D:\\data\\my-promas.db");
    renderApp(<SettingsScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Choose Location of Database/i }));
    await user.click(screen.getByRole("button", { name: /Choose Database File/i }));
    await waitFor(() => {
      expect(api.setDbLocation).toHaveBeenCalledWith("D:\\data\\my-promas.db");
    });
    expect(
      await screen.findByText(/Database file set to: D:\\data\\my-promas.db/i)
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

  it("shows error when export fails", async () => {
    const user = userEvent.setup();
    vi.mocked(save).mockResolvedValue("C:\\exports\\fail.db");
    vi.mocked(api.exportDatabase).mockRejectedValue(new Error("disk full"));
    renderApp(<SettingsScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Export Database/i }));
    await user.click(screen.getByRole("button", { name: /Choose File & Export/i }));
    expect(await screen.findByText(/disk full/i)).toBeInTheDocument();
  });

  it("no-ops export when dialog is cancelled", async () => {
    const user = userEvent.setup();
    vi.mocked(save).mockResolvedValue(null);
    renderApp(<SettingsScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Export Database/i }));
    await user.click(screen.getByRole("button", { name: /Choose File & Export/i }));
    await waitFor(() => {
      expect(save).toHaveBeenCalled();
    });
    expect(api.exportDatabase).not.toHaveBeenCalled();
  });
});
