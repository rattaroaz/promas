/**
 * Original Reports Menu (9 items) with proper report logic.
 */
import { useEffect, useState } from "react";
import {
  api,
  AgingRow,
  SalesAnalysisRow,
  PaintUsageRow,
  PayrollRow,
  MissingInvoiceRow,
  Company,
  Invoice,
  emptyCompany,
  emptyProperty,
} from "../api";
import { useBrowseIndex, useDosKeys } from "../dos/hooks";
import { Screen, HelpOverlay } from "../dos/Shell";
import { cols, padR, padL, money, fmtDate, today } from "../dos/utils";
import { SubMenu, MenuItem } from "./SubMenu";
import { save } from "@tauri-apps/plugin-dialog";
import {
  agingExcelFileName,
  buildAgingSummaryWorkbook,
  buildOutstandingInvoicesWorkbook,
  outstandingExcelFileName,
} from "../lib/agingExcel";
import {
  downloadInvoicePdf,
  printInvoiceOnTemplate,
} from "../lib/invoicePrint";

type AgingDetail = {
  company: AgingRow;
  invoices: Invoice[];
};

export type SalesSortKey = "date" | "company";
export type SalesSortDir = "asc" | "desc";

function cmpCompanyNo(a: string, b: string): number {
  return a
    .trim()
    .localeCompare(b.trim(), undefined, { numeric: true, sensitivity: "base" });
}

export function sortSalesRows(
  rows: SalesAnalysisRow[],
  key: SalesSortKey,
  dir: SalesSortDir
): SalesAnalysisRow[] {
  const sign = dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    if (key === "company") {
      return (
        sign * cmpCompanyNo(a.companyNo, b.companyNo) ||
        a.salesDate.localeCompare(b.salesDate) ||
        a.invoice - b.invoice
      );
    }
    return (
      sign * a.salesDate.localeCompare(b.salesDate) ||
      a.invoice - b.invoice ||
      cmpCompanyNo(a.companyNo, b.companyNo)
    );
  });
}

/** `?` lists every company with an open balance, same as Clipper first/all. */
export function agingSearchQuery(raw: string): string | undefined {
  const q = raw.trim();
  if (!q || q === "?") return undefined;
  return q;
}

const REPORT_ITEMS: MenuItem[] = [
  { id: "payroll", num: "1", label: "Payroll Report", accel: "Y" },
  { id: "customer", num: "2", label: "Customer File", accel: "C" },
  { id: "invoice", num: "3", label: "Invoice Register", accel: "I" },
  { id: "cash", num: "4", label: "Cash Receipts Register", accel: "R" },
  { id: "aging", num: "5", label: "Open Receivables Aging", accel: "O" },
  { id: "sales", num: "6", label: "Sales Analysis", accel: "S" },
  { id: "missing", num: "7", label: "Check Missing Invoice", accel: "M" },
  { id: "labels", num: "8", label: "Mailing Labels", accel: "A" },
  { id: "paint", num: "9", label: "Paint Usage Report", accel: "U" },
];

