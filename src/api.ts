import { invoke as rawInvoke } from "@tauri-apps/api/core";
import { log, metrics, noteApiError, startSpan } from "./lib/observability";

/** Log successful invokes at info when they exceed this (ms). */
const SLOW_API_MS = 500;

/** Instrumented invoke: metrics + span + ring-buffer log on every command. */
async function invoke<T>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  const span = startSpan("api", cmd);
  metrics.inc("api.invoke", { cmd });
  const t0 =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  try {
    const result = await rawInvoke<T>(cmd, args);
    const ms =
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
    const rounded = Math.round(ms);
    metrics.observe("api.duration_ms", ms, { cmd });
    span.end({ ok: true, meta: { ms: rounded } });
    if (rounded >= SLOW_API_MS) {
      metrics.inc("api.slow", { cmd });
      log.info("api", `${cmd} slow`, { ms: rounded });
    } else {
      log.debug("api", `${cmd} ok`, { ms: rounded });
    }
    return result;
  } catch (e) {
    const ms =
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
    const message = String(e);
    metrics.inc("api.error", { cmd });
    metrics.observe("api.duration_ms", ms, { cmd });
    const ev = log.error("api", `${cmd} failed`, {
      ms: Math.round(ms),
      error: message,
    });
    noteApiError(message);
    span.end({
      ok: false,
      error: message,
      meta: { errorId: ev?.errorId, ms: Math.round(ms) },
    });
    throw e;
  }
}

export interface ListParams {
  search?: string;
  companyNo?: string;
  fromDate?: string;
  toDate?: string;
  includeVoided?: boolean;
  limit?: number;
  offset?: number;
}

export interface SysData {
  company: string;
  address1: string;
  address2: string;
  city: string;
  zip: string;
  closeDate?: string | null;
  nextInvoice: number;
  nextOrder: number;
  nextEstimate: number;
  termsDays: number;
  interestRate: number;
}

export interface Company {
  companyNo: string;
  name: string;
  class: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  phone2: string;
  phone3: string;
  phone4: string;
  contact: string;
  enterDate?: string | null;
  pageMap: string;
  lastProId: number;
  memo: string;
  voided: boolean;
}

export interface Property {
  companyNo: string;
  proNo: string;
  name: string;
  class: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  phone2: string;
  contact: string;
  noOfUnit: number;
  manager: string;
  pageMap: string;
  keyInfo: string;
  paintTime: string;
  comment1: string;
  comment2: string;
  memo: string;
  voided: boolean;
}

export interface Employee {
  empNo: string;
  name: string;
  class: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  contact: string;
  enterDate?: string | null;
  commission: number;
  ssno: string;
  birthDate?: string | null;
  voided: boolean;
}

export interface WorkType {
  codeNo: string;
  workType: string;
  description: string;
  price: number;
  voided: boolean;
}

export interface Invoice {
  companyNo: string;
  proNo: string;
  salesDate: string;
  invoice: number;
  orderNo: number;
  orderDate?: string | null;
  orderMan: string;
  salesUnit: string;
  salesSize: string;
  salesTotal: number;
  salesPay: number;
  salesBal: number;
  payTotal: number;
  balance: number;
  salesTerm: string;
  salesDue?: string | null;
  custPoNo: string;
  discountOn: number;
  discount: number;
  depositRef: string;
  remark1: string;
  remark2: string;
  status: string;
  voided: boolean;
  companyName?: string | null;
  propertyName?: string | null;
  propertyStreet?: string | null;
}

export interface InvoiceLine {
  id?: number | null;
  companyNo: string;
  proNo: string;
  salesDate: string;
  invoice: number;
  lineNo: number;
  codeNo: string;
  description: string;
  workDate?: string | null;
  workType: string;
  price: number;
  empNo: string;
  empPrice: number;
  commission: number;
  status: string;
}

