import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderApp, screen, userEvent, waitFor } from "../test/render";
import { MiscScreen } from "./MiscScreen";
import { api } from "../api";
import { open } from "@tauri-apps/plugin-dialog";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    api: {
      ...actual.api,
      reindexDataFiles: vi.fn(),
      importDbfFolder: vi.fn(),
      getSysdata: vi.fn(),
      listForms: vi.fn(),
      listWorkPersons: vi.fn(),
      saveWorkPerson: vi.fn(),
      deleteWorkPerson: vi.fn(),
    },
  };
});

describe("MiscScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.reindexDataFiles).mockResolvedValue("Reindex complete.");
    vi.mocked(api.importDbfFolder).mockResolvedValue({
      companies: 2,
      properties: 4,
      employees: 1,
      workTypes: 3,
      invoices: 10,
      invoiceLines: 20,
      cashReceipts: 5,
      materials: 0,
      workOrders: 1,
      estimates: 0,
      messages: ["Import completed successfully"],
    });
  });

  it("lists Workers as option 5", async () => {
    const user = userEvent.setup();
    vi.mocked(api.listWorkPersons).mockResolvedValue([
      { name: "Jose Ramirez", workerNo: "", active: true },
    ]);
    renderApp(<MiscScreen onBack={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /5\.\s*Workers/i })
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /5\.\s*Workers/i }));
    expect(await screen.findByRole("button", { name: "Add Work Person" })).toBeInTheDocument();
    expect(await screen.findByLabelText("Worker name 1")).toHaveValue(
      "Jose Ramirez"
    );
  });

  it("closes a Workers delete prompt on Esc without leaving the screen", async () => {
    const user = userEvent.setup();
    vi.mocked(api.listWorkPersons).mockResolvedValue([
      { name: "Jose Ramirez", workerNo: "", active: true },
    ]);
    vi.mocked(api.deleteWorkPerson).mockResolvedValue([]);
    renderApp(<MiscScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /5\.\s*Workers/i }));
    await user.click(
      await screen.findByRole("button", { name: "Delete Jose Ramirez" })
    );
    expect(
      screen.getByRole("dialog", { name: "Are you sure? Y/N" })
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add Work Person" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /5\.\s*Workers/i })
    ).not.toBeInTheDocument();
    expect(api.deleteWorkPerson).not.toHaveBeenCalled();
  });

  it("lists Import Database as option 4", () => {
    renderApp(<MiscScreen onBack={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /4\.\s*Import Database/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /2\.\s*Reindex Data Files/i })
    ).toBeInTheDocument();
  });

  it("imports original DBF folder after confirm", async () => {
    const user = userEvent.setup();
    vi.mocked(open).mockResolvedValue("C:\\DKSKapp\\COMPBACK\\PROMAS");
    renderApp(<MiscScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /4\.\s*Import Database/i }));
    await user.click(
      screen.getByRole("button", { name: /Select Original PROMAS Folder & Import/i })
    );
    expect(
      screen.getByText(/Import REPLACES all current data/i)
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Y$/i }));
    await waitFor(() => {
      expect(api.importDbfFolder).toHaveBeenCalledWith(
        "C:\\DKSKapp\\COMPBACK\\PROMAS"
      );
    });
    expect(await screen.findByText(/Imported original PROMAS data/i)).toBeInTheDocument();
  });

  it("offers original import from Reindex Data Files", async () => {
    const user = userEvent.setup();
    renderApp(<MiscScreen onBack={vi.fn()} />);
    await user.click(
      screen.getByRole("button", { name: /2\.\s*Reindex Data Files/i })
    );
    expect(screen.getByRole("button", { name: /Reindex Now/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Select Original PROMAS Folder & Import/i })
    ).toBeInTheDocument();
  });
});