export function ReportsScreen({ onBack }: { onBack: () => void }) {
  const [report, setReport] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [companyNo, setCompanyNo] = useState("");
  const [search, setSearch] = useState("");
  const [paintSupply, setPaintSupply] = useState("");
  const [workPerson, setWorkPerson] = useState("");
  const [paintSupplyOptions, setPaintSupplyOptions] = useState<string[]>([]);
  const [workPersonOptions, setWorkPersonOptions] = useState<string[]>([]);
  const [labelMode, setLabelMode] = useState<"C" | "P">("C");
  const [text, setText] = useState("");
  const [agingRows, setAgingRows] = useState<AgingRow[] | null>(null);
  const [agingDetail, setAgingDetail] = useState<AgingDetail | null>(null);
  const [salesRows, setSalesRows] = useState<SalesAnalysisRow[] | null>(null);
  const [payrollRows, setPayrollRows] = useState<PayrollRow[] | null>(null);
  const [salesSort, setSalesSort] = useState<{
    key: SalesSortKey;
    dir: SalesSortDir;
  }>({ key: "date", dir: "asc" });
  const [msg, setMsg] = useState("");
  const [help, setHelp] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (report !== "paint" && report !== "payroll") return;
    void (async () => {
      if (report === "paint") {
        try {
          setPaintSupplyOptions((await api.listPaintSupplyCos()) ?? []);
        } catch {
          setPaintSupplyOptions([]);
        }
      }
      try {
        setWorkPersonOptions((await api.listWorkPersons()) ?? []);
      } catch {
        setWorkPersonOptions([]);
      }
    })();
  }, [report]);

  useDosKeys(
    {
      onEscape: () => {
        if (help) setHelp(false);
        else if (agingDetail) {
          setAgingDetail(null);
          setMsg(
            "Click a company number for outstanding invoice items  Enter=Run  (X)cel  Esc=Back"
          );
        } else if (report) {
          setReport(null);
          setText("");
          setAgingRows(null);
          setAgingDetail(null);
          setSalesRows(null);
          setPayrollRows(null);
        } else onBack();
      },
      onF1: () => setHelp(true),
      onEnd: () => {
        if (!agingDetail) window.print();
      },
      onEnter: () => {
        if (agingDetail) return;
        if (report) runReport(report);
      },
      onChar: (ch) => {
        if (help) {
          setHelp(false);
          return true;
        }
        if (report && (ch === "p" || ch === "P")) {
          window.print();
          return true;
        }
        if (report === "aging" && (ch === "x" || ch === "X")) {
          void downloadAgingExcel();
          return true;
        }
        if (report === "aging" && ch === "?") {
          setSearch("?");
          void runReport("aging");
          return true;
        }
        if (
          (report === "sales" || report === "invoice") &&
          (ch === "c" || ch === "C")
        ) {
          toggleSalesSort("company");
          return true;
        }
        if (
          (report === "sales" || report === "invoice") &&
          (ch === "d" || ch === "D")
        ) {
          toggleSalesSort("date");
          return true;
        }
        if (report === "labels") {
          if (ch === "c" || ch === "C") {
            setLabelMode("C");
            return true;
          }
          if (ch === "p" || ch === "P") {
            setLabelMode("P");
            return true;
          }
        }
        return false;
      },
    },
    !!report
  );

  function salesSortMessage(key: SalesSortKey, dir: SalesSortDir) {
    const by = key === "company" ? "company#" : "invoice date";
    return `Sorted by ${by} ${dir === "asc" ? "↑" : "↓"}  click invoice# to view  (C)ompany  (D)ate`;
  }

  function toggleSalesSort(key: SalesSortKey) {
    setSalesSort((cur) => {
      const next = {
        key,
        dir: (cur.key === key && cur.dir === "asc" ? "desc" : "asc") as SalesSortDir,
      };
      setMsg(salesSortMessage(next.key, next.dir));
      return next;
    });
  }

  function clearOutputs() {
    setAgingDetail(null);
    setAgingRows(null);
    setSalesRows(null);
    setPayrollRows(null);
    setText("");
  }

  async function runReport(id: string) {
    setRunning(true);
    setMsg("Generating report...");
    try {
      clearOutputs();
      if (id === "aging") {
        setAgingRows(await api.reportAging(undefined, agingSearchQuery(search)));
      } else if (id === "sales" || id === "invoice") {
        const rows = await api.reportSalesAnalysis({
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
          companyNo: companyNo.trim() || undefined,
        });
        setSalesRows(rows);
      } else if (id === "cash") {
        const rows = await api.listCashReceipts({
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
          companyNo: companyNo || undefined,
          search: search.trim() || undefined,
          limit: 2000,
        });
        let t = `        *****    Cash  Receipts   *****\n\n`;
        t +=
          "Inv#  Inv_Date  Com# Company                       PayDate  PayRefno      Payment\n";
        t +=
          "--------------------------------------------------------------------------------\n";
        let tot = 0;
        for (const r of rows) {
          t += `${padL(r.invoice, 5)} ${padR(fmtDate(r.salesDate), 10)} ${padR(r.companyNo, 4)} ${padR(r.companyName || "", 28)} ${padR(fmtDate(r.payDate), 8)} ${padR(r.payRefNo, 10)} ${padL(money(r.payment), 10)}\n`;
          tot += r.payment;
        }
        t +=
          "--------------------------------------------------------------------------------\n";
        t += `Cash Receipts Total Counts  : ${rows.length}\n                    Amounts : ${money(tot)}\n`;
        setText(t);
      } else if (id === "payroll") {
        setPayrollRows(
          await api.reportPayroll({
            fromDate: fromDate || undefined,
            toDate: toDate || undefined,
            search: workPerson.trim() || undefined,
          })
        );
      } else if (id === "customer") {
        const cos = await api.listCompanies({ limit: 5000 });
        const props = await api.listProperties({ limit: 10000 });
        setText(formatCustomerFile(cos, props));
      } else if (id === "missing") {
        const rows = await api.reportMissingInvoices({
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        });
        setText(formatMissing(rows));
      } else if (id === "paint") {
        setText(
          formatPaintUsage(
            await api.reportPaintUsage({
              fromDate: fromDate || undefined,
              toDate: toDate || undefined,
              paintSupplyCo: paintSupply.trim() || undefined,
              search: workPerson.trim() || undefined,
            })
          )
        );
      } else if (id === "labels") {
        if (labelMode === "C") {
          const cos = await api.listCompanies({ limit: 5000 });
          setText(formatLabelsCompany(cos));
        } else {
          const props = await api.listProperties({ limit: 10000 });
          setText(formatLabelsProperty(props));
        }
      } else {
        setMsg("Unknown report");
        return;
      }
      setMsg(
        id === "aging"
          ? "Click a company number for outstanding invoice items  Esc=Exit  (P)rint  (X)cel"
          : id === "sales" || id === "invoice"
            ? salesSortMessage(salesSort.key, salesSort.dir)
            : id === "payroll"
              ? "Click invoice# to view  Esc=Exit  (P)rint"
            : "Selection (Esc=Exit,(P)rint,(S)creen)?"
      );
    } catch (e) {
      setMsg(String(e));
      clearOutputs();
    } finally {
      setRunning(false);
    }
  }

  async function openAgingDetail(row: AgingRow) {
    setRunning(true);
    setMsg(`Loading outstanding invoices for ${row.companyNo}...`);
    try {
      const invs = await api.listInvoices({
        companyNo: row.companyNo,
        limit: 5000,
      });
      const open = invs
        .filter((i) => !i.voided && i.balance > 0.005)
        .sort(
          (a, b) =>
            a.salesDate.localeCompare(b.salesDate) || a.invoice - b.invoice
        );
      setAgingDetail({ company: row, invoices: open });
      setMsg("Click invoice# to view form  Esc=Back  (P)rint  (X)cel");
    } catch (e) {
      setMsg(String(e));
    } finally {
      setRunning(false);
    }
  }

  async function previewAgingInvoice(inv: {
    companyNo: string;
    proNo: string;
    salesDate: string;
    invoice: number;
    propertyName?: string | null;
    propertyStreet?: string | null;
  }) {
    setRunning(true);
    setMsg(`Loading invoice #${inv.invoice}...`);
    try {
      const full = await api.getInvoice(
        inv.companyNo,
        inv.proNo,
        inv.salesDate,
        inv.invoice
      );
      if (!full) {
        setMsg("--> does not exist in Invoice File !!!");
        return;
      }
      const co =
        (await api.getCompany(inv.companyNo)) ??
        ({
          ...emptyCompany(),
          companyNo: inv.companyNo,
          name: agingDetail?.company.companyName ?? "",
          contact: agingDetail?.company.contact ?? "",
          phone: agingDetail?.company.phone ?? "",
        } satisfies Company);
      const props = await api.listProperties({
        companyNo: inv.companyNo,
        limit: 2000,
      });
      const property =
        props.find((p) => p.proNo === inv.proNo) ??
        ({
          ...emptyProperty(inv.companyNo),
          proNo: inv.proNo,
          name: inv.propertyName ?? "",
          street: inv.propertyStreet ?? "",
        });
      await printInvoiceOnTemplate({
        company: co,
        property,
        invoice: full.invoice,
        lines: full.lines,
      });
      setMsg(
        `Invoice #${inv.invoice}  Esc=close form  click invoice# to view`
      );
    } catch (e) {
      setMsg(String(e));
      try {
        const full = await api.getInvoice(
          inv.companyNo,
          inv.proNo,
          inv.salesDate,
          inv.invoice
        );
        if (!full) return;
        const co =
          (await api.getCompany(inv.companyNo)) ?? emptyCompany();
        await downloadInvoicePdf({
          company: { ...co, companyNo: inv.companyNo },
          property: {
            ...emptyProperty(inv.companyNo),
            proNo: inv.proNo,
            name: inv.propertyName ?? "",
            street: inv.propertyStreet ?? "",
          },
          invoice: full.invoice,
          lines: full.lines,
        });
        setMsg("Print window blocked — PDF downloaded instead.");
      } catch {
        /* already reported */
      }
    } finally {
      setRunning(false);
    }
  }

  async function downloadAgingExcel() {
    try {
      const detail = agingDetail;
      let rows = agingRows;
      if (!detail && !rows) {
        setRunning(true);
        setMsg("Generating report...");
        rows = await api.reportAging(undefined, agingSearchQuery(search));
        setAgingRows(rows);
        setText("");
      }
      const dest = await save({
        title: "Save to Excel",
        defaultPath: detail
          ? outstandingExcelFileName(detail.company.companyNo)
          : agingExcelFileName(),
        filters: [{ name: "Excel Workbook", extensions: ["xls"] }],
      });
      if (!dest) {
        setMsg(
          detail
            ? "Esc=Back to aging  (P)rint  (X)cel"
            : "Click a company number for outstanding invoice items  Esc=Exit  (P)rint  (X)cel"
        );
        return;
      }
      setRunning(true);
      setMsg("Saving Excel workbook...");
      const body = detail
        ? buildOutstandingInvoicesWorkbook(detail.company, detail.invoices)
        : buildAgingSummaryWorkbook(rows ?? []);
      await api.saveTextFile(dest, body);
      setMsg(`Excel saved to: ${dest}`);
    } catch (e) {
      setMsg(String(e));
    } finally {
      setRunning(false);
    }
  }

  if (!report) {
    return (
      <SubMenu
        title=" Reports Menu "
        items={REPORT_ITEMS}
        onBack={onBack}
        onSelect={(id) => {
          setReport(id);
          setText("");
          setAgingRows(null);
          setAgingDetail(null);
          setSalesRows(null);
          setPayrollRows(null);
          setSalesSort({ key: "date", dir: "asc" });
          setMsg(
            id === "payroll"
              ? "Work person and invoice date range (optional), then Enter. Click invoice# to view."
              : id === "aging"
                ? "? = all companies that owe money, or search company / address, then Enter"
              : id === "cash"
                ? "Search company or property address (optional), then Enter to run"
              : id === "sales" || id === "invoice"
                ? "Company NO or Name (optional), date range, then Enter. Click Inv_Date or Com to sort."
              : id === "labels"
                ? "Enter Seletion (Esc=Exit,(C)ustomer,(P)roperty)?"
                : id === "paint"
                  ? "Paint supply, work date, or work person (optional), then Enter"
                : "Enter date range (optional) then press Enter to run"
          );
        }}
      />
    );
  }

  const title =
    REPORT_ITEMS.find((r) => r.id === report)?.label || "Report";

  return (
    <Screen
      statusKeys={[
        { key: "Esc", label: agingDetail ? "Back" : "Exit" },
        { key: "Enter", label: agingDetail ? "" : "Run" },
        { key: "P", label: "Print" },
        ...(report === "aging" ? [{ key: "X", label: "Excel" }] : []),
        ...((report === "sales" || report === "invoice") && salesRows
          ? [
              { key: "C", label: "Co#" },
              { key: "D", label: "Date" },
            ]
          : []),
        { key: "End", label: agingDetail ? "" : "Print" },
        { key: "F1", label: "Help" },
      ]}
      title={`*****   ${title}   *****`}
      message={msg || (running ? "Working..." : "Enter=Run  P=Print  Esc=Back")}
      left={agingDetail?.company.companyNo}
      right={agingDetail?.company.companyName.slice(0, 24)}
    >
      {!agingDetail && (
      <div className="dos-searchline">
        {(report === "aging" || report === "cash") && (
          <>
            <label>Search:</label>
            <input
              className="dos-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                report === "aging"
                  ? "? = all companies that owe, or Company NO, Name, Contact, Address"
                  : "Company, Contact, or Property Address"
              }
              aria-label={
                report === "aging"
                  ? "Aging company search"
                  : "Cash receipts search"
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runReport(report);
                }
              }}
            />
          </>
        )}
        {(report === "invoice" ||
          report === "cash" ||
          report === "sales") && (
          <>
            <label>
              {report === "sales" || report === "invoice"
                ? "Company :"
                : "From Company No :"}
            </label>
            <input
              className={
                report === "sales" || report === "invoice"
                  ? "dos-input w20"
                  : "dos-input w8"
              }
              value={companyNo}
              onChange={(e) => setCompanyNo(e.target.value)}
              placeholder={
                report === "sales" || report === "invoice"
                  ? "Company NO or Name"
                  : undefined
              }
              aria-label={
                report === "sales" || report === "invoice"
                  ? "Sales company search"
                  : undefined
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runReport(report);
                }
              }}
            />
          </>
        )}
        {report === "paint" && (
          <>
            <label>Paint Supply Co. :</label>
            <input
              className="dos-input w20"
              list="paint-usage-supply-list"
              value={paintSupply}
              onChange={(e) => setPaintSupply(e.target.value)}
              placeholder="Painting Supply Co"
              aria-label="Paint supply search"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runReport(report);
                }
              }}
            />
            <datalist id="paint-usage-supply-list">
              {paintSupplyOptions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </>
        )}
        {(report === "paint" || report === "payroll") && (
          <>
            <label>Work Person :</label>
            <input
              className="dos-input w20"
              list="report-work-person-list"
              value={workPerson}
              onChange={(e) => setWorkPerson(e.target.value)}
              placeholder="Work person"
              aria-label="Work person search"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runReport(report);
                }
              }}
            />
            <datalist id="report-work-person-list">
              {workPersonOptions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </>
        )}
        {report !== "aging" &&
          report !== "customer" &&
          report !== "labels" && (
            <>
              <label>
                {report === "paint" ? "From Work Date :" : "From Date :"}
              </label>
              <input
                className="dos-input w12"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                aria-label={
                  report === "paint"
                    ? "From work date"
                    : report === "payroll"
                      ? "From invoice date"
                      : undefined
                }
              />
              <label>
                {report === "paint" ? "To Work Date :" : "To Date :"}
              </label>
              <input
                className="dos-input w12"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                aria-label={
                  report === "paint"
                    ? "To work date"
                    : report === "payroll"
                      ? "To invoice date"
                      : undefined
                }
              />
            </>
          )}
        {report === "labels" && (
          <>
            <label>(C)ustomer / (P)roperty:</label>
            <select
              className="dos-select"
              value={labelMode}
              onChange={(e) => setLabelMode(e.target.value as "C" | "P")}
            >
              <option value="C">C Customer</option>
              <option value="P">P Property</option>
            </select>
          </>
        )}
        <button className="dos-btn" onClick={() => runReport(report)}>
          Run
        </button>
        <button className="dos-btn" onClick={() => window.print()}>
          Print
        </button>
        {report === "aging" && (
          <button className="dos-btn" onClick={() => void downloadAgingExcel()}>
            Excel
          </button>
        )}
      </div>
      )}
      {agingDetail ? (
        <AgingInvoiceList
          company={agingDetail.company}
          invoices={agingDetail.invoices}
          onExcel={() => void downloadAgingExcel()}
          onInvoice={(inv) => void previewAgingInvoice(inv)}
        />
      ) : (
      <>
      {report === "payroll" && (
        <style>{`@page { size: landscape; }`}</style>
      )}
      <div
        className={
          report === "payroll" ? "dos-report payroll-landscape" : "dos-report"
        }
      >
        {report === "aging" && agingRows ? (
          <AgingReport rows={agingRows} onCompany={openAgingDetail} />
        ) : (report === "sales" || report === "invoice") && salesRows ? (
          <SalesReport
            title={report === "invoice" ? "Invoice Register" : "Sales Analysis"}
            rows={salesRows}
            sort={salesSort}
            onSort={toggleSalesSort}
            onInvoice={(r) => void previewAgingInvoice(r)}
          />
        ) : report === "payroll" && payrollRows ? (
          <PayrollReport
            rows={payrollRows}
            onInvoice={(r) =>
              void previewAgingInvoice({
                ...r,
                propertyStreet: r.propertyAddress,
              })
            }
          />
        ) : text ? (
          text
        ) : (
          <span style={{ color: "var(--dos-yellow)" }}>
            {running
              ? "Generating report......"
              : "Press Enter to run report."}
          </span>
        )}
      </div>
      </>
      )}
      {help && <HelpOverlay onClose={() => setHelp(false)} />}
    </Screen>
  );
}