export interface InvoiceWithLines {
  invoice: Invoice;
  lines: InvoiceLine[];
}

export interface CashReceipt {
  id?: number | null;
  companyNo: string;
  salesDate: string;
  invoice: number;
  payment: number;
  payRefNo: string;
  payDate: string;
  voided: boolean;
  companyName?: string | null;
}

export interface WorkOrder {
  companyNo: string;
  proNo: string;
  orderDate: string;
  orderNo: number;
  workDate?: string | null;
  orderUnit: string;
  orderSize: string;
  orderMan: string;
  orderBy: string;
  custPoNo: string;
  remark1: string;
  remark2: string;
  status: string;
  voided: boolean;
  companyName?: string | null;
  propertyName?: string | null;
}

export interface WorkOrderLine {
  id?: number | null;
  companyNo: string;
  proNo: string;
  orderDate: string;
  orderNo: number;
  lineNo: number;
  codeNo: string;
  description: string;
  workType: string;
  price: number;
}

export interface WorkOrderWithLines {
  order: WorkOrder;
  lines: WorkOrderLine[];
}

export interface Material {
  id?: number | null;
  empNo: string;
  description: string;
  matDate: string;
  amount: number;
  status: string;
  voided: boolean;
  empName?: string | null;
}

export interface DashboardStats {
  companyCount: number;
  propertyCount: number;
  employeeCount: number;
  invoiceCount: number;
  openBalance: number;
  totalSales: number;
  totalPayments: number;
  recentInvoices: Invoice[];
}

export interface AgingRow {
  companyNo: string;
  companyName: string;
  phone: string;
  current: number;
  days30: number;
  days60: number;
  days90: number;
  days120: number;
  openBal: number;
}

export interface SalesAnalysisRow {
  salesDate: string;
  invoice: number;
  companyNo: string;
  proNo: string;
  salesAmount: number;
  deposit: number;
  salesBal: number;
  payTotal: number;
  balance: number;
}

export interface WorkerWageRow {
  empNo: string;
  empName: string;
  workDate?: string | null;
  invDate: string;
  invoice: number;
  companyNo: string;
  proNo: string;
  invAmount: number;
  rate: number;
  wages: number;
  description: string;
}

export interface ImportResult {
  companies: number;
  properties: number;
  employees: number;
  workTypes: number;
  invoices: number;
  invoiceLines: number;
  cashReceipts: number;
  materials: number;
  workOrders: number;
  estimates: number;
  messages: string[];
}

export const emptyCompany = (): Company => ({
  companyNo: "",
  name: "",
  class: "A",
  street: "",
  city: "",
  state: "CA",
  zip: "",
  phone: "",
  phone2: "",
  phone3: "",
  phone4: "",
  contact: "",
  enterDate: new Date().toISOString().slice(0, 10),
  pageMap: "",
  lastProId: 100,
  memo: "",
  voided: false,
});

export const emptyProperty = (companyNo = ""): Property => ({
  companyNo,
  proNo: "",
  name: "",
  class: "",
  street: "",
  city: "",
  state: "CA",
  zip: "",
  phone: "",
  phone2: "",
  contact: "",
  noOfUnit: 0,
  manager: "",
  pageMap: "",
  keyInfo: "",
  paintTime: "",
  comment1: "",
  comment2: "",
  memo: "",
  voided: false,
});

export const emptyEmployee = (): Employee => ({
  empNo: "",
  name: "",
  class: "",
  street: "",
  city: "",
  state: "CA",
  zip: "",
  phone: "",
  contact: "",
  enterDate: new Date().toISOString().slice(0, 10),
  commission: 65,
  ssno: "",
  birthDate: null,
  voided: false,
});

export const emptyWorkType = (): WorkType => ({
  codeNo: "",
  workType: "P",
  description: "",
  price: 0,
  voided: false,
});

