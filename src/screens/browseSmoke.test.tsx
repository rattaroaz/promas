import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderApp, screen, userEvent, waitFor } from "../test/render";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { MaterialBrowse } from "./MaterialBrowse";
import { WagesReport } from "./WagesReport";
import { api, emptyEmployee, emptyMaterial } from "../api";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    api: {
      ...actual.api,
      listEmployees: vi.fn(),
      listMaterials: vi.fn(),
      listWorkPersons: vi.fn(),
      reportWorkerWages: vi.fn(),
      getBackendDiagnostics: vi.fn(),
    },
  };
});

describe("browse screen smoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listEmployees).mockResolvedValue([
      { ...emptyEmployee(), empNo: "12", name: "Jose Ramirez", phone: "555-0100" },
    ]);
    vi.mocked(api.listWorkPersons).mockResolvedValue([]);
    vi.mocked(api.listMaterials).mockResolvedValue([
      {
        ...emptyMaterial(),
        id: 3,
        empNo: "12",
        description: "Drop cloths",
        amount: 18.5,
      },
    ]);
    vi.mocked(api.reportWorkerWages).mockResolvedValue([
      {
        empNo: "12",
        empName: "Jose Ramirez",
        workDate: "2026-02-10",
        invDate: "2026-02-10",
        invoice: 1,
        companyNo: "1000",
        proNo: "01",
        invAmount: 245,
        rate: 65,
        wages: 159.25,
        description: "Interior Painting",
      },
    ]);
    vi.mocked(api.getBackendDiagnostics).mockResolvedValue({
      dbPath: "C:\\mock\\promas.db",
      logDir: "C:\\mock\\logs",
      rustVersion: "1.80.0",
      crateVersion: "2.7.0",
      targetTriple: "x86_64-pc-windows-msvc",
    });
  });

  it("lists materials", async () => {
    renderApp(<MaterialBrowse onBack={vi.fn()} />);
    expect(await screen.findByText(/1\s+Total Material/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Drop cloths/i })).toBeInTheDocument();
  });

  it("filters Material Transaction in Worker Name by active worker name", async () => {
    const user = userEvent.setup();
    vi.mocked(api.listWorkPersons).mockResolvedValue([
      { name: "Jose Ramirez", workerNo: "400", active: true },
      { name: "Inactive Ian", workerNo: "9", active: false },
    ]);
    renderApp(<MaterialBrowse onBack={vi.fn()} sort="worker" />);
    const picker = await screen.findByRole("combobox", { name: "From Worker Name" });
    expect(screen.getByText("From Worker Name").closest("label")).toHaveTextContent("From Worker Name :");
    expect(screen.getByRole("option", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Jose Ramirez" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Inactive Ian" })
    ).not.toBeInTheDocument();
    await user.selectOptions(picker, "Jose Ramirez");
    await waitFor(() => {
      expect(api.listMaterials).toHaveBeenCalledWith(
        expect.objectContaining({ search: "Jose Ramirez", sort: "worker" })
      );
    });
  });

  it("runs the worker wages report", async () => {
    const user = userEvent.setup();
    renderApp(<WagesReport onBack={vi.fn()} />);
    expect(screen.getByText(/Worker Wages Report/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Run$/i }));
    expect(await screen.findByText(/Total Wages/i)).toBeInTheDocument();
    expect(api.reportWorkerWages).toHaveBeenCalled();
    expect(screen.getByText(/Interior Painting/i)).toBeInTheDocument();
  });

  it("loads the diagnostics panel", async () => {
    renderApp(<DiagnosticsPanel onBack={vi.fn()} />);
    expect(screen.getByText(/Diagnostics \/ Observability/i)).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /Copy bundle/i })
    ).toBeInTheDocument();
    expect(api.getBackendDiagnostics).toHaveBeenCalled();
  });
});