const AGING_SEP =
  "====================================================================================================================================\n";

function AgingReport({
  rows,
  onCompany,
}: {
  rows: AgingRow[];
  onCompany: (row: AgingRow) => void;
}) {
  let tc = 0,
    t30 = 0,
    t60 = 0,
    t90 = 0,
    t120 = 0,
    to = 0;
  for (const r of rows) {
    tc += r.current;
    t30 += r.days30;
    t60 += r.days60;
    t90 += r.days90;
    t120 += r.days120;
    to += r.openBal;
  }
  return (
    <>
      {`*****   Open Receivable Aging  *****\nDate : ${fmtDate(today())}\n\n`}
      <span className="hdr">
        {
          "Company#  Company Name                     Contact            Phone         Current     >30      >60      >90     >120   Open Bal\n"
        }
      </span>
      {AGING_SEP}
      {rows.map((r) => (
        <div key={r.companyNo} className="aging-row">
          <button
            type="button"
            className="aging-cono"
            aria-label={`Company ${r.companyNo} outstanding invoices`}
            onClick={() => onCompany(r)}
          >
            {padR(r.companyNo, 8)}
          </button>
          {`  ${padR(r.companyName, 32)} ${padR(r.contact ?? "", 18)} ${padR(r.phone, 13)} ${padL(money(r.current), 9)} ${padL(money(r.days30), 8)} ${padL(money(r.days60), 8)} ${padL(money(r.days90), 8)} ${padL(money(r.days120), 8)} ${padL(money(r.openBal), 10)}\n`}
        </div>
      ))}
      {AGING_SEP}
      <span className="total">
        {`              Grand Total: ${padL(money(tc), 9)} ${padL(money(t30), 8)} ${padL(money(t60), 8)} ${padL(money(t90), 8)} ${padL(money(t120), 8)} ${padL(money(to), 10)}\n`}
      </span>
    </>
  );
}

