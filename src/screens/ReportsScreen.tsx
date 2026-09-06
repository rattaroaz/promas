/**
 * Original Reports Menu (8 items) with proper report logic.
 */
import { useState } from "react";
import {
  api,
  AgingRow,
  SalesAnalysisRow,
  WorkerWageRow,
  LedgerLine,
  MissingInvoiceRow,
  Company,
  Invoice,
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

type AgingDetail = {
  company: AgingRow;
  invoices: Invoice[];
};

/** `?` lists every company with an open balance, same as Clipper first/all. */
export function agingSearchQuery(raw: string): string | undefined {
  const q = raw.trim();
  if (!q || q === "?") return undefined;
  return q;
}

const REPORT_ITEMS: MenuItem[] = [
  { id: "ledger", num: "1", label: "Customer Ledger", accel: "L" },
  { id: "customer", num: "2", label: "Customer File", accel: "C" },
  { id: "invoice", num: "3", label: "Invoice Register", accel: "I" },
  { id: "cash", num: "4", label: "Cash Receipts Register", accel: "R" },
  { id: "aging", num: "5", label: "Open Receivables Aging", accel: "O" },
  { id: "sales", num: "6", label: "Sales Analysis", accel: "S" },
  { id: "missing", num: "7", label: "Check Missing Invoice", accel: "M" },
  { id: "labels", num: "8", label: "Mailing Labels", accel: "A" },
];

export function ReportsScreen({ onBack }: { onBack: () => void }) {
  const [report, setReport] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [companyNo, setCompanyNo] = useState("");
  const [search, setSearch] = useState("");
  const [labelMode, setLabelMode] = useState<"C" | "P">("C");
  const [text, setText] = useState("");
  const [agingRows, setAgingRows] = useState<AgingRow[] | null>(null);
  const [agingDetail, setAgingDetail] = useState<AgingDetail | null>(null);
  const [msg, setMsg] = useState("");
  const [help, setHelp] = useState(false);
  const [running, setRunning] = useState(false);

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

  async function runReport(id: string) {
    setRunning(true);
    setMsg("Generating report...");
    try {
      if (id === "aging") {
        setAgingDetail(null);
        setAgingRows(await api.reportAging(undefined, agingSearchQuery(search)));
        setText("");
      } else if (id === "sales" || id === "invoice") {
        const rows = await api.reportSalesAnalysis({
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
          companyNo: companyNo || undefined,
        });
        setAgingRows(null);
        setAgingDetail(null);
        setText(
          formatSales(
            rows,
            id === "invoice" ? "Invoice Register" : "Sales Analysis"
          )
        );
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
        setAgingRows(null);
        setAgingDetail(null);
        setText(t);
      } else if (id === "ledger") {
        if (!companyNo.trim()) {
          setMsg("From Company No : required for Customer Ledger");
          setRunning(false);
          return;
        }
        const co = await api.getCompany(companyNo.trim());
        const lines = await api.reportCustomerLedger(companyNo.trim());
        setAgingRows(null);
        setAgingDetail(null);
        setText(formatLedger(co, lines));
      } else if (id === "customer") {
        const cos = await api.listCompanies({ limit: 5000 });
        const props = await api.listProperties({ limit: 10000 });
        setAgingRows(null);
        setAgingDetail(null);
        setText(formatCustomerFile(cos, props));
      } else if (id === "missing") {
        const rows = await api.reportMissingInvoices({
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        });
        setAgingRows(null);
        setAgingDetail(null);
        setText(formatMissing(rows));
      } else if (id === "labels") {
        if (labelMode === "C") {
          const cos = await api.listCompanies({ limit: 5000 });
          setText(formatLabelsCompany(cos));
        } else {
          const props = await api.listProperties({ limit: 10000 });
          setText(formatLabelsProperty(props));
        }
        setAgingRows(null);
        setAgingDetail(null);
      } else {
        const rows = await api.reportWorkerWages({
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        });
        setAgingRows(null);
        setAgingDetail(null);
        setText(formatWages(rows));
      }
      setMsg(
        id === "aging"
          ? "Click a company number for outstanding invoice items  Esc=Exit  (P)rint  (X)cel"
          : "Selection (Esc=Exit,(P)rint,(S)creen)?"
      );
    } catch (e) {
      setMsg(String(e));
      setText("");
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
      setMsg("Esc=Back to aging  (P)rint  (X)cel");
    } catch (e) {
      setMsg(String(e));
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
          setMsg(
            id === "ledger"
              ? "Enter Company No, then Enter to run"
              : id === "aging"
                ? "? = all companies that owe money, or search company / address, then Enter"
              : id === "cash"
                ? "Search company or property address (optional), then Enter to run"
              : id === "labels"
                ? "Enter Seletion (Esc=Exit,(C)ustomer,(P)roperty)?"
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
        {(report === "ledger" ||
          report === "invoice" ||
          report === "cash" ||
          report === "sales") && (
          <>
            <label>From Company No :</label>
            <input
              className="dos-input w8"
              value={companyNo}
              onChange={(e) => setCompanyNo(e.target.value)}
            />
          </>
        )}
        {report !== "aging" &&
          report !== "customer" &&
          report !== "labels" &&
          report !== "ledger" && (
            <>
              <label>From Date :</label>
              <input
                className="dos-input w12"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
              <label>To Date :</label>
              <input
                className="dos-input w12"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
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
        />
      ) : (
      <div className="dos-report">
        {report === "aging" && agingRows ? (
          <AgingReport rows={agingRows} onCompany={openAgingDetail} />
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
}: {
  company: AgingRow;
  invoices: Invoice[];
  onExcel: () => void;
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
              {formatAgingInvoiceRow(inv)}
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

function formatSales(rows: SalesAnalysisRow[], title: string): string {
  let t = `       *****   ${title}   *****\n\n`;
  t +=
    "Inv_Date   InvNo Com  Pro   Sales_Amt    Deposit  Sales_Bal   PayTotal    Balance\n";
  t +=
    "--------------------------------------------------------------------------------\n";
  let sa = 0,
    dep = 0,
    pay = 0,
    bal = 0;
  for (const r of rows) {
    t += `${padR(fmtDate(r.salesDate), 10)} ${padL(r.invoice, 5)} ${padR(r.companyNo, 4)} ${padR(r.proNo, 3)}  ${padL(money(r.salesAmount), 10)} ${padL(money(r.deposit), 9)} ${padL(money(r.salesBal), 10)} ${padL(money(r.payTotal), 10)} ${padL(money(r.balance), 10)}\n`;
    sa += r.salesAmount;
    dep += r.deposit;
    pay += r.payTotal;
    bal += r.balance;
  }
  t +=
    "--------------------------------------------------------------------------------\n";
  t += `Total Counts: ${rows.length}  Amounts: ${money(sa)}  Deposit: ${money(dep)}  Payment: ${money(pay)}  Balance: ${money(bal)}\n`;
  return t;
}

function formatWages(rows: WorkerWageRow[]): string {
  let t = `*****   Worker Wages Report  *****\n\n`;
  t +=
    "Worker   WorkDate   Inv#  Co/Pro  Inv_Amnt  Rate%     Wages   Description\n";
  t +=
    "--------------------------------------------------------------------------------\n";
  let tw = 0;
  for (const r of rows) {
    t += `${padR(r.empNo, 6)} ${padR(fmtDate(r.workDate || r.invDate), 10)} ${padL(r.invoice, 5)} ${padR(r.companyNo + "/" + r.proNo, 7)} ${padL(money(r.invAmount), 9)} ${padL(r.rate.toFixed(1), 6)} ${padL(money(r.wages), 9)}  ${padR(r.description, 30)}\n`;
    tw += r.wages;
  }
  t +=
    "--------------------------------------------------------------------------------\n";
  t += `Grand Total Wages: ${money(tw)}\n`;
  return t;
}

function formatLedger(
  co: Company | null,
  lines: LedgerLine[]
): string {
  let t = `      *****   Customer Ledger   *****\n`;
  t += `Company NO : ${co?.companyNo || ""}  ${co?.name || ""}\n`;
  t += `Phone      : ${co?.phone || ""}\n\n`;
  t +=
    "Invoice#  Inv_Date  Inv_amount  PayDate   Payrefno   Payamount     Balance\n";
  t +=
    "------------------------------------------------------------------------------\n";
  let invTot = 0;
  let payTot = 0;
  let ending = 0;
  // Track last balance per invoice group for ending open AR
  let lastBal = 0;
  for (const l of lines) {
    if (l.invoice) {
      invTot += l.invAmount;
      ending += lastBal;
      lastBal = l.balance;
    } else {
      lastBal = l.balance;
    }
    if (l.payAmount && l.payRefNo !== "DEPOSIT") payTot += l.payAmount;
    t += `${l.invoice ? padL(l.invoice, 8) : "        "}  ${padR(fmtDate(l.invDate), 10)}  ${l.invAmount ? padL(money(l.invAmount), 10) : "          "}  ${padR(fmtDate(l.payDate), 9)} ${padR(l.payRefNo || "", 10)} ${l.payAmount != null ? padL(money(l.payAmount), 10) : "          "} ${padL(money(l.balance), 10)}\n`;
  }
  ending += lastBal;
  t +=
    "------------------------------------------------------------------------------\n";
  t += `Invoice Total.... ${money(invTot)}\n`;
  t += `Receipt Total.... ${money(payTot)}\n`;
  t += `Ending Balance... ${money(ending)}\n`;
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
