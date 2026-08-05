import { useState } from "react";
import {
  api,
  AgingRow,
  SalesAnalysisRow,
  WorkerWageRow,
  money,
  fmtDate,
} from "../api";
import { Loading } from "../components/ui";

type ReportKind = "aging" | "sales" | "wages";

export function Reports() {
  const [kind, setKind] = useState<ReportKind>("aging");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [empNo, setEmpNo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [aging, setAging] = useState<AgingRow[]>([]);
  const [sales, setSales] = useState<SalesAnalysisRow[]>([]);
  const [wages, setWages] = useState<WorkerWageRow[]>([]);

  async function run() {
    setLoading(true);
    setError("");
    try {
      if (kind === "aging") {
        setAging(await api.reportAging());
      } else if (kind === "sales") {
        setSales(
          await api.reportSalesAnalysis({
            fromDate: fromDate || undefined,
            toDate: toDate || undefined,
          })
        );
      } else {
        setWages(
          await api.reportWorkerWages({
            fromDate: fromDate || undefined,
            toDate: toDate || undefined,
            search: empNo || undefined,
          })
        );
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <h2>Reports</h2>
        <div className="actions">
          <button className="btn" onClick={() => window.print()}>
            Print
          </button>
        </div>
      </div>
      <div className="page-body">
        {error && <div className="alert error">{error}</div>}
        <div className="toolbar">
          <select
            className="select"
            value={kind}
            onChange={(e) => setKind(e.target.value as ReportKind)}
          >
            <option value="aging">Open Receivables Aging</option>
            <option value="sales">Sales Analysis</option>
            <option value="wages">Worker Wages</option>
          </select>
          {kind !== "aging" && (
            <>
              <input
                className="input date"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
              <span className="muted">to</span>
              <input
                className="input date"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </>
          )}
          {kind === "wages" && (
            <input
              className="input"
              style={{ width: 100 }}
              placeholder="Worker #"
              value={empNo}
              onChange={(e) => setEmpNo(e.target.value)}
            />
          )}
          <button className="btn btn-primary" onClick={run}>
            Run Report
          </button>
        </div>

        {loading && <Loading />}

        {!loading && kind === "aging" && aging.length > 0 && (
          <>
            <div className="section-title">Open Receivable Aging</div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Co#</th>
                    <th>Company</th>
                    <th>Phone</th>
                    <th className="num">Current</th>
                    <th className="num">&gt;30</th>
                    <th className="num">&gt;60</th>
                    <th className="num">&gt;90</th>
                    <th className="num">&gt;120</th>
                    <th className="num">Open Bal</th>
                  </tr>
                </thead>
                <tbody>
                  {aging.map((r) => (
                    <tr key={r.companyNo}>
                      <td>{r.companyNo}</td>
                      <td>{r.companyName}</td>
                      <td>{r.phone}</td>
                      <td className="num">{money(r.current)}</td>
                      <td className="num">{money(r.days30)}</td>
                      <td className="num">{money(r.days60)}</td>
                      <td className="num">{money(r.days90)}</td>
                      <td className="num">{money(r.days120)}</td>
                      <td className="num">{money(r.openBal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}>
                      <strong>Grand Total</strong>
                    </td>
                    <td className="num">
                      <strong>
                        {money(aging.reduce((s, r) => s + r.current, 0))}
                      </strong>
                    </td>
                    <td className="num">
                      <strong>
                        {money(aging.reduce((s, r) => s + r.days30, 0))}
                      </strong>
                    </td>
                    <td className="num">
                      <strong>
                        {money(aging.reduce((s, r) => s + r.days60, 0))}
                      </strong>
                    </td>
                    <td className="num">
                      <strong>
                        {money(aging.reduce((s, r) => s + r.days90, 0))}
                      </strong>
                    </td>
                    <td className="num">
                      <strong>
                        {money(aging.reduce((s, r) => s + r.days120, 0))}
                      </strong>
                    </td>
                    <td className="num">
                      <strong>
                        {money(aging.reduce((s, r) => s + r.openBal, 0))}
                      </strong>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}

        {!loading && kind === "sales" && sales.length > 0 && (
          <>
            <div className="section-title">Sales Analysis</div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Inv#</th>
                    <th>Co#</th>
                    <th>Pro#</th>
                    <th className="num">Sales</th>
                    <th className="num">Deposit</th>
                    <th className="num">Pay Total</th>
                    <th className="num">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((r) => (
                    <tr key={`${r.invoice}-${r.salesDate}`}>
                      <td>{fmtDate(r.salesDate)}</td>
                      <td>{r.invoice}</td>
                      <td>{r.companyNo}</td>
                      <td>{r.proNo}</td>
                      <td className="num">{money(r.salesAmount)}</td>
                      <td className="num">{money(r.deposit)}</td>
                      <td className="num">{money(r.payTotal)}</td>
                      <td className="num">{money(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4}>
                      <strong>Total ({sales.length})</strong>
                    </td>
                    <td className="num">
                      <strong>
                        {money(sales.reduce((s, r) => s + r.salesAmount, 0))}
                      </strong>
                    </td>
                    <td className="num">
                      <strong>
                        {money(sales.reduce((s, r) => s + r.deposit, 0))}
                      </strong>
                    </td>
                    <td className="num">
                      <strong>
                        {money(sales.reduce((s, r) => s + r.payTotal, 0))}
                      </strong>
                    </td>
                    <td className="num">
                      <strong>
                        {money(sales.reduce((s, r) => s + r.balance, 0))}
                      </strong>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}

        {!loading && kind === "wages" && wages.length > 0 && (
          <>
            <div className="section-title">Worker Wages</div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Worker</th>
                    <th>Work Date</th>
                    <th>Inv#</th>
                    <th>Co/Pro</th>
                    <th>Description</th>
                    <th className="num">Inv Amt</th>
                    <th className="num">Rate%</th>
                    <th className="num">Wages</th>
                  </tr>
                </thead>
                <tbody>
                  {wages.map((r, i) => (
                    <tr key={i}>
                      <td>
                        {r.empNo} {r.empName}
                      </td>
                      <td>{fmtDate(r.workDate || r.invDate)}</td>
                      <td>{r.invoice}</td>
                      <td>
                        {r.companyNo}/{r.proNo}
                      </td>
                      <td>{r.description}</td>
                      <td className="num">{money(r.invAmount)}</td>
                      <td className="num">{r.rate.toFixed(1)}</td>
                      <td className="num">{money(r.wages)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={7}>
                      <strong>Total Wages</strong>
                    </td>
                    <td className="num">
                      <strong>
                        {money(wages.reduce((s, r) => s + r.wages, 0))}
                      </strong>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