export const emptyInvoice = (): Invoice => ({
  companyNo: "",
  proNo: "",
  salesDate: new Date().toISOString().slice(0, 10),
  invoice: 0,
  orderNo: 0,
  orderDate: null,
  orderMan: "MGR",
  salesUnit: "",
  salesSize: "",
  salesTotal: 0,
  salesPay: 0,
  salesBal: 0,
  payTotal: 0,
  balance: 0,
  salesTerm: "Net  7 Days",
  salesDue: null,
  custPoNo: "",
  discountOn: 0,
  discount: 0,
  depositRef: "",
  remark1: "",
  remark2: "",
  status: "",
  voided: false,
});

export const emptyInvoiceLine = (inv: Invoice, lineNo = 1): InvoiceLine => ({
  companyNo: inv.companyNo,
  proNo: inv.proNo,
  salesDate: inv.salesDate,
  invoice: inv.invoice,
  lineNo,
  codeNo: "*",
  description: "",
  workDate: inv.salesDate,
  workType: "P",
  price: 0,
  empNo: "",
  empPrice: 0,
  commission: 65,
  status: "",
});

export const emptyCashReceipt = (): CashReceipt => ({
  companyNo: "",
  salesDate: new Date().toISOString().slice(0, 10),
  invoice: 0,
  payment: 0,
  payRefNo: "",
  payDate: new Date().toISOString().slice(0, 10),
  voided: false,
});

export const emptyMaterial = (): Material => ({
  empNo: "",
  description: "",
  matDate: new Date().toISOString().slice(0, 10),
  amount: 0,
  status: "",
  voided: false,
});

export const emptyWorkOrder = (): WorkOrder => ({
  companyNo: "",
  proNo: "",
  orderDate: new Date().toISOString().slice(0, 10),
  orderNo: 0,
  workDate: null,
  orderUnit: "",
  orderSize: "",
  orderMan: "MGR",
  orderBy: "",
  custPoNo: "",
  remark1: "",
  remark2: "",
  status: "",
  voided: false,
});

