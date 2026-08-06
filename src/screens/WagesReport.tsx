/**
 * Material Process item 5 — Worker Wages Calculation / Report
 * Original: From Worker No / date range → wages lines from invoice_lines
 */
import { useState } from "react";
import { api, WorkerWageRow } from "../api";
import { useDosKeys } from "../dos/hooks";
import { Screen, HelpOverlay } from "../dos/Shell";
import { padR, padL, money, fmtDate } from "../dos/utils";

export function WagesReport({ onBack }: { onBack: () => void }) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [empNo, setEmpNo] = useState("");
  const [rows, setRows] = useState<WorkerWageRow[]>([]);
  const [msg, setMsg] = useState(
    "Enter From/To Work Date and Worker No, then Enter to run"
  );
  const [help, setHelp] = useState(false);
  const [ran, setRan] = useState(false);

  useDosKeys({
    onEscape: () => {
      if (help) setHelp(false);
      else onBack();
    },
    onF1: () => setHelp(true),
    onEnter: () => run(),
    onEnd: () => window.print(),
    onChar: (ch) => {
      if (ch === "p" || ch === "P") {
        window.print();
        return true;
      }
      return false;
    },
  });

  async function run() {
    try {
      const data = await api.reportWorkerWages({
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        search: empNo || undefined,
      });
      setRows(data);
      setRan(true);
      const tw = data.reduce((s, r) => s + r.wages, 0);
      setMsg(
        `*****   Worker Wages Report  *****  Total Wages: ${money(tw)}  (P)rint  Esc=Exit`
      );
    } catch (e) {
      setMsg(String(e));
    }
  }

  const totalWages = rows.reduce((s, r) => s + r.wages, 0);
  const totalInv = rows.reduce((s, r) => s + r.invAmount, 0);

  return (
    <Screen
      statusKeys={[
        { key: "Esc", label: "Exit" },
        { key: "Enter", label: "Run" },
        { key: "P", label: "Print" },
        { key: "End", label: "Print" },
        { key: "F1", label: "Help" },
      ]}
      title="*****   Worker Wages Report  *****"
      message={msg}
    >
      <div className="dos-searchline">
        <label>From Worker No :</label>
        <input
          className="dos-input w8"
          value={empNo}
          onChange={(e) => setEmpNo(e.target.value)}
          autoFocus
        />
        <label>From Work Date :</label>
        <input
          className="dos-input w12"
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
        />
        <label>To :</label>
        <input
          className="dos-input w12"
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
        />
        <button className="dos-btn" onClick={run}>
          Run
        </button>
      </div>
      <div className="dos-report">
        {!ran ? (
          <span style={{ color: "var(--dos-yellow)" }}>
            0 Enter Worker Wages (Esc=Cancel) ! — press Enter to calculate
          </span>
        ) : (
          <>
            <span className="hdr">
              {
                "Worker   WorkDate   Inv#  Co/Pro  Inv_Amnt  Rate%     Wages   Description"
              }
            </span>
            {"\n"}
            {"--------------------------------------------------------------------------------\n"}
            {rows.map((r, i) => (
              <span key={i}>
                {`${padR(r.empNo, 6)} ${padR(fmtDate(r.workDate || r.invDate), 10)} ${padL(r.invoice, 5)} ${padR(r.companyNo + "/" + r.proNo, 7)} ${padL(money(r.invAmount), 9)} ${padL(r.rate.toFixed(1), 6)} ${padL(money(r.wages), 9)}  ${padR(r.description, 28)}\n`}
              </span>
            ))}
            {"--------------------------------------------------------------------------------\n"}
            <span className="total">
              {`Grand Total  Invoice : ${money(totalInv)}\n               Wages : ${money(totalWages)}\n`}
            </span>
          </>
        )}
      </div>
      {help && <HelpOverlay onClose={() => setHelp(false)} />}
    </Screen>
  );
}
