import { useCallback, useEffect, useState } from "react";
import {
  api,
  Material,
  Employee,
  emptyMaterial,
  money,
  fmtDate,
} from "../api";
import { Empty, Field, Loading, Modal } from "../components/ui";

export function Materials() {
  const [rows, setRows] = useState<Material[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Material | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, emps] = await Promise.all([
        api.listMaterials({
          search,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        }),
        api.listEmployees({}),
      ]);
      setRows(data);
      setEmployees(emps);
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

  async function save() {
    if (!editing?.empNo || !editing.matDate) {
      setError("Worker and date are required");
      return;
    }
    try {
      await api.saveMaterial(editing);
      setEditing(null);
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  const total = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <>
      <div className="page-header">
        <h2>Materials</h2>
        <div className="actions">
          <button
            className="btn btn-primary"
            onClick={() => setEditing(emptyMaterial())}
          >
            + Add Material
          </button>
        </div>
      </div>
      <div className="page-body">
        {error && <div className="alert error">{error}</div>}
        <div className="toolbar">
          <input
            className="input search"
            placeholder="Search worker, description…"
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
          <Empty title="No material transactions" />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Worker</th>
                  <th>Description</th>
                  <th className="num">Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} onClick={() => setEditing(m)}>
                    <td>{fmtDate(m.matDate)}</td>
                    <td>
                      {m.empNo} {m.empName && `— ${m.empName}`}
                    </td>
                    <td>{m.description}</td>
                    <td className="num">{money(m.amount)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={async () => {
                          if (m.id && confirm("Void this material entry?")) {
                            await api.deleteMaterial(m.id);
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
          title={editing.id ? "Edit Material" : "New Material"}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={save}>
                Save
              </button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="Worker">
              <select
                className="select"
                value={editing.empNo}
                onChange={(e) =>
                  setEditing({ ...editing, empNo: e.target.value })
                }
              >
                <option value="">Select…</option>
                {employees.map((e) => (
                  <option key={e.empNo} value={e.empNo}>
                    {e.empNo} — {e.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date">
              <input
                className="input"
                type="date"
                value={editing.matDate}
                onChange={(e) =>
                  setEditing({ ...editing, matDate: e.target.value })
                }
              />
            </Field>
            <Field label="Description" className="full">
              <input
                className="input"
                value={editing.description}
                onChange={(e) =>
                  setEditing({ ...editing, description: e.target.value })
                }
              />
            </Field>
            <Field label="Amount">
              <input
                className="input"
                type="number"
                step="0.01"
                value={editing.amount}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    amount: parseFloat(e.target.value) || 0,
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
