import { useState } from "react";
import { api, AgingRow, SalesAnalysisRow, WorkerWageRow } from "../api";
import { useDosKeys } from "../dos/hooks";
import { Screen, HelpOverlay } from "../dos/Shell";
import { padR, padL, money, fmtDate } from "../dos/utils";
import { DateInput } from "../dos/DateInput";
import { SubMenu, MenuItem } from "./SubMenu";

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
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [help, setHelp] = useState(false);
  const [running, setRunning] = useState(false);

  useDosKeys(
    {
      onEscape: () => {
        if (help) setHelp(false);
        else if (report) {
          setReport(null);
          setText("");
        } else onBack();
      },
      onF1: () => setHelp(true),
      onEnd: () => window.print(),
      onEnter: () => {
        if (report && !text) runReport(report);
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
        if (report && (ch === "s" || ch === "S")) {
          return true;
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
        const rows = await api.reportAging();
        setText(formatAging(rows));
      } else if (id === "sales" || id === "invoice") {
        const rows = await api.reportSalesAnalysis({
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        });
        setText(formatSales(rows, id === "invoice" ? "Invoice Register" : "Sales Analysis"));
      } else if (id === "cash") {
        const rows = await api.listCashReceipts({
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
          limit: 500,
        });
        let t = `        *****    Cash  Receipts   *****\n\n`;
        t += "Inv#  Inv_Date  Com# Company                       PayDate  PayRefno      Payment\n";
        t += "--------------------------------------------------------------------------------\n";
        let tot = 0;
        for (const r of rows) {
          t += `${padL(r.invoice, 5)} ${padR(fmtDate(r.salesDate), 10)} ${padR(r.companyNo, 4)} ${padR(r.companyName || "", 28)} ${padR(fmtDate(r.payDate), 8)} ${padR(r.payRefNo, 10)} ${padL(money(r.payment), 10)}\n`;
          tot += r.payment;
        }
        t += "--------------------------------------------------------------------------------\n";
        t += `Total --> Counts : ${rows.length}   Amounts : ${money(tot)}\n`;
        setText(t);
      } else if (id === "customer" || id === "ledger" || id === "labels") {
        const cos = await api.listCompanies({ limit: 2000 });
        let t = `*****  Customer Report  *****\nDATE : ${fmtDate(new Date().toISOString().slice(0, 10))}\n\n`;
        t += "Co#  Company Name                   Phone         Contact              City\n";
        t += "================================================================================\n";
        for (const c of cos) {
          t += `${padR(c.companyNo, 4)} ${padR(c.name, 30)} ${padR(c.phone, 13)} ${padR(c.contact, 20)} ${padR(c.city, 15)}\n`;
        }
        t += `================================================================================\nCompany  Grand Total : ${cos.length}\n`;
        setText(t);
      } else if (id === "missing") {
        const rows = await api.reportSalesAnalysis({
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        });
        setText(
          formatSales(rows, "Check Missing Invoice") +
            "\n(Invoice list — voided invoices marked in browse screen)\n"
        );
      } else {
        const rows = await api.reportWorkerWages({
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        });
        setText(formatWages(rows));
      }
      setMsg("Selection (Esc=Exit,(P)rint,(S)creen)?");
    } catch (e) {
      setMsg(String(e));
      setText("");
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
          setMsg("Enter date range (optional) then press Enter to run");
        }}
      />
    );
  }

  const title =
    REPORT_ITEMS.find((r) => r.id === report)?.label || "Report";

  return (
    <Screen
      statusKeys={[
        { key: "Esc", label: "Exit" },
        { key: "Enter", label: "Run" },
        { key: "P", label: "Print" },
        { key: "End", label: "Print" },
        { key: "F1", label: "Help" },
      ]}
      title={`*****   ${title}   *****`}
      message={msg || (running ? "Working..." : "Enter=Run  P=Print  Esc=Back")}
    >
      <div className="dos-searchline">
        <label>From Date:</label>
        <DateInput
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
        />
        <label>To Date:</label>
        <DateInput
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
        />
        <button className="dos-btn" onClick={() => runReport(report)}>
          Run
        </button>
        <button className="dos-btn" onClick={() => window.print()}>
          Print
        </button>
      </div>
      <div className="dos-report">
        {text ? (
          <span>
            <span className="hdr">{text.split("\n")[0]}</span>
            {"\n"}
            {text.split("\n").slice(1).join("\n")}
          </span>
        ) : (
          <span style={{ color: "var(--dos-yellow)" }}>
            {running
              ? "Generating report......"
              : "Press Enter to run report, or click Run."}
          </span>
        )}
      </div>
      {help && <HelpOverlay onClose={() => setHelp(false)} />}
    </Screen>
  );
}

function formatAging(rows: AgingRow[]): string {
  let t = `*****   Open Receivable Aging  *****\nDate : ${fmtDate(new Date().toISOString().slice(0, 10))}\n\n`;
  t += "Company#  Company Name                     Phone         Current     >30      >60      >90     >120   Open Bal\n";
  t += "==============================================================================================================\n";
  let tc = 0,
    t30 = 0,
    t60 = 0,
    t90 = 0,
    t120 = 0,
    to = 0;
  for (const r of rows) {
    t += `${padR(r.companyNo, 8)}  ${padR(r.companyName, 32)} ${padR(r.phone, 13)} ${padL(money(r.current), 9)} ${padL(money(r.days30), 8)} ${padL(money(r.days60), 8)} ${padL(money(r.days90), 8)} ${padL(money(r.days120), 8)} ${padL(money(r.openBal), 10)}\n`;
    tc += r.current;
    t30 += r.days30;
    t60 += r.days60;
    t90 += r.days90;
    t120 += r.days120;
    to += r.openBal;
  }
  t += "==============================================================================================================\n";
  t += `              Grand Total: ${padL(money(tc), 9)} ${padL(money(t30), 8)} ${padL(money(t60), 8)} ${padL(money(t90), 8)} ${padL(money(t120), 8)} ${padL(money(to), 10)}\n`;
  return t;
}

function formatSales(rows: SalesAnalysisRow[], title: string): string {
  let t = `       *****   ${title}   *****\n\n`;
  t += "Inv_Date   InvNo Com  Pro   Sales_Amt    Deposit  Sales_Bal   PayTotal    Balance\n";
  t += "--------------------------------------------------------------------------------\n";
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
  t += "--------------------------------------------------------------------------------\n";
  t += `Total Counts: ${rows.length}  Amounts: ${money(sa)}  Deposit: ${money(dep)}  Payment: ${money(pay)}  Balance: ${money(bal)}\n`;
  return t;
}

function formatWages(rows: WorkerWageRow[]): string {
  let t = `*****   Worker Wages Report  *****\n\n`;
  t += "Worker   WorkDate   Inv#  Co/Pro  Inv_Amnt  Rate%     Wages   Description\n";
  t += "--------------------------------------------------------------------------------\n";
  let tw = 0;
  for (const r of rows) {
    t += `${padR(r.empNo, 6)} ${padR(fmtDate(r.workDate || r.invDate), 10)} ${padL(r.invoice, 5)} ${padR(r.companyNo + "/" + r.proNo, 7)} ${padL(money(r.invAmount), 9)} ${padL(r.rate.toFixed(1), 6)} ${padL(money(r.wages), 9)}  ${padR(r.description, 30)}\n`;
    tw += r.wages;
  }
  t += "--------------------------------------------------------------------------------\n";
  t += `Grand Total Wages: ${money(tw)}\n`;
  return t;
}
