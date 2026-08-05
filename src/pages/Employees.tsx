import { useCallback, useEffect, useState } from "react";
import { api, Employee, emptyEmployee } from "../api";
import { Empty, Field, Loading, Modal } from "../components/ui";

export function Employees() {
  const [rows, setRows] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Employee | null>(null);
  const [isNew, setIsNew] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.listEmployees({ search }));
      setError("");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  async function save() {
    if (!editing?.empNo || !editing.name) {
      setError("Worker No and Name are required");
      return;
    }
    try {
      await api.saveEmployee(editing);
      setEditing(null);
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <>
      <div className="page-header">
        <h2>Workers</h2>
        <div className="actions">
          <button
            className="btn btn-primary"
            onClick={() => {
              setIsNew(true);
              setEditing(emptyEmployee());
            }}
          >
            + Add Worker
          </button>
        </div>
      </div>
      <div className="page-body">
        {error && <div className="alert error">{error}</div>}
        <div className="toolbar">
          <input
            className="input search"
            placeholder="Search workers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty title="No workers" />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th className="num">Wage Rate %</th>
                  <th>SSN</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr
                    key={e.empNo}
                    onClick={() => {
                      setIsNew(false);
                      setEditing(e);
                    }}
                  >
                    <td>{e.empNo}</td>
                    <td>{e.name}</td>
                    <td>{e.phone}</td>
                    <td className="num">{e.commission.toFixed(2)}</td>
                    <td>{e.ssno}</td>
                    <td onClick={(ev) => ev.stopPropagation()}>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={async () => {
                          if (confirm(`Void worker ${e.name}?`)) {
                            await api.deleteEmployee(e.empNo);
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
          title={isNew ? "New Worker" : `Edit Worker ${editing.empNo}`}
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
            <Field label="Worker No">
              <input
                className="input"
                value={editing.empNo}
                disabled={!isNew}
                onChange={(e) => setEditing({ ...editing, empNo: e.target.value })}
              />
            </Field>
            <Field label="Wage Rate %">
              <input
                className="input"
                type="number"
                step="0.01"
                value={editing.commission}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    commission: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </Field>
            <Field label="Name" className="full">
              <input
                className="input"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </Field>
            <Field label="Street" className="full">
              <input
                className="input"
                value={editing.street}
                onChange={(e) => setEditing({ ...editing, street: e.target.value })}
              />
            </Field>
            <Field label="City">
              <input
                className="input"
                value={editing.city}
                onChange={(e) => setEditing({ ...editing, city: e.target.value })}
              />
            </Field>
            <Field label="State">
              <input
                className="input"
                value={editing.state}
                onChange={(e) => setEditing({ ...editing, state: e.target.value })}
              />
            </Field>
            <Field label="Phone">
              <input
                className="input"
                value={editing.phone}
                onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
              />
            </Field>
            <Field label="Contact">
              <input
                className="input"
                value={editing.contact}
                onChange={(e) =>
                  setEditing({ ...editing, contact: e.target.value })
                }
              />
            </Field>
            <Field label="SSN">
              <input
                className="input"
                value={editing.ssno}
                onChange={(e) => setEditing({ ...editing, ssno: e.target.value })}
              />
            </Field>
            <Field label="Birth Date">
              <input
                className="input"
                type="date"
                value={editing.birthDate || ""}
                onChange={(e) =>
                  setEditing({ ...editing, birthDate: e.target.value || null })
                }
              />
            </Field>
          </div>
        </Modal>
      )}
    </>
  );
}
