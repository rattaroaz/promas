/**
 * Material Process item 5 — Worker Wages Calculation / Report
 * Original: From Worker No / date range → wages lines from invoice_lines
 */
import { useState } from "react";
import { api, WorkerWageRow } from "../api";
import { useDosKeys } from "../dos/hooks";
import { Screen, HelpOverlay } from "../dos/Shell";
import { money, fmtDate } from "../dos/utils";

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
        `*****   Worker Wages Report  *****  Total Wages: ${money(tw)}  End=Print  Esc=Exit`
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
          <div className="dos-browse">
            <div className="browse-grid browse-grid-header" style={{ gridTemplateColumns: "8ch 12ch 7ch 10ch 12ch 8ch 12ch 30ch" }}>
              <div>Worker</div>
              <div>WorkDate</div>
              <div>Inv#</div>
              <div>Co/Pro</div>
              <div>Inv_Amnt</div>
              <div>Rate%</div>
              <div>Wages</div>
              <div>Description</div>
            </div>
            <div className="dos-browse-body">
              {rows.map((r, i) => (
                <div key={i} className="dos-row browse-grid" style={{ gridTemplateColumns: "8ch 12ch 7ch 10ch 12ch 8ch 12ch 30ch" }}>
                  <div>{r.empNo}</div>
                  <div>{fmtDate(r.workDate || r.invDate)}</div>
                  <div>{r.invoice}</div>
                  <div>{r.companyNo}/{r.proNo}</div>
                  <div>{money(r.invAmount)}</div>
                  <div>{r.rate.toFixed(1)}</div>
                  <div>{money(r.wages)}</div>
                  <div className="desc-truncate">{r.description}</div>
                </div>
              ))}
            </div>
            <div className="browse-grid" style={{ color: "var(--dos-yellow)", fontWeight: "bold", marginTop: "0.5em", gridTemplateColumns: "8ch 12ch 7ch 10ch 12ch 8ch 12ch 30ch" }}>
              <div style={{ gridColumn: "1 / 5" }}>Grand Total</div>
              <div>{money(totalInv)}</div>
              <div></div>
              <div>{money(totalWages)}</div>
              <div></div>
            </div>
          </div>
        )}
      </div>
      {help && <HelpOverlay onClose={() => setHelp(false)} />}
    </Screen>
  );
}
