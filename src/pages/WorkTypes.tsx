import { useCallback, useEffect, useState } from "react";
import { api, WorkType, emptyWorkType, money } from "../api";
import { Empty, Field, Loading, Modal } from "../components/ui";

const WT_LABELS: Record<string, string> = {
  P: "Paint",
  C: "Clean",
  S: "Shampoo",
  F: "Floor",
  O: "Other",
};

export function WorkTypes() {
  const [rows, setRows] = useState<WorkType[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<WorkType | null>(null);
  const [isNew, setIsNew] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.listWorkTypes({ search }));
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
    if (!editing?.codeNo) {
      setError("Code is required");
      return;
    }
    try {
      await api.saveWorkType(editing);
      setEditing(null);
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <>
      <div className="page-header">
        <h2>Job Codes / Work Types</h2>
        <div className="actions">
          <button
            className="btn btn-primary"
            onClick={() => {
              setIsNew(true);
              setEditing(emptyWorkType());
            }}
          >
            + Add Code
          </button>
        </div>
      </div>
      <div className="page-body">
        {error && <div className="alert error">{error}</div>}
        <div className="toolbar">
          <input
            className="input search"
            placeholder="Search codes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty title="No work types" />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Description</th>
                  <th>Type</th>
                  <th className="num">Price</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((w) => (
                  <tr
                    key={w.codeNo}
                    onClick={() => {
                      setIsNew(false);
                      setEditing(w);
                    }}
                  >
                    <td>{w.codeNo}</td>
                    <td>{w.description}</td>
                    <td>{WT_LABELS[w.workType] || w.workType}</td>
                    <td className="num">{money(w.price)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={async () => {
                          if (confirm(`Void code ${w.codeNo}?`)) {
                            await api.deleteWorkType(w.codeNo);
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
          title={isNew ? "New Job Code" : `Edit ${editing.codeNo}`}
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
            <Field label="Code">
              <input
                className="input"
                value={editing.codeNo}
                disabled={!isNew}
                onChange={(e) =>
                  setEditing({ ...editing, codeNo: e.target.value.toUpperCase() })
                }
              />
            </Field>
            <Field label="Work Type">
              <select
                className="select"
                value={editing.workType}
                onChange={(e) =>
                  setEditing({ ...editing, workType: e.target.value })
                }
              >
                {Object.entries(WT_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
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
            <Field label="Default Price">
              <input
                className="input"
                type="number"
                step="0.01"
                value={editing.price}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    price: parseFloat(e.target.value) || 0,
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