export function formatAgingInvoiceRow(inv: Invoice): string {
  const addr = (inv.propertyStreet || inv.propertyName || "").trim();
  return cols(
    padL(inv.invoice, 5),
    padR(fmtDate(inv.salesDate), 10),
    padL(money(inv.salesTotal), 11),
    padR(addr, 40),
    padR(inv.salesUnit, 8),
    padR(inv.custPoNo, 12)
  );
}

function AgingInvoiceList({
  company,
  invoices,
  onExcel,
  onInvoice,
}: {
  company: AgingRow;
  invoices: Invoice[];
  onExcel: () => void;
  onInvoice: (inv: Invoice) => void;
}) {
  const { index, setIndex, up, down, pageUp, pageDown, home, end } =
    useBrowseIndex(invoices.length);

  useDosKeys({
    forceNav: true,
    onArrowUp: up,
    onArrowDown: down,
    onPageUp: pageUp,
    onPageDown: pageDown,
    onHome: home,
    onEnd: end,
    onEnter: () => {
      const inv = invoices[index];
      if (inv) onInvoice(inv);
    },
  });

  return (
    <>
      <div
        style={{
          color: "var(--dos-yellow)",
          padding: "0.3em 0.5ch",
          whiteSpace: "pre",
        }}
      >
        {`*****   Outstanding Invoices   *****
Company NO : ${company.companyNo}  ${company.companyName}
Open Balance.... ${money(company.openBal)}`}
        <div>
          <button className="dos-btn" onClick={onExcel}>
            Excel
          </button>
        </div>
      </div>
      <div className="dos-browse">
        <div className="dos-browse-header">
          {cols(
            padR("Inv_#", 5),
            padR("Inv_Date", 10),
            padR("Inv_amount", 11),
            padR("Address", 40),
            padR("Unit", 8),
            padR("PO_No", 12)
          )}
        </div>
        <div className="dos-browse-body">
          {invoices.map((inv, i) => (
            <div
              key={`${inv.invoice}-${inv.salesDate}-${inv.proNo}`}
              className={`dos-row ${i === index ? "selected" : ""}`}
              onMouseEnter={() => setIndex(i)}
            >
              <button
                type="button"
                className="aging-invno"
                aria-label={`Invoice ${inv.invoice}`}
                onClick={() => onInvoice(inv)}
              >
                {padL(inv.invoice, 5)}
              </button>
              {`   ${cols(
                padR(fmtDate(inv.salesDate), 10),
                padL(money(inv.salesTotal), 11),
                padR((inv.propertyStreet || inv.propertyName || "").trim(), 40),
                padR(inv.salesUnit, 8),
                padR(inv.custPoNo, 12)
              )}`}
            </div>
          ))}
          {invoices.length === 0 && (
            <div className="dos-row" style={{ color: "var(--dos-yellow)" }}>
              {"  --> does not exsit in Receivable File !! Press Enter to Exit ..."}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function SalesReport({
  title,
  rows,
  sort,
  onSort,
  onInvoice,
}: {
  title: string;
  rows: SalesAnalysisRow[];
  sort: { key: SalesSortKey; dir: SalesSortDir };
  onSort: (key: SalesSortKey) => void;
  onInvoice: (row: SalesAnalysisRow) => void;
}) {
  const sorted = sortSalesRows(rows, sort.key, sort.dir);
  const mark = (key: SalesSortKey) =>
    sort.key === key ? (sort.dir === "asc" ? "↑" : "↓") : " ";
  let sa = 0,
    dep = 0,
    pay = 0,
    bal = 0;
  for (const r of rows) {
    sa += r.salesAmount;
    dep += r.deposit;
    pay += r.payTotal;
    bal += r.balance;
  }
  return (
    <>
      {`       *****   ${title}   *****\n\n`}
      <span className="hdr">
        <button
          type="button"
          className="sales-sort"
          aria-label="Sort by invoice date"
          onClick={() => onSort("date")}
        >
          {`Inv_Date${mark("date")}`}
        </button>
        {` InvNo `}
        <button
          type="button"
          className="sales-sort"
          aria-label="Sort by company number"
          onClick={() => onSort("company")}
        >
          {`Com${mark("company")}`}
        </button>
        {`  Pro   Sales_Amt    Deposit  Sales_Bal   PayTotal    Balance\n`}
      </span>
      {"--------------------------------------------------------------------------------\n"}
      {sorted.map((r) => (
        <button
          type="button"
          key={`${r.companyNo}-${r.proNo}-${r.salesDate}-${r.invoice}`}
          className="sales-inv"
          aria-label={`Invoice ${r.invoice}`}
          onClick={() => onInvoice(r)}
        >
          {padR(fmtDate(r.salesDate), 10)}{" "}
          <span className="sales-invno">{padL(r.invoice, 5)}</span>
          {` ${padR(r.companyNo, 4)} ${padR(r.proNo, 3)}  ${padL(money(r.salesAmount), 10)} ${padL(money(r.deposit), 9)} ${padL(money(r.salesBal), 10)} ${padL(money(r.payTotal), 10)} ${padL(money(r.balance), 10)}\n`}
        </button>
      ))}
      {"--------------------------------------------------------------------------------\n"}
      <span className="total">
        {`Total Counts: ${rows.length}  Amounts: ${money(sa)}  Deposit: ${money(dep)}  Payment: ${money(pay)}  Balance: ${money(bal)}\n`}
      </span>
    </>
  );
}

function PayrollReport({
  rows,
  onInvoice,
}: {
  rows: PayrollRow[];
  onInvoice: (row: PayrollRow) => void;
}) {
  let tot = 0;
  let mat = 0;
  for (const r of rows) {
    tot += r.invoiceTotal;
    mat += r.materialCost;
  }
  return (
    <div className="payroll-wrap">
      <div className="hdr">*****   Payroll Report   *****</div>
      <table className="payroll-grid">
        <colgroup>
          <col className="payroll-col-date" />
          <col className="payroll-col-inv" />
          <col className="payroll-col-addr" />
          <col className="payroll-col-unit" />
          <col className="payroll-col-amt" />
          <col className="payroll-col-amt" />
          <col className="payroll-col-blank" />
          <col className="payroll-col-blank" />
        </colgroup>
        <thead>
          <tr>
            <th>Inv_Date</th>
            <th>Inv#</th>
            <th>Address</th>
            <th>Unit</th>
            <th className="num">Inv_Total</th>
            <th className="num">Mat_Cost</th>
            <th className="blank" aria-label="Blank column 1" />
            <th className="blank" aria-label="Blank column 2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={`${r.companyNo}-${r.proNo}-${r.salesDate}-${r.invoice}`}
              className="payroll-row"
            >
              <td>{fmtDate(r.salesDate)}</td>
              <td>
                <button
                  type="button"
                  className="sales-invno"
                  aria-label={`Invoice ${r.invoice}`}
                  onClick={() => onInvoice(r)}
                >
                  {r.invoice}
                </button>
              </td>
              <td className="addr">
                <div>{r.propertyAddress}</div>
                {r.jobDescription ? (
                  <div className="payroll-job">{r.jobDescription}</div>
                ) : null}
              </td>
              <td>{r.salesUnit}</td>
              <td className="num">{money(r.invoiceTotal)}</td>
              <td className="num">{money(r.materialCost)}</td>
              <td className="blank" />
              <td className="blank" />
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="total">
            <td colSpan={4}>{`Total Counts: ${rows.length}`}</td>
            <td className="num">{money(tot)}</td>
            <td className="num">{money(mat)}</td>
            <td className="blank" />
            <td className="blank" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function formatPaintUsage(rows: PaintUsageRow[]): string {
  let t = `*****   Paint Usage Report   *****\n\n`;
  t +=
    "Work Person          Mat_Cost  Inv#  Inv_Total  Paint Supply Co.           Work Date\n";
  t +=
    "-------------------------------------------------------------------------------------\n";
  for (const r of rows) {
    t += `${padR(r.workPerson, 20)} ${padL(money(r.materialCost), 8)} ${padL(r.invoice, 5)} ${padL(money(r.invoiceTotal), 10)}  ${padR(r.paintSupplyCo, 26)} ${padR(fmtDate(r.workDate), 10)}\n`;
  }
  t +=
    "-------------------------------------------------------------------------------------\n";
  t += `Total Counts: ${rows.length}\n`;
  return t;
}

function formatCustomerFile(
  cos: Company[],
  props: { companyNo: string; proNo: string; name: string; phone: string; street: string; manager: string; pageMap: string; keyInfo: string; paintTime: string; noOfUnit: number }[],
): string {
  let t = `*****  Customer Report  *****\nDATE : ${fmtDate(new Date().toISOString().slice(0, 10))}\n\n`;
  for (const c of cos) {
    t += `---Company Information------------------------------------------------------------------------------------------------------------------\n`;
    t += `${c.companyNo}  ${c.name}  ${c.phone}  ${c.contact}\n`;
    t += `  ${c.street}  ${c.city}, ${c.state} ${c.zip}\n`;
    const mine = props.filter((p) => p.companyNo === c.companyNo);
    t +=
      "ProNo  Property Name                     ProPhone-1       Key         Time           Unit  Contact            Page Map\n";
    for (const p of mine) {
      t += `${padR(p.proNo, 5)}  ${padR(p.name, 32)} ${padR(p.phone, 16)} ${padR(p.keyInfo, 11)} ${padR(p.paintTime, 14)} ${padL(p.noOfUnit, 4)}  ${padR(p.manager, 18)} ${p.pageMap}\n`;
    }
    t += ` --> Property Total : ${mine.length}\n\n`;
  }
  t += `Company  Grand Total : ${cos.length}\n`;
  t += `Property Grand Total : ${props.length}\n`;
  return t;
}

function formatMissing(rows: MissingInvoiceRow[]): string {
  let t = `*****   Check Missing Invoice   *****\n\n`;
  t +=
    "Ord#  OrdDate  Comp Pro Order By        Inv_# Inv_Date    Balance   Status / Address\n";
  t +=
    "----------------------------------------------------------------------------------------\n";
  let built = 0,
    voidOrd = 0,
    missing = 0;
  for (const r of rows) {
    if (r.status.includes("Void Work")) voidOrd++;
    else if (r.status.includes("Not Build")) missing++;
    else built++;
    t += `${padL(r.orderNo, 5)} ${padR(fmtDate(r.orderDate), 10)} ${padR(r.companyNo, 4)} ${padR(r.proNo, 3)} ${padR(r.orderBy, 14)} ${r.invoice ? padL(r.invoice, 5) : "    -"} ${padR(fmtDate(r.invDate), 10)} ${padL(money(r.balance), 9)}  ${r.status} ${r.propertyAddress} ${r.unitSize}\n`;
  }
  t +=
    "================================================================================\n";
  t += `Total Built Order Count : ${built + missing + voidOrd}\n`;
  t += `       Void Order Count : ${voidOrd}\n`;
  t += `       Missing Invoice  : ${missing}\n`;
  t += `    Built Invoice Count : ${built}\n`;
  return t;
}

function formatLabelsCompany(cos: Company[]): string {
  let t = ` TEST MAILING LABELS \n\n`;
  for (const c of cos) {
    t += `${c.name}\n${c.street}\n${c.city}, ${c.state} ${c.zip}\n\n`;
  }
  t += `Total : ${cos.length}\n`;
  return t;
}

function formatLabelsProperty(
  props: { name: string; street: string; city: string; state: string; zip: string }[]
): string {
  let t = ` TEST MAILING LABELS \n\n`;
  for (const p of props) {
    t += `${p.name}\n${p.street}\n${p.city}, ${p.state} ${p.zip}\n\n`;
  }
  t += `Total : ${props.length}\n`;
  return t;
}
