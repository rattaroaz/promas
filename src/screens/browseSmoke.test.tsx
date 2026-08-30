import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderApp, screen, userEvent } from "../test/render";
import { CashBrowse } from "./CashBrowse";
import { CompanyBrowse } from "./CompanyBrowse";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { MaterialBrowse } from "./MaterialBrowse";
import { WagesReport } from "./WagesReport";
import { WorkOrderBrowse } from "./WorkOrderBrowse";
import { WorkTypeBrowse } from "./WorkTypeBrowse";
import { WorkerBrowse } from "./WorkerBrowse";
import {
  api,
  emptyCashReceipt,
  emptyCompany,
  emptyEmployee,
  emptyMaterial,
  emptyWorkOrder,
  emptyWorkType,
} from "../api";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    api: {
      ...actual.api,
      listCashReceipts: vi.fn(),
      listCompanies: vi.fn(),
      listEmployees: vi.fn(),
      listWorkTypes: vi.fn(),
      listWorkOrders: vi.fn(),
      listMaterials: vi.fn(),
      listInvoices: vi.fn(),
      listProperties: vi.fn(),
      reportWorkerWages: vi.fn(),
      getBackendDiagnostics: vi.fn(),
    },
  };
});

describe("browse screen smoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listCashReceipts).mockResolvedValue([
      {
        ...emptyCashReceipt(),
        id: 1,
        companyNo: "1000",
        invoice: 44,
        payment: 125,
        payRefNo: "CHK-9",
        companyName: "ACME",
      },
    ]);
    vi.mocked(api.listCompanies).mockResolvedValue([
      { ...emptyCompany(), companyNo: "1000", name: "ACME", city: "IRVINE" },
    ]);
    vi.mocked(api.listEmployees).mockResolvedValue([
      { ...emptyEmployee(), empNo: "12", name: "Jose Ramirez", phone: "555-0100" },
    ]);
    vi.mocked(api.listWorkTypes).mockResolvedValue([
      {
        ...emptyWorkType(),
        codeNo: "P1",
        description: "Interior Paint",
        price: 220,
      },
    ]);
    vi.mocked(api.listWorkOrders).mockResolvedValue([
      {
        ...emptyWorkOrder(),
        companyNo: "1000",
        proNo: "01",
        orderDate: "2026-02-01",
        orderNo: 7,
        orderUnit: "A1",
        orderSize: "1+1",
        orderBy: "MGR",
        propertyName: "Bldg A",
      },
    ]);
    vi.mocked(api.listMaterials).mockResolvedValue([
      {
        ...emptyMaterial(),
        id: 3,
        empNo: "12",
        description: "Drop cloths",
        amount: 18.5,
      },
    ]);
    vi.mocked(api.listInvoices).mockResolvedValue([]);
    vi.mocked(api.listProperties).mockResolvedValue([]);
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
      crateVersion: "2.5.4",
      targetTriple: "x86_64-pc-windows-msvc",
    });
  });

  it("lists cash receipts", async () => {
    renderApp(<CashBrowse onBack={vi.fn()} />);
    expect(await screen.findByText(/1 receipts/i)).toBeInTheDocument();
    expect(screen.getByText(/Cash Receipts Process/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /CHK-9/i })).toBeInTheDocument();
  });

  it("lists companies and opens a row", async () => {
    const user = userEvent.setup();
    renderApp(<CompanyBrowse onBack={vi.fn()} />);
    expect(await screen.findByText(/1 companies/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /ACME/i }));
    expect(await screen.findByText(/Company File/i)).toBeInTheDocument();
  });

  it("lists workers and opens edit", async () => {
    const user = userEvent.setup();
    renderApp(<WorkerBrowse onBack={vi.fn()} />);
    expect(await screen.findByText(/Worker Information/i)).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /Jose Ramirez/i }));
    expect(screen.getByDisplayValue("Jose Ramirez")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cntr_W Save/i })).toBeInTheDocument();
  });

  it("lists work types and opens edit", async () => {
    const user = userEvent.setup();
    renderApp(<WorkTypeBrowse onBack={vi.fn()} />);
    expect(await screen.findByText(/Work Type Information/i)).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /Interior Paint/i }));
    expect(screen.getByDisplayValue("Interior Paint")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cntr_W Save/i })).toBeInTheDocument();
  });

  it("lists work orders", async () => {
    renderApp(<WorkOrderBrowse onBack={vi.fn()} />);
    expect(await screen.findByText(/1 work orders/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /A1\/1\+1/i })).toBeInTheDocument();
  });

  it("lists materials", async () => {
    renderApp(<MaterialBrowse onBack={vi.fn()} />);
    expect(await screen.findByText(/1\s+Total Material/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Drop cloths/i })).toBeInTheDocument();
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
