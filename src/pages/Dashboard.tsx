import { useEffect, useState } from "react";
import { api, DashboardStats, money, fmtDate } from "../api";
import { Loading, StatusBadge } from "../components/ui";

export function Dashboard({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getDashboard()
      .then(setStats)
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="alert error">{error}</div>;
  if (!stats) return <Loading />;

  return (
    <>
      <div className="page-header">
        <h2>Dashboard</h2>
      </div>
      <div className="page-body">
        <div className="stats">
          <div className="stat-card">
            <div className="label">Companies</div>
            <div className="value">{stats.companyCount.toLocaleString()}</div>
          </div>
          <div className="stat-card">
            <div className="label">Properties</div>
            <div className="value">{stats.propertyCount.toLocaleString()}</div>
          </div>
          <div className="stat-card">
            <div className="label">Workers</div>
            <div className="value">{stats.employeeCount.toLocaleString()}</div>
          </div>
          <div className="stat-card">
            <div className="label">Invoices</div>
            <div className="value">{stats.invoiceCount.toLocaleString()}</div>
          </div>
          <div className="stat-card">
            <div className="label">Total Sales</div>
            <div className="value money">{money(stats.totalSales)}</div>
          </div>
          <div className="stat-card">
            <div className="label">Payments Received</div>
            <div className="value money">{money(stats.totalPayments)}</div>
          </div>
          <div className="stat-card">
            <div className="label">Open Receivables</div>
            <div className="value warning">{money(stats.openBalance)}</div>
          </div>
        </div>

        <div className="section-title">Recent Invoices</div>
        {stats.recentInvoices.length === 0 ? (
          <div className="alert info">
            No invoices yet. Import legacy PROMAS data from Settings, or create a
            new invoice.
            <div style={{ marginTop: "0.75rem" }}>
              <button className="btn btn-primary" onClick={() => onNavigate("settings")}>
                Import Data
              </button>
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Company</th>
                  <th>Unit</th>
                  <th className="num">Total</th>
                  <th className="num">Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentInvoices.map((inv) => (
                  <tr
                    key={`${inv.companyNo}-${inv.invoice}-${inv.salesDate}`}
                    onClick={() => onNavigate("invoices")}
                  >
                    <td>{inv.invoice}</td>
                    <td>{fmtDate(inv.salesDate)}</td>
                    <td>
                      {inv.companyName || inv.companyNo}
                      <div className="muted" style={{ fontSize: "0.8rem" }}>
                        {inv.propertyName}
                      </div>
                    </td>
                    <td>
                      {inv.salesUnit} {inv.salesSize && `/ ${inv.salesSize}`}
                    </td>
                    <td className="num">{money(inv.salesTotal)}</td>
                    <td className="num">{money(inv.balance)}</td>
                    <td>
                      <StatusBadge voided={inv.voided} balance={inv.balance} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
