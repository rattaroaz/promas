import { useCallback, useEffect, useState } from "react";
import {
  api,
  CashReceipt,
  emptyCashReceipt,
  money,
  fmtDate,
  Invoice,
} from "../api";
import { Empty, Field, Loading, Modal } from "../components/ui";

export function CashReceipts() {
  const [rows, setRows] = useState<CashReceipt[]>([]);
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<CashReceipt | null>(null);
  const [openInvoices, setOpenInvoices] = useState<Invoice[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(
        await api.listCashReceipts({
          search,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
          limit: 300,
        })
      );
      setError("");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [search, fromDate, toDate]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  async function openNew() {
    const invs = await api.listInvoices({ limit: 500 });
    setOpenInvoices(invs.filter((i) => !i.voided && i.balance > 0));
    setEditing(emptyCashReceipt());
  }

  function selectInvoice(invNo: number) {
    if (!editing) return;
    const inv = openInvoices.find((i) => i.invoice === invNo);
    if (!inv) {
      setEditing({ ...editing, invoice: invNo });
      return;
    }
    setEditing({
      ...editing,
      invoice: inv.invoice,
      companyNo: inv.companyNo,
      salesDate: inv.salesDate,
      payment: inv.balance,
    });
  }

  async function save() {
    if (!editing) return;
    if (!editing.companyNo || !editing.invoice || !editing.payment) {
      setError("Company, invoice, and payment amount are required");
      return;
    }
    try {
      await api.saveCashReceipt(editing);
      setEditing(null);
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  const total = rows.reduce((s, r) => s + r.payment, 0);

  return (
    <>
      <div className="page-header">
        <h2>Cash Receipts</h2>
        <div className="actions">
          <button className="btn btn-primary" onClick={openNew}>
            + Record Payment
          </button>
        </div>
      </div>
      <div className="page-body">
        {error && <div className="alert error">{error}</div>}
        <div className="toolbar">
          <input
            className="input search"
            placeholder="Search invoice, ref, company…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
          <span className="spacer" />
          <span className="muted">Total: {money(total)}</span>
        </div>
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty title="No cash receipts" />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Pay Date</th>
                  <th>Inv#</th>
                  <th>Company</th>
                  <th>Check / Ref</th>
                  <th className="num">Payment</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{fmtDate(r.payDate)}</td>
                    <td>{r.invoice}</td>
                    <td>
                      {r.companyName || r.companyNo}
                      <div className="muted" style={{ fontSize: "0.75rem" }}>
                        {r.companyNo}
                      </div>
                    </td>
                    <td>{r.payRefNo}</td>
                    <td className="num">{money(r.payment)}</td>
                    <td>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={async () => {
                          if (r.id && confirm("Void this receipt?")) {
                            await api.deleteCashReceipt(r.id);
                            await load();
                          }
                        }}
                      >
                        Void
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <Modal
          title="Record Payment"
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={save}>
                Post Receipt
              </button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="Open Invoice" className="full">
              <select
                className="select"
                value={editing.invoice || ""}
                onChange={(e) => selectInvoice(parseInt(e.target.value, 10) || 0)}
              >
                <option value="">Select open invoice…</option>
                {openInvoices.map((i) => (
                  <option key={`${i.companyNo}-${i.invoice}`} value={i.invoice}>
                    #{i.invoice} — {i.companyName || i.companyNo} — bal{" "}
                    {money(i.balance)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Company No">
              <input
                className="input"
                value={editing.companyNo}
                onChange={(e) =>
                  setEditing({ ...editing, companyNo: e.target.value })
                }
              />
            </Field>
            <Field label="Invoice #">
              <input
                className="input"
                type="number"
                value={editing.invoice || ""}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    invoice: parseInt(e.target.value, 10) || 0,
                  })
                }
              />
            </Field>
            <Field label="Invoice Date">
              <input
                className="input"
                type="date"
                value={editing.salesDate}
                onChange={(e) =>
                  setEditing({ ...editing, salesDate: e.target.value })
                }
              />
            </Field>
            <Field label="Pay Date">
              <input
                className="input"
                type="date"
                value={editing.payDate}
                onChange={(e) =>
                  setEditing({ ...editing, payDate: e.target.value })
                }
              />
            </Field>
            <Field label="Check / Ref No">
              <input
                className="input"
                value={editing.payRefNo}
                onChange={(e) =>
                  setEditing({ ...editing, payRefNo: e.target.value })
                }
              />
            </Field>
            <Field label="Amount Paid">
              <input
                className="input"
                type="number"
                step="0.01"
                value={editing.payment}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    payment: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </Field>
          </div>
        </Modal>
      )}
    </>
  );
}
