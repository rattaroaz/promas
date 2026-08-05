import { describe, expect, it, vi } from "vitest";
import { renderApp, screen, userEvent } from "../test/render";
import { SettingsScreen } from "./SettingsScreen";

vi.mock("../services/updateService", () => ({
  checkForUpdatesAndApply: vi.fn(),
}));

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    api: {
      ...actual.api,
      getDbPath: vi.fn().mockResolvedValue("C:\\mock\\promas.db"),
      exportDatabase: vi.fn(),
      backupDatabase: vi.fn(),
      setDbLocation: vi.fn(),
      importDatabase: vi.fn(),
    },
  };
});

describe("SettingsScreen", () => {
  it("shows the five settings options", () => {
    renderApp(<SettingsScreen onBack={vi.fn()} />);
    expect(screen.getByText(/Update Application/i)).toBeInTheDocument();
    expect(screen.getByText(/Export Database/i)).toBeInTheDocument();
    expect(screen.getByText(/Choose Location of Database/i)).toBeInTheDocument();
    expect(screen.getByText(/Backup Database/i)).toBeInTheDocument();
    expect(screen.getByText(/Import Database/i)).toBeInTheDocument();
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
});
