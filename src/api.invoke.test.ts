import { beforeEach, describe, expect, it, vi } from "vitest";
import { log, metrics, resetObservabilityForTests } from "./lib/observability";

const rawInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => rawInvoke(...args),
}));

describe("instrumented api invoke", () => {
  beforeEach(() => {
    resetObservabilityForTests();
    rawInvoke.mockReset();
  });

  it("logs slow successful invokes at info", async () => {
    rawInvoke.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 520));
      return "ok";
    });
    const { api } = await import("./api");
    await api.getDbPath();
    const recent = log.getRecent();
    expect(recent.some((e) => e.message.includes("slow"))).toBe(true);
    expect(metrics.snapshot().counters["api.slow{cmd=get_db_path}"]).toBe(1);
  });

  it("logs failed invokes at error", async () => {
    rawInvoke.mockRejectedValue(new Error("boom"));
    const { api } = await import("./api");
    await expect(api.getDbPath()).rejects.toThrow();
    expect(log.getRecent().some((e) => e.level === "error")).toBe(true);
    expect(metrics.snapshot().counters["api.error{cmd=get_db_path}"]).toBe(1);
  });

  it("records invoice saved breadcrumb", async () => {
    rawInvoke.mockResolvedValue(42);
    const { api, emptyInvoice } = await import("./api");
    const inv = emptyInvoice();
    inv.companyNo = "1000";
    inv.proNo = "01";
    await api.saveInvoice({ invoice: inv, lines: [] });
    expect(
      log.getRecent().some(
        (e) => e.category === "db" && e.message === "invoice saved"
      )
    ).toBe(true);
  });

  it("records invoice voided breadcrumb", async () => {
    rawInvoke.mockResolvedValue(undefined);
    const { api } = await import("./api");
    await api.voidInvoice("1000", "01", "2026-01-15", 7);
    expect(
      log.getRecent().some(
        (e) => e.category === "db" && e.message === "invoice voided"
      )
    ).toBe(true);
  });

  it("records database location and export breadcrumbs", async () => {
    rawInvoke.mockResolvedValue({ path: "D:\\data\\acct.db", created: false });
    const { api } = await import("./api");
    await api.setDbLocation("D:\\data\\acct.db");
    expect(
      log.getRecent().some(
        (e) => e.category === "db" && e.message === "database location set"
      )
    ).toBe(true);

    rawInvoke.mockResolvedValue(undefined);
    await api.exportDatabase("D:\\out\\copy.db");
    expect(
      log.getRecent().some(
        (e) => e.category === "db" && e.message === "database exported"
      )
    ).toBe(true);
  });

  it("records report completed breadcrumb", async () => {
    rawInvoke.mockResolvedValue([{ companyNo: "1000" }]);
    const { api } = await import("./api");
    await api.reportAging("2026-02-01");
    expect(
      log.getRecent().some(
        (e) => e.category === "db" && e.message === "report_aging completed"
      )
    ).toBe(true);
  });
});
