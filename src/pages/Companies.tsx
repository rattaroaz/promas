import { useCallback, useEffect, useState } from "react";
import {
  api,
  Company,
  emptyCompany,
} from "../api";
import { Empty, Field, Loading, Modal } from "../components/ui";

export function Companies() {
  const [rows, setRows] = useState<Company[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Company | null>(null);
  const [isNew, setIsNew] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listCompanies({ search, includeVoided: false });
      setRows(data);
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
    if (!editing) return;
    if (!editing.companyNo.trim() || !editing.name.trim()) {
      setError("Company No and Name are required");
      return;
    }
    try {
      await api.saveCompany(editing);
      setEditing(null);
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function remove(c: Company) {
    if (!confirm(`Void company ${c.companyNo} — ${c.name}?`)) return;
    await api.deleteCompany(c.companyNo);
    await load();
  }

  return (
    <>
      <div className="page-header">
        <h2>Companies</h2>
        <div className="actions">
          <button
            className="btn btn-primary"
            onClick={() => {
              setIsNew(true);
              setEditing(emptyCompany());
            }}
          >
            + Add Company
          </button>
        </div>
      </div>
      <div className="page-body">
        {error && <div className="alert error">{error}</div>}
        <div className="toolbar">
          <input
            className="input search"
            placeholder="Search by #, name, phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="spacer" />
          <span className="muted">{rows.length} companies</span>
        </div>
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty title="No companies" hint="Add a company or import PROMAS data." />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Name</th>
                  <th>City</th>
                  <th>Phone</th>
                  <th>Contact</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr
                    key={c.companyNo}
                    onClick={() => {
                      setIsNew(false);
                      setEditing(c);
                    }}
                  >
                    <td>{c.companyNo}</td>
                    <td>{c.name}</td>
                    <td>
                      {c.city}
                      {c.state ? `, ${c.state}` : ""}
                    </td>
                    <td>{c.phone}</td>
                    <td>{c.contact}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-sm btn-danger" onClick={() => remove(c)}>
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
          title={isNew ? "New Company" : `Edit Company ${editing.companyNo}`}
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
            <Field label="Company No">
              <input
                className="input"
                value={editing.companyNo}
                disabled={!isNew}
                onChange={(e) =>
                  setEditing({ ...editing, companyNo: e.target.value })
                }
              />
            </Field>
            <Field label="Class">
              <input
                className="input"
                value={editing.class}
                onChange={(e) => setEditing({ ...editing, class: e.target.value })}
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
            <Field label="Zip">
              <input
                className="input"
                value={editing.zip}
                onChange={(e) => setEditing({ ...editing, zip: e.target.value })}
              />
            </Field>
            <Field label="Phone">
              <input
                className="input"
                value={editing.phone}
                onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
              />
            </Field>
            <Field label="Phone 2">
              <input
                className="input"
                value={editing.phone2}
                onChange={(e) => setEditing({ ...editing, phone2: e.target.value })}
              />
            </Field>
            <Field label="Fax">
              <input
                className="input"
                value={editing.phone4}
                onChange={(e) => setEditing({ ...editing, phone4: e.target.value })}
              />
            </Field>
            <Field label="Contact" className="full">
              <input
                className="input"
                value={editing.contact}
                onChange={(e) => setEditing({ ...editing, contact: e.target.value })}
              />
            </Field>
            <Field label="Memo" className="full">
              <textarea
                className="textarea"
                value={editing.memo}
                onChange={(e) => setEditing({ ...editing, memo: e.target.value })}
              />
            </Field>
          </div>
        </Modal>
      )}
    </>
  );
}
