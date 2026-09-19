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
  CashReceipt,
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
      sign * (a.invoice - b.invoice) ||
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
  const [paintRows, setPaintRows] = useState<PaintUsageRow[] | null>(null);
  const [cashRows, setCashRows] = useState<CashReceipt[] | null>(null);
  const [missingRows, setMissingRows] = useState<MissingInvoiceRow[] | null>(null);
  const [customerData, setCustomerData] = useState<{ cos: Company[]; props: { companyNo: string; proNo: string; name: string; phone: string; street: string; manager: string; pageMap: string; keyInfo: string; paintTime: string; noOfUnit: number }[] } | null>(null);
  const [salesSort, setSalesSort] = useState<{
    key: SalesSortKey;
    dir: SalesSortDir;
  }>({ key: "date", dir: "desc" });
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
          setPaintRows(null);
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
    setPaintRows(null);
    setCashRows(null);
    setMissingRows(null);
    setCustomerData(null);
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
        setCashRows(
          await api.listCashReceipts({
            fromDate: fromDate || undefined,
            toDate: toDate || undefined,
            companyNo: companyNo || undefined,
            search: search.trim() || undefined,
            limit: 2000,
          })
        );
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
        setCustomerData({ cos, props });
      } else if (id === "missing") {
        setMissingRows(
          await api.reportMissingInvoices({
            fromDate: fromDate || undefined,
            toDate: toDate || undefined,
          })
        );
      } else if (id === "paint") {
        setPaintRows(
          await api.reportPaintUsage({
            fromDate: fromDate || undefined,
            toDate: toDate || undefined,
            paintSupplyCo: paintSupply.trim() || undefined,
            search: workPerson.trim() || undefined,
          })
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
          ? "Click a company number for outstanding invoice items  Esc=Exit  End=Print  (X)cel"
          : id === "sales" || id === "invoice"
            ? salesSortMessage(salesSort.key, salesSort.dir)
            : id === "payroll"
              ? "Click invoice# to view  Esc=Exit  End=Print"
            : "Selection (Esc=Exit, End=Print)?"
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
      setMsg("Click invoice# to view form  Esc=Back  End=Print  (X)cel");
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
            ? "Esc=Back to aging  End=Print  (X)cel"
            : "Click a company number for outstanding invoice items  Esc=Exit  End=Print  (X)cel"
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
          setPaintRows(null);
          setSalesSort({ key: "date", dir: "desc" });
          setMsg(
            id === "payroll"
              ? "Work person and invoice date range (optional), then Enter. Click invoice# to view."
              : id === "aging"
                ? "? = all companies that owe money, or search company / address, then Enter"
              : id === "cash"
                ? "Search company or property address (optional), then Enter to run"
              : id === "sales" || id === "invoice"
                ? "Company NO or Name (optional), invoice date range, then Enter. Click Inv_Date or Com to sort."
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
      message={msg || (running ? "Working..." : "Enter=Run  End=Print  Esc=Back")}
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
            <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
              <select
                className="dos-select"
                aria-label="Paint supply search"
                value={paintSupply}
                onChange={(e) => setPaintSupply(e.target.value)}
                style={{ width: "4ch" }}
              >
                <option value="">All</option>
                {paintSupplyOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <span style={{ minWidth: "40ch", maxWidth: "60ch" }}>{paintSupply || "All"}</span>
            </div>
          </>
        )}
        {(report === "paint" || report === "payroll") && (
          <>
            <label>Work Person :</label>
            <input
              className="dos-input"
              list="report-work-person-list"
              value={workPerson}
              onChange={(e) => setWorkPerson(e.target.value)}
              placeholder="Work person"
              aria-label="Work person search"
              style={{ width: "40ch" }}
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
                {report === "paint"
                  ? "From Work Date :"
                  : report === "sales" || report === "invoice"
                    ? "From Invoice Date :"
                    : report === "cash"
                      ? "From Pay Date :"
                      : "From Date :"}
              </label>
              <input
                className="dos-input w12"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                aria-label={
                  report === "paint"
                    ? "From work date"
                    : report === "payroll" ||
                        report === "sales" ||
                        report === "invoice"
                      ? "From invoice date"
                      : report === "cash"
                        ? "From pay date"
                        : undefined
                }
              />
              <label>
                {report === "paint"
                  ? "To Work Date :"
                  : report === "sales" || report === "invoice"
                    ? "To Invoice Date :"
                    : report === "cash"
                      ? "To Pay Date :"
                      : "To Date :"}
              </label>
              <input
                className="dos-input w12"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                aria-label={
                  report === "paint"
                    ? "To work date"
                    : report === "payroll" ||
                        report === "sales" ||
                        report === "invoice"
                      ? "To invoice date"
                      : report === "cash"
                        ? "To pay date"
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
      {(report === "payroll" || report === "paint") && (
        <style>{`@page { size: landscape; }`}</style>
      )}
      <div
        className={
          report === "payroll" || report === "paint"
            ? "dos-report payroll-landscape"
            : "dos-report"
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
        ) : report === "paint" && paintRows ? (
          <PaintUsageReport rows={paintRows} />
        ) : report === "cash" && cashRows ? (
          <CashReceiptsReport rows={cashRows} />
        ) : report === "missing" && missingRows ? (
          <MissingInvoicesReport rows={missingRows} />
        ) : report === "customer" && customerData ? (
          <CustomerFileReport cos={customerData.cos} props={customerData.props} />
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
    <div className="dos-browse">
      <div style={{ padding: "0.3em 0", whiteSpace: "pre" }}>
        {`*****   Open Receivable Aging  *****\nDate : ${fmtDate(today())}\n`}
      </div>
      <div className="dos-browse-body">
        <div className="browse-grid browse-grid-header" style={{ gridTemplateColumns: "8ch 30ch 15ch 14ch 11ch 11ch 11ch 11ch 11ch 11ch", columnGap: "2ch" }}>
          <div>Company#</div>
          <div>Company Name</div>
          <div>Contact</div>
          <div>Phone</div>
          <div>Current</div>
          <div>&gt;30</div>
          <div>&gt;60</div>
          <div>&gt;90</div>
          <div>&gt;120</div>
          <div>Open Bal</div>
        </div>
        {rows.map((r) => (
          <button
            key={r.companyNo}
            type="button"
            className="dos-row browse-grid"
            style={{ gridTemplateColumns: "8ch 30ch 15ch 14ch 11ch 11ch 11ch 11ch 11ch 11ch", columnGap: "2ch" }}
            aria-label={`Company ${r.companyNo} outstanding invoices`}
            onClick={() => onCompany(r)}
          >
            <div>{r.companyNo}</div>
            <div className="desc-truncate">{r.companyName}</div>
            <div>{r.contact ?? ""}</div>
            <div>{r.phone}</div>
            <div>{money(r.current)}</div>
            <div>{money(r.days30)}</div>
            <div>{money(r.days60)}</div>
            <div>{money(r.days90)}</div>
            <div>{money(r.days120)}</div>
            <div>{money(r.openBal)}</div>
          </button>
        ))}
        <div className="browse-grid" style={{ color: "var(--dos-yellow)", fontWeight: "bold", marginTop: "0.5em", gridTemplateColumns: "8ch 30ch 15ch 14ch 11ch 11ch 11ch 11ch 11ch 11ch", columnGap: "2ch" }}>
          <div style={{ gridColumn: "1 / 5" }}>Grand Total</div>
          <div>{money(tc)}</div>
          <div>{money(t30)}</div>
          <div>{money(t60)}</div>
          <div>{money(t90)}</div>
          <div>{money(t120)}</div>
          <div>{money(to)}</div>
        </div>
      </div>
    </div>
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
        <div className="browse-grid browse-grid-header" style={{ gridTemplateColumns: "7ch 12ch 12ch 30ch 9ch 8ch" }}>
          <div>Inv_#</div>
          <div>Inv_Date</div>
          <div>Inv_amount</div>
          <div>Address</div>
          <div>Unit</div>
          <div>PO_No</div>
        </div>
        <div className="dos-browse-body">
          {invoices.map((inv, i) => (
            <button
              key={`${inv.invoice}-${inv.salesDate}-${inv.proNo}`}
              className={`dos-row ${i === index ? "selected" : ""} browse-grid`}
              style={{ gridTemplateColumns: "7ch 12ch 12ch 30ch 9ch 8ch" }}
              onMouseEnter={() => setIndex(i)}
              onClick={() => onInvoice(inv)}
            >
              <div>{inv.invoice}</div>
              <div>{fmtDate(inv.salesDate)}</div>
              <div>{money(inv.salesTotal)}</div>
              <div className="desc-truncate">{(inv.propertyStreet || inv.propertyName || "").trim()}</div>
              <div>{inv.salesUnit}</div>
              <div>{inv.custPoNo}</div>
            </button>
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
    <div className="dos-browse">
      <div style={{ padding: "0.3em 0", textAlign: "center" }}>
        {`*****   ${title}   *****`}
      </div>
      <div className="browse-grid browse-grid-header" style={{ gridTemplateColumns: "12ch 7ch 8ch 8ch 12ch 12ch 12ch 12ch 12ch" }}>
        <button
          type="button"
          className="sort-btn"
          aria-label="Sort by invoice date"
          onClick={() => onSort("date")}
        >
          Inv_Date{mark("date")}
        </button>
        <div>InvNo</div>
        <button
          type="button"
          className="sort-btn"
          aria-label="Sort by company number"
          onClick={() => onSort("company")}
        >
          Com{mark("company")}
        </button>
        <div>Pro</div>
        <div>Sales_Amt</div>
        <div>Deposit</div>
        <div>Sales_Bal</div>
        <div>PayTotal</div>
        <div>Balance</div>
      </div>
      <div className="dos-browse-body">
        {sorted.map((r) => (
          <button
            type="button"
            key={`${r.companyNo}-${r.proNo}-${r.salesDate}-${r.invoice}`}
            className="dos-row browse-grid"
            style={{ gridTemplateColumns: "12ch 7ch 8ch 8ch 12ch 12ch 12ch 12ch 12ch" }}
            aria-label={`Invoice ${r.invoice}`}
            onClick={() => onInvoice(r)}
          >
            <div>{fmtDate(r.salesDate)}</div>
            <div>{r.invoice}</div>
            <div>{r.companyNo}</div>
            <div>{r.proNo}</div>
            <div>{money(r.salesAmount)}</div>
            <div>{money(r.deposit)}</div>
            <div>{money(r.salesBal)}</div>
            <div>{money(r.payTotal)}</div>
            <div>{money(r.balance)}</div>
          </button>
        ))}
      </div>
      <div className="browse-grid" style={{ color: "var(--dos-yellow)", fontWeight: "bold", marginTop: "0.5em", gridTemplateColumns: "12ch 7ch 8ch 8ch 12ch 12ch 12ch 12ch 12ch" }}>
        <div style={{ gridColumn: "1 / 5" }}>Total Counts: {rows.length}</div>
        <div>{money(sa)}</div>
        <div>{money(dep)}</div>
        <div></div>
        <div>{money(pay)}</div>
        <div>{money(bal)}</div>
      </div>
    </div>
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
      <div className="dos-browse">
        <div className="browse-grid browse-grid-header" style={{ gridTemplateColumns: "12ch 7ch 30ch 9ch 12ch 12ch 8ch 8ch" }}>
          <div>Inv_Date</div>
          <div>Inv#</div>
          <div>Address</div>
          <div>Unit</div>
          <div>Inv_Total</div>
          <div>Mat_Cost</div>
          <div></div>
          <div></div>
        </div>
        <div className="dos-browse-body">
          {rows.map((r) => (
            <div
              key={`${r.companyNo}-${r.proNo}-${r.salesDate}-${r.invoice}`}
              className="dos-row browse-grid"
              style={{ gridTemplateColumns: "12ch 7ch 30ch 9ch 12ch 12ch 8ch 8ch" }}
            >
              <div>{fmtDate(r.salesDate)}</div>
              <div style={{ minWidth: 0, minHeight: "44px", display: "flex", alignItems: "center" }}>
                <button
                  type="button"
                  className="sales-invno"
                  style={{ width: "100%", minHeight: "44px" }}
                  aria-label={`Invoice ${r.invoice}`}
                  onClick={() => onInvoice(r)}
                >
                  {r.invoice}
                </button>
              </div>
              <div className="desc-truncate">
                <div>{r.propertyAddress}</div>
                {r.jobDescription ? (
                  <div className="payroll-job">{r.jobDescription}</div>
                ) : null}
              </div>
              <div>{r.salesUnit}</div>
              <div>{money(r.invoiceTotal)}</div>
              <div>{money(r.materialCost)}</div>
              <div></div>
              <div></div>
            </div>
          ))}
        </div>
        <div className="browse-grid" style={{ color: "var(--dos-yellow)", fontWeight: "bold", gridTemplateColumns: "12ch 7ch 30ch 9ch 12ch 12ch 8ch 8ch" }}>
          <div style={{ gridColumn: "1 / 5" }}>{`Total Counts: ${rows.length}`}</div>
          <div>{money(tot)}</div>
          <div>{money(mat)}</div>
          <div></div>
          <div></div>
        </div>
      </div>
    </div>
  );
}

function PaintUsageReport({ rows }: { rows: PaintUsageRow[] }) {
  return (
    <div className="payroll-wrap">
      <div className="hdr">*****   Paint Usage Report   *****</div>
      <div className="dos-browse">
        <div className="browse-grid browse-grid-header" style={{ gridTemplateColumns: "18ch 12ch 7ch 12ch 30ch 12ch" }}>
          <div>Work Person</div>
          <div>Mat_Cost</div>
          <div>Inv#</div>
          <div>Inv_Total</div>
          <div>Paint Supply Co.</div>
          <div>Work Date</div>
        </div>
        <div className="dos-browse-body">
          {rows.map((r, i) => (
            <div
              key={`${r.invoice}-${r.workDate}-${r.workPerson}-${i}`}
              className="dos-row browse-grid"
              style={{ gridTemplateColumns: "18ch 12ch 7ch 12ch 30ch 12ch" }}
            >
              <div>{r.workPerson}</div>
              <div>{money(r.materialCost)}</div>
              <div>{r.invoice}</div>
              <div>{money(r.invoiceTotal)}</div>
              <div>{r.paintSupplyCo}</div>
              <div>{fmtDate(r.workDate)}</div>
            </div>
          ))}
        </div>
        <div className="browse-grid" style={{ color: "var(--dos-yellow)", fontWeight: "bold", gridTemplateColumns: "18ch 12ch 7ch 12ch 30ch 12ch" }}>
          <div style={{ gridColumn: "1 / 7" }}>{`Total Counts: ${rows.length}`}</div>
        </div>
      </div>
    </div>
  );
}

function CashReceiptsReport({ rows }: { rows: CashReceipt[] }) {
  const total = rows.reduce((sum, r) => sum + r.payment, 0);
  return (
    <div className="dos-browse">
      <div style={{ padding: "0.3em 0", textAlign: "center" }}>
        *****    Cash  Receipts   *****
      </div>
      <div className="browse-grid browse-grid-header" style={{ gridTemplateColumns: "7ch 12ch 8ch 30ch 12ch 10ch 12ch" }}>
        <div>Inv#</div>
        <div>Inv_Date</div>
        <div>Com#</div>
        <div>Company</div>
        <div>PayDate</div>
        <div>PayRefno</div>
        <div>Payment</div>
      </div>
      <div className="dos-browse-body">
        {rows.map((r, i) => (
          <div key={i} className="dos-row browse-grid" style={{ gridTemplateColumns: "7ch 12ch 8ch 30ch 12ch 10ch 12ch" }}>
            <div>{r.invoice}</div>
            <div>{fmtDate(r.salesDate)}</div>
            <div>{r.companyNo}</div>
            <div className="desc-truncate">{r.companyName || ""}</div>
            <div>{fmtDate(r.payDate)}</div>
            <div>{r.payRefNo}</div>
            <div>{money(r.payment)}</div>
          </div>
        ))}
      </div>
      <div className="browse-grid" style={{ color: "var(--dos-yellow)", fontWeight: "bold", marginTop: "0.5em", gridTemplateColumns: "7ch 12ch 8ch 30ch 12ch 10ch 12ch" }}>
        <div style={{ gridColumn: "1 / 7" }}>Cash Receipts Total Counts: {rows.length}</div>
        <div>{money(total)}</div>
      </div>
    </div>
  );
}

function MissingInvoicesReport({ rows }: { rows: MissingInvoiceRow[] }) {
  return (
    <div className="dos-browse">
      <div style={{ padding: "0.3em 0", textAlign: "center" }}>
        *****   Check Missing Invoice   *****
      </div>
                <div className="browse-grid browse-grid-header" style={{ gridTemplateColumns: "7ch 12ch 8ch 8ch 15ch 7ch 12ch 12ch" }}>
        <div>Ord#</div>
        <div>OrdDate</div>
        <div>Com#</div>
        <div>Pro</div>
        <div>Order By</div>
        <div>Inv#</div>
        <div>Inv_Date</div>
        <div>Balance</div>
      </div>
      <div className="dos-browse-body">
        {rows.map((r, i) => (
          <div key={i} className="dos-row browse-grid" style={{ gridTemplateColumns: "7ch 12ch 8ch 8ch 15ch 7ch 12ch 12ch" }}>
            <div>{r.orderNo}</div>
            <div>{fmtDate(r.orderDate)}</div>
            <div>{r.companyNo}</div>
            <div>{r.proNo}</div>
            <div>{r.orderBy}</div>
            <div>{r.invoice || "-"}</div>
            <div>{fmtDate(r.invDate)}</div>
            <div>{money(r.balance)}</div>
          </div>
        ))}
      </div>
      <div style={{ color: "var(--dos-yellow)", marginTop: "0.5em" }}>
        {rows.filter(r => r.status.includes("Void Work")).length} Void Work Orders, {rows.filter(r => r.status.includes("Not Build")).length} Not Built, {rows.filter(r => !r.status.includes("Void") && !r.status.includes("Not Build")).length} Built
      </div>
    </div>
  );
}

function CustomerFileReport({ cos, props }: { cos: Company[]; props: { companyNo: string; proNo: string; name: string; phone: string; street: string; manager: string; pageMap: string; keyInfo: string; paintTime: string; noOfUnit: number }[] }) {
  return (
    <div style={{ padding: "1em" }}>
      <div style={{ textAlign: "center", marginBottom: "1em" }}>
        *****  Customer Report  *****
        <br />
        DATE : {fmtDate(new Date().toISOString().slice(0, 10))}
      </div>
      {cos.map((c) => {
        const mine = props.filter((p) => p.companyNo === c.companyNo);
        return (
          <div key={c.companyNo} style={{ marginBottom: "2em" }}>
            <div style={{ fontWeight: "bold", marginBottom: "0.5em" }}>
              ---Company Information---
            </div>
            <div className="browse-grid" style={{ marginBottom: "0.5em", gridTemplateColumns: "12ch 8ch 8ch 8ch" }}>
              <div>Company#:</div>
              <div>{c.companyNo}</div>
              <div>Company Name:</div>
              <div className="desc-truncate">{c.name}</div>
              <div>Contact:</div>
              <div>{c.contact}</div>
              <div>Phone:</div>
              <div>{c.phone}</div>
              <div>City:</div>
              <div>{c.city}</div>
              <div>State:</div>
              <div>{c.state}</div>
              <div>Zip:</div>
              <div>{c.zip}</div>
            </div>
            {mine.length > 0 && (
              <>
                <div style={{ fontWeight: "bold", marginTop: "1em", marginBottom: "0.5em" }}>
                  Property Information
                </div>
                <div className="browse-grid browse-grid-header" style={{ gridTemplateColumns: "8ch 30ch 14ch 12ch 10ch 9ch 15ch 10ch" }}>
                  <div>ProNo</div>
                  <div>Property Name</div>
                  <div>ProPhone-1</div>
                  <div>Key</div>
                  <div>Time</div>
                  <div>Unit</div>
                  <div>Contact</div>
                  <div>Page Map</div>
                </div>
                <div className="dos-browse-body">
                  {mine.map((p, i) => (
                    <div key={i} className="dos-row browse-grid" style={{ gridTemplateColumns: "8ch 30ch 14ch 12ch 10ch 9ch 15ch 10ch" }}>
                      <div>{p.proNo}</div>
                      <div>{p.name}</div>
                      <div>{p.phone}</div>
                      <div>{p.keyInfo}</div>
                      <div>{p.paintTime}</div>
                      <div>{p.noOfUnit}</div>
                      <div>{p.manager}</div>
                      <div>{p.pageMap}</div>
                    </div>
                  ))}
                </div>
                <div style={{ color: "var(--dos-yellow)", marginTop: "0.5em" }}>
                  Property Total: {mine.length}
                </div>
              </>
            )}
          </div>
        );
      })}
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
