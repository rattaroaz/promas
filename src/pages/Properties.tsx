import { useCallback, useEffect, useState } from "react";
import { api, Property, emptyProperty, Company } from "../api";
import { Empty, Field, Loading, Modal } from "../components/ui";

export function Properties() {
  const [rows, setRows] = useState<Property[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Property | null>(null);
  const [isNew, setIsNew] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, cos] = await Promise.all([
        api.listProperties({
          search,
          companyNo: companyFilter || undefined,
          limit: 1000,
        }),
        api.listCompanies({ limit: 2000 }),
      ]);
      setRows(data);
      setCompanies(cos);
      setError("");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [search, companyFilter]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  async function save() {
    if (!editing) return;
    if (!editing.companyNo || !editing.proNo || !editing.name) {
      setError("Company, Property No, and Name are required");
      return;
    }
    try {
      await api.saveProperty(editing);
      setEditing(null);
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function remove(p: Property) {
    if (!confirm(`Void property ${p.proNo} — ${p.name}?`)) return;
    await api.deleteProperty(p.companyNo, p.proNo);
    await load();
  }

  return (
    <>
      <div className="page-header">
        <h2>Properties</h2>
        <div className="actions">
          <button
            className="btn btn-primary"
            onClick={() => {
              setIsNew(true);
              setEditing(emptyProperty(companyFilter));
            }}
          >
            + Add Property
          </button>
        </div>
      </div>
      <div className="page-body">
        {error && <div className="alert error">{error}</div>}
        <div className="toolbar">
          <select
            className="select"
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
          >
            <option value="">All companies</option>
            {companies.map((c) => (
              <option key={c.companyNo} value={c.companyNo}>
                {c.companyNo} — {c.name}
              </option>
            ))}
          </select>
          <input
            className="input search"
            placeholder="Search name, street, phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="spacer" />
          <span className="muted">{rows.length} properties</span>
        </div>
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty title="No properties" />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Co#</th>
                  <th>Pro#</th>
                  <th>Name</th>
                  <th>Street</th>
                  <th>City</th>
                  <th>Phone</th>
                  <th>Manager</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr
                    key={`${p.companyNo}-${p.proNo}`}
                    onClick={() => {
                      setIsNew(false);
                      setEditing(p);
                    }}
                  >
                    <td>{p.companyNo}</td>
                    <td>{p.proNo}</td>
                    <td>{p.name}</td>
                    <td>{p.street}</td>
                    <td>
                      {p.city}
                      {p.state ? `, ${p.state}` : ""}
                    </td>
                    <td>{p.phone}</td>
                    <td>{p.manager || p.contact}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-sm btn-danger" onClick={() => remove(p)}>
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
          title={isNew ? "New Property" : `Edit Property ${editing.proNo}`}
          onClose={() => setEditing(null)}
          wide
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
          <div className="form-grid cols-3">
            <Field label="Company">
              <select
                className="select"
                value={editing.companyNo}
                disabled={!isNew}
                onChange={(e) =>
                  setEditing({ ...editing, companyNo: e.target.value })
                }
              >
                <option value="">Select…</option>
                {companies.map((c) => (
                  <option key={c.companyNo} value={c.companyNo}>
                    {c.companyNo} — {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Property No">
              <input
                className="input"
                value={editing.proNo}
                disabled={!isNew}
                onChange={(e) => setEditing({ ...editing, proNo: e.target.value })}
              />
            </Field>
            <Field label="Name">
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
            <Field label="Manager / Contact">
              <input
                className="input"
                value={editing.manager}
                onChange={(e) => setEditing({ ...editing, manager: e.target.value })}
              />
            </Field>
            <Field label="Key Info">
              <input
                className="input"
                value={editing.keyInfo}
                onChange={(e) => setEditing({ ...editing, keyInfo: e.target.value })}
              />
            </Field>
            <Field label="Paint / Time">
              <input
                className="input"
                value={editing.paintTime}
                onChange={(e) =>
                  setEditing({ ...editing, paintTime: e.target.value })
                }
              />
            </Field>
            <Field label="Page Map">
              <input
                className="input"
                value={editing.pageMap}
                onChange={(e) => setEditing({ ...editing, pageMap: e.target.value })}
              />
            </Field>
            <Field label="Comment 1" className="full">
              <input
                className="input"
                value={editing.comment1}
                onChange={(e) =>
                  setEditing({ ...editing, comment1: e.target.value })
                }
              />
            </Field>
            <Field label="Comment 2" className="full">
              <input
                className="input"
                value={editing.comment2}
                onChange={(e) =>
                  setEditing({ ...editing, comment2: e.target.value })
                }
              />
            </Field>
          </div>
        </Modal>
      )}
    </>
  );
}