export const api = {
  getSysdata: () => invoke<SysData>("get_sysdata"),
  saveSysdata: (data: SysData) => invoke("save_sysdata", { data }),
  getDashboard: () => invoke<DashboardStats>("get_dashboard"),
  listCompanies: (params: ListParams = {}) =>
    invoke<Company[]>("list_companies", { params }),
  getCompany: (companyNo: string) =>
    invoke<Company | null>("get_company", { companyNo }),
  saveCompany: (company: Company) => invoke("save_company", { company }),
  deleteCompany: (companyNo: string) =>
    invoke("delete_company", { companyNo }),
  listProperties: (params: ListParams = {}) =>
    invoke<Property[]>("list_properties", { params }),
  saveProperty: (property: Property) => invoke("save_property", { property }),
  deleteProperty: (companyNo: string, proNo: string) =>
    invoke("delete_property", { companyNo, proNo }),
  listEmployees: (params: ListParams = {}) =>
    invoke<Employee[]>("list_employees", { params }),
  saveEmployee: (employee: Employee) => invoke("save_employee", { employee }),
  deleteEmployee: (empNo: string) => invoke("delete_employee", { empNo }),
  listWorkTypes: (params: ListParams = {}) =>
    invoke<WorkType[]>("list_work_types", { params }),
  saveWorkType: (workType: WorkType) =>
    invoke("save_work_type", { workType }),
  deleteWorkType: (codeNo: string) =>
    invoke("delete_work_type", { codeNo }),
  listInvoices: (params: ListParams = {}) =>
    invoke<Invoice[]>("list_invoices", { params }),
  getInvoice: (
    companyNo: string,
    proNo: string,
    salesDate: string,
    invoice: number
  ) =>
    invoke<InvoiceWithLines | null>("get_invoice", {
      companyNo,
      proNo,
      salesDate,
      invoice,
    }),
  saveInvoice: async (data: InvoiceWithLines) => {
    const no = await invoke<number>("save_invoice", { data });
    log.info("db", "invoice saved", {
      invoice: no,
      companyNo: data.invoice.companyNo,
      proNo: data.invoice.proNo,
      lines: data.lines.length,
    });
    return no;
  },
  voidInvoice: async (
    companyNo: string,
    proNo: string,
    salesDate: string,
    invoice: number
  ) => {
    await invoke("void_invoice", { companyNo, proNo, salesDate, invoice });
    log.info("db", "invoice voided", { invoice, companyNo, proNo, salesDate });
  },
  listCashReceipts: (params: ListParams = {}) =>
    invoke<CashReceipt[]>("list_cash_receipts", { params }),
  saveCashReceipt: (receipt: CashReceipt) =>
    invoke("save_cash_receipt", { receipt }),
  deleteCashReceipt: (id: number) =>
    invoke("delete_cash_receipt", { id }),
  listWorkOrders: (params: ListParams = {}) =>
    invoke<WorkOrder[]>("list_work_orders", { params }),
  saveWorkOrder: (data: WorkOrderWithLines) =>
    invoke<number>("save_work_order", { data }),
  listMaterials: (params: ListParams = {}) =>
    invoke<Material[]>("list_materials", { params }),
  saveMaterial: (material: Material) =>
    invoke("save_material", { material }),
  deleteMaterial: (id: number) => invoke("delete_material", { id }),
  reportAging: async (asOf?: string) => {
    const rows = await invoke<AgingRow[]>("report_aging", {
      asOf: asOf ?? null,
    });
    log.info("db", "report_aging completed", {
      rows: rows.length,
      asOf: asOf ?? null,
    });
    return rows;
  },
  reportSalesAnalysis: async (params: ListParams = {}) => {
    const rows = await invoke<SalesAnalysisRow[]>(
      "report_sales_analysis",
      { params }
    );
    log.info("db", "report_sales_analysis completed", { rows: rows.length });
    return rows;
  },
  reportWorkerWages: async (params: ListParams = {}) => {
    const rows = await invoke<WorkerWageRow[]>("report_worker_wages", {
      params,
    });
    log.info("db", "report_worker_wages completed", { rows: rows.length });
    return rows;
  },
  importDbfFolder: async (folder: string) => {
    const result = await invoke<ImportResult>("import_dbf_folder", { folder });
    log.info("db", "dbf import completed", {
      companies: result.companies,
      properties: result.properties,
      invoices: result.invoices,
      invoiceLines: result.invoiceLines,
    });
    return result;
  },
  getDbPath: () => invoke<string>("get_db_path"),
  exportDatabase: async (destPath: string) => {
    await invoke("export_database", { destPath });
    log.info("db", "database exported", { destPath });
  },
  backupDatabase: async (destPath: string) => {
    await invoke("backup_database", { destPath });
    log.info("db", "database backed up", { destPath });
  },
  setDbLocation: async (folder: string) => {
    const path = await invoke<string>("set_db_location", { folder });
    log.info("db", "database location set", { path });
    return path;
  },
  importDatabase: async (sourcePath: string) => {
    const path = await invoke<string>("import_database", { sourcePath });
    log.info("db", "database imported", { sourcePath, path });
    return path;
  },
  getBackendDiagnostics: () =>
    invoke<BackendDiagnostics>("get_backend_diagnostics"),
  openLogDir: () => invoke("open_log_dir"),
  saveTextFile: (path: string, contents: string) =>
    invoke("save_text_file", { path, contents }),
};

export interface BackendDiagnostics {
  dbPath: string;
  logDir: string;
  rustVersion: string;
  crateVersion: string;
  targetTriple: string;
}

export function money(n: number | null | undefined): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n ?? 0);
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "";
  if (d.length === 10 && d.includes("-")) {
    const [y, m, day] = d.split("-");
    return `${m}/${day}/${y}`;
  }
  return d;
}
