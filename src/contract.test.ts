import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  api,
  emptyCashReceipt,
  emptyCompany,
  emptyEmployee,
  emptyEstimate,
  emptyInvoice,
  emptyMaterial,
  emptyProperty,
  emptyWorkOrder,
  emptyWorkType,
  type SysData,
} from "./api";

/**
 * The frontend and the Rust backend meet only at Tauri's invoke boundary,
 * where a typo or a renamed field fails at run time or is silently dropped.
 * These checks read the Rust sources and hold api.ts, the shared types, and
 * the e2e mock to the commands and structs the backend actually has.
 */

const rawInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => rawInvoke(...args),
}));

const ROOT = join(__dirname, "..");
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");
const LIB_RS = read("src-tauri/src/lib.rs");
const COMMANDS_RS = read("src-tauri/src/commands.rs");
const MODELS_RS = read("src-tauri/src/models.rs");
const API_TS = read("src/api.ts");
const E2E_MOCK = read("e2e/mocks/tauriCore.ts");

/** serde rename_all = "camelCase", which Tauri also applies to command arguments. */
const camel = (snake: string) => snake.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** Splits on commas outside <>, (), and []. */
function splitTopLevel(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    const ch = list[i];
    if ("<([".includes(ch)) depth++;
    else if (">)]".includes(ch)) depth--;
    else if (ch === "," && depth === 0) {
      parts.push(list.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(list.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

function registeredCommands(): Set<string> {
  const block = /generate_handler!\[([\s\S]*?)\]/.exec(LIB_RS)?.[1] ?? "";
  return new Set([...block.matchAll(/commands::(\w+)/g)].map((m) => m[1]));
}

/** Arguments each #[tauri::command] takes from the frontend, camelCased. */
function commandArgs(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const re = /#\[tauri::command\]\s*pub\s+(?:async\s+)?fn\s+(\w+)\s*\(([\s\S]*?)\)\s*(?:->|\{)/g;
  for (const [, name, list] of COMMANDS_RS.matchAll(re)) {
    const args = splitTopLevel(list)
      .map((param) => {
        const colon = param.indexOf(":");
        return {
          name: param.slice(0, colon).replace(/^mut\s+/, "").trim(),
          type: param.slice(colon + 1).trim(),
        };
      })
      .filter((p) => !/^(tauri::)?(State|AppHandle|Window|WebviewWindow)\b/.test(p.type))
      .map((p) => camel(p.name));
    out.set(name, args);
  }
  return out;
}

type Field = { name: string; optional: boolean; nullable: boolean };

/** Fields of every camelCase serde struct: `optional` = may be left out when sent. */
function rustStructs(): Map<string, Field[]> {
  const out = new Map<string, Field[]>();
  const re = /((?:#\[[^\]]*\]\s*)*)pub struct (\w+)\s*\{([\s\S]*?)\n\}/g;
  for (const [, attrs, name, body] of `${MODELS_RS}\n${COMMANDS_RS}`.matchAll(re)) {
    if (!attrs.includes('rename_all = "camelCase"')) continue;
    const fields: Field[] = [];
    let defaulted = false;
    for (const raw of body.split("\n")) {
      const line = raw.trim();
      if (/^#\[serde\(default/.test(line)) {
        defaulted = true;
        continue;
      }
      const m = /^pub (\w+):\s*(.+?),?$/.exec(line);
      if (!m) continue;
      const nullable = m[2].startsWith("Option<");
      fields.push({ name: camel(m[1]), optional: defaulted || nullable, nullable });
      defaulted = false;
    }
    out.set(name, fields);
  }
  return out;
}

function tsInterfaces(): Map<string, Field[]> {
  const out = new Map<string, Field[]>();
  for (const [, name, body] of API_TS.matchAll(/export interface (\w+)\s*\{([\s\S]*?)\n\}/g)) {
    const fields: Field[] = [];
    for (const line of body.split("\n")) {
      const m = /^\s*(\w+)(\?)?:\s*([^;]+);/.exec(line);
      if (!m) continue;
      fields.push({ name: m[1], optional: !!m[2], nullable: /\bnull\b/.test(m[3]) });
    }
    out.set(name, fields);
  }
  return out;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "test" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** One call per api method. The mapped type makes a new method fail to compile until it is listed. */
const CALLS: { [K in keyof typeof api]: Parameters<(typeof api)[K]> } = {
  getSysdata: [],
  saveSysdata: [{} as SysData],
  getDashboard: [],
  listCompanies: [{ search: "AC" }],
  getCompany: ["1000"],
  nextCompanyNo: [],
  saveCompany: [emptyCompany()],
  deleteCompany: ["1000"],
  listProperties: [{ companyNo: "1000" }],
  saveProperty: [emptyProperty("1000")],
  deleteProperty: ["1000", "01"],
  listEmployees: [],
  saveEmployee: [emptyEmployee()],
  deleteEmployee: ["12"],
  listWorkPersons: [],
  saveWorkPerson: [{ name: "Jose Ramirez", workerNo: "400", active: true }],
  deleteWorkPerson: ["Jose Ramirez"],
  listPaintSupplyCos: [],
  savePaintSupplyCo: ["Dunn-Edwards"],
  deletePaintSupplyCo: ["Dunn-Edwards"],
  listWorkTypes: [],
  saveWorkType: [emptyWorkType()],
  deleteWorkType: ["P1"],
  listInvoices: [{ companyNo: "1000", proNo: "01" }],
  getInvoice: ["1000", "01", "2026-01-15", 42],
  saveInvoice: [{ invoice: emptyInvoice(), lines: [] }],
  voidInvoice: ["1000", "01", "2026-01-15", 42],
  listCashReceipts: [],
  saveCashReceipt: [emptyCashReceipt()],
  deleteCashReceipt: [1],
  listWorkOrders: [],
  getWorkOrder: ["1000", "01", "2026-02-01", 7],
  findWorkOrder: ["1000", "01", 7],
  saveWorkOrder: [{ order: emptyWorkOrder(), lines: [] }],
  voidWorkOrder: ["1000", "01", "2026-02-01", 7],
  listMaterials: [{ sort: "worker" }],
  saveMaterial: [emptyMaterial()],
  deleteMaterial: [3],
  listEstimates: [],
  saveEstimate: [emptyEstimate("1000")],
  voidEstimate: [5],
  listForms: [],
  saveForm: [{ formNo: "EST-1", content: "" }],
  reindexDataFiles: [],
  reportMissingInvoices: [],
  reportAging: ["2026-02-01", "AC"],
  reportSalesAnalysis: [],
  reportPayroll: [],
  reportPaintUsage: [],
  reportWorkerWages: [],
  importDbfFolder: ["C:\\PROMAS"],
  getDbPath: [],
  backupDatabase: ["D:\\backup\\promas.db"],
  setDbLocation: ["D:\\data\\promas.db"],
  importDatabase: ["D:\\old\\promas.db"],
  getBackendDiagnostics: [],
  openLogDir: [],
  saveTextFile: ["D:\\out\\bundle.txt", "contents"],
};

async function callEach() {
  const sent = new Map<string, { cmd: string; args: Record<string, unknown> }>();
  for (const [method, args] of Object.entries(CALLS)) {
    rawInvoke.mockClear();
    const fn = api[method as keyof typeof api] as (...a: unknown[]) => Promise<unknown>;
    await fn(...(args as unknown[]));
    expect(rawInvoke, method).toHaveBeenCalledTimes(1);
    const [cmd, payload] = rawInvoke.mock.calls[0] as [string, Record<string, unknown>?];
    sent.set(method, { cmd, args: payload ?? {} });
  }
  return sent;
}

describe("frontend and backend contract", () => {
  beforeEach(() => {
    rawInvoke.mockReset();
    rawInvoke.mockResolvedValue([]);
  });

  it("reads the Rust sources it checks against", () => {
    expect(registeredCommands().size).toBeGreaterThan(50);
    expect(commandArgs().get("get_invoice")).toEqual(["companyNo", "proNo", "salesDate", "invoice"]);
    expect(commandArgs().get("get_db_path")).toEqual([]);
    expect(rustStructs().get("ListParams")?.every((f) => f.optional)).toBe(true);
    expect(rustStructs().get("AgingRow")?.map((f) => f.name)).toContain("days30");
  });

  it("calls every api method with a registered command and its exact arguments", async () => {
    const registered = registeredCommands();
    const args = commandArgs();
    const problems: string[] = [];
    for (const [method, { cmd, args: payload }] of await callEach()) {
      if (!registered.has(cmd)) {
        problems.push(`${method}: "${cmd}" is not in generate_handler!`);
        continue;
      }
      const expected = [...(args.get(cmd) ?? [])].sort();
      const actual = Object.keys(payload).sort();
      if (expected.join() !== actual.join()) {
        problems.push(`${method}: sends {${actual.join(", ")}}, ${cmd} takes {${expected.join(", ")}}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("reaches every registered command from the frontend, and nothing else", async () => {
    const reached = new Set([...(await callEach()).values()].map((c) => c.cmd));
    const direct = sourceFiles(join(ROOT, "src")).flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/\binvoke(?:<[^>]*>)?\(\s*"(\w+)"/g)].map((m) => ({
        file: relative(ROOT, file).replace(/\\/g, "/"),
        cmd: m[1],
      }))
    );
    for (const { cmd } of direct) reached.add(cmd);
    const registered = registeredCommands();
    expect([...registered].filter((cmd) => !reached.has(cmd)), "registered but never called").toEqual([]);
    expect(
      direct.filter((d) => !registered.has(d.cmd)).map((d) => `${d.file}: ${d.cmd}`),
      "called but not registered"
    ).toEqual([]);
  });

  it("keeps each shared type field for field with its Rust struct", () => {
    const rust = rustStructs();
    const ts = tsInterfaces();
    const shared = [...ts.keys()].filter((name) => rust.has(name));
    expect(shared).toEqual(
      expect.arrayContaining(["Company", "Property", "Invoice", "InvoiceLine", "CashReceipt", "WorkOrder", "ListParams", "WorkPerson", "BackendDiagnostics"])
    );
    const problems: string[] = [];
    for (const name of shared) {
      const rs = new Map(rust.get(name)!.map((f) => [f.name, f]));
      const tf = new Map(ts.get(name)!.map((f) => [f.name, f]));
      for (const field of tf.keys()) {
        if (!rs.has(field)) problems.push(`${name}.${field} is not a field of the Rust struct`);
      }
      for (const [field, r] of rs) {
        const t = tf.get(field);
        if (!t) problems.push(`${name}.${field} is missing from the TypeScript interface`);
        else if (!r.optional && t.optional) problems.push(`${name}.${field} is required by Rust but optional in TypeScript`);
        else if (r.nullable && !t.optional && !t.nullable) problems.push(`${name}.${field} can be null from Rust but TypeScript does not allow null`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("builds blank records with every field the backend requires", () => {
    const rust = rustStructs();
    const blanks: Record<string, object> = {
      Company: emptyCompany(),
      Property: emptyProperty("1000"),
      Employee: emptyEmployee(),
      WorkType: emptyWorkType(),
      Invoice: emptyInvoice(),
      CashReceipt: emptyCashReceipt(),
      Material: emptyMaterial(),
      WorkOrder: emptyWorkOrder(),
      Estimate: emptyEstimate("1000"),
    };
    const problems: string[] = [];
    for (const [name, blank] of Object.entries(blanks)) {
      const fields = rust.get(name)!;
      const known = new Set(fields.map((f) => f.name));
      for (const f of fields) {
        if (!f.optional && !(f.name in blank)) problems.push(`${name}: blank record lacks ${f.name}`);
      }
      for (const key of Object.keys(blank)) {
        if (!known.has(key)) problems.push(`${name}: blank record sets unknown ${key}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("mocks only commands the backend registers in the e2e build", () => {
    const registered = registeredCommands();
    const mocked = [...E2E_MOCK.matchAll(/cmd === "(\w+)"/g)].map((m) => m[1]);
    expect(mocked.length).toBeGreaterThan(30);
    expect(mocked.filter((cmd) => !registered.has(cmd))).toEqual([]);
  });
});

describe("api argument shaping", () => {
  beforeEach(() => {
    rawInvoke.mockReset();
    rawInvoke.mockResolvedValue([]);
  });

  it("sends the aging search trimmed, and no search for blank or ?", async () => {
    await api.reportAging("2026-02-01", "  ACME ");
    expect(rawInvoke).toHaveBeenLastCalledWith("report_aging", { asOf: "2026-02-01", search: "ACME" });
    await api.reportAging(undefined, "?");
    expect(rawInvoke).toHaveBeenLastCalledWith("report_aging", { asOf: null, search: null });
    await api.reportAging();
    expect(rawInvoke).toHaveBeenLastCalledWith("report_aging", { asOf: null, search: null });
  });

  it("returns what the backend returns", async () => {
    rawInvoke.mockResolvedValueOnce(1042);
    await expect(api.saveInvoice({ invoice: emptyInvoice(), lines: [] })).resolves.toBe(1042);
    rawInvoke.mockResolvedValueOnce({ path: "D:\\data\\promas.db", created: true });
    await expect(api.setDbLocation("D:\\data\\promas.db")).resolves.toEqual({
      path: "D:\\data\\promas.db",
      created: true,
    });
    rawInvoke.mockResolvedValueOnce("D:\\data\\imported.db");
    await expect(api.importDatabase("D:\\old\\promas.db")).resolves.toBe("D:\\data\\imported.db");
  });
});
