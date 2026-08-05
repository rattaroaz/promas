import { useCallback, useEffect, useState } from "react";
import {
  api,
  WorkOrder,
  WorkOrderWithLines,
  Company,
  Property,
  WorkType,
  emptyWorkOrder,
  money,
  fmtDate,
} from "../api";
import { Empty, Field, Loading, Modal, StatusBadge } from "../components/ui";

export function WorkOrders() {
  const [rows, setRows] = useState<WorkOrder[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<WorkOrderWithLines | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.listWorkOrders({ search, limit: 300 }));
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

  async function openNew() {
    const [cos, wts] = await Promise.all([
      api.listCompanies({ limit: 2000 }),
      api.listWorkTypes({}),
    ]);
    setCompanies(cos);
    setWorkTypes(wts);
    setProperties([]);
    const order = emptyWorkOrder();
    setEditing({
      order,
      lines: [
        {
          companyNo: "",
          proNo: "",
          orderDate: order.orderDate,
          orderNo: 0,
          lineNo: 1,
          codeNo: "*",
          description: "",
          workType: "P",
          price: 0,
        },
      ],
    });
  }

  async function onCompanyChange(companyNo: string) {
    if (!editing) return;
    const props = await api.listProperties({ companyNo, limit: 500 });
    setProperties(props);
    setEditing({
      ...editing,
      order: {
        ...editing.order,
        companyNo,
        proNo: props[0]?.proNo || "",
      },
    });
  }

  async function save() {
    if (!editing) return;
    if (!editing.order.companyNo || !editing.order.proNo) {
      setError("Company and property are required");
      return;
    }
    try {
      const no = await api.saveWorkOrder({
        order: editing.order,
        lines: editing.lines.map((l, i) => ({
          ...l,
          companyNo: editing.order.companyNo,
          proNo: editing.order.proNo,
          orderDate: editing.order.orderDate,
          lineNo: i + 1,
        })),
      });
      setEditing(null);
      alert(`Work order #${no} saved`);
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <>
      <div className="page-header">
        <h2>Work Orders</h2>
        <div className="actions">
          <button className="btn btn-primary" onClick={openNew}>
            + New Work Order
          </button>
        </div>
      </div>
      <div className="page-body">
        {error && <div className="alert error">{error}</div>}
        <div className="toolbar">
          <input
            className="input search"
            placeholder="Search order #, unit, company…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty
            title="No work orders"
            hint="The legacy backup had empty order tables. Create new work orders here."
          />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Order#</th>
                  <th>Date</th>
                  <th>Company</th>
                  <th>Property</th>
                  <th>Unit</th>
                  <th>Ordered By</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((w) => (
                  <tr
                    key={`${w.companyNo}-${w.orderNo}-${w.orderDate}`}
                    className={w.voided ? "voided" : ""}
                  >
                    <td>{w.orderNo}</td>
                    <td>{fmtDate(w.orderDate)}</td>
                    <td>{w.companyName || w.companyNo}</td>
                    <td>{w.propertyName || w.proNo}</td>
                    <td>
                      {w.orderUnit}
                      {w.orderSize ? ` / ${w.orderSize}` : ""}
                    </td>
                    <td>{w.orderBy || w.orderMan}</td>
                    <td>
                      <StatusBadge voided={w.voided} />
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
          title="New Work Order"
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
                value={editing.order.companyNo}
                onChange={(e) => onCompanyChange(e.target.value)}
              >
                <option value="">Select…</option>
                {companies.map((c) => (
                  <option key={c.companyNo} value={c.companyNo}>
                    {c.companyNo} — {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Property">
              <select
                className="select"
                value={editing.order.proNo}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    order: { ...editing.order, proNo: e.target.value },
                  })
                }
              >
                <option value="">Select…</option>
                {properties.map((p) => (
                  <option key={p.proNo} value={p.proNo}>
                    {p.proNo} — {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Order Date">
              <input
                className="input"
                type="date"
                value={editing.order.orderDate}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    order: { ...editing.order, orderDate: e.target.value },
                  })
                }
              />
            </Field>
            <Field label="Service Date">
              <input
                className="input"
                type="date"
                value={editing.order.workDate || ""}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    order: {
                      ...editing.order,
                      workDate: e.target.value || null,
                    },
                  })
                }
              />
            </Field>
            <Field label="Unit #">
              <input
                className="input"
                value={editing.order.orderUnit}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    order: { ...editing.order, orderUnit: e.target.value },
                  })
                }
              />
            </Field>
            <Field label="Size">
              <input
                className="input"
                value={editing.order.orderSize}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    order: { ...editing.order, orderSize: e.target.value },
                  })
                }
              />
            </Field>
            <Field label="Order Person">
              <input
                className="input"
                value={editing.order.orderMan}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    order: { ...editing.order, orderMan: e.target.value },
                  })
                }
              />
            </Field>
            <Field label="Order By">
              <input
                className="input"
                value={editing.order.orderBy}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    order: { ...editing.order, orderBy: e.target.value },
                  })
                }
              />
            </Field>
            <Field label="Customer PO">
              <input
                className="input"
                value={editing.order.custPoNo}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    order: { ...editing.order, custPoNo: e.target.value },
                  })
                }
              />
            </Field>
          </div>
          <div className="lines-editor">
            <div className="section-title">
              Line Items —{" "}
              {money(editing.lines.reduce((s, l) => s + l.price, 0))}
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th style={{ width: 80 }}>Code</th>
                    <th>Description</th>
                    <th style={{ width: 90 }}>W/T</th>
                    <th style={{ width: 100 }} className="num">
                      Price
                    </th>
                    <th style={{ width: 50 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {editing.lines.map((line, idx) => (
                    <tr key={idx}>
                      <td>
                        <select
                          className="select"
                          value={line.codeNo}
                          onChange={(e) => {
                            const code = e.target.value;
                            const wt = workTypes.find((w) => w.codeNo === code);
                            const lines = [...editing.lines];
                            lines[idx] = {
                              ...line,
                              codeNo: code,
                              description: wt?.description || line.description,
                              workType: wt?.workType || line.workType,
                              price: wt?.price || line.price,
                            };
                            setEditing({ ...editing, lines });
                          }}
                        >
                          <option value="*">*</option>
                          {workTypes.map((w) => (
                            <option key={w.codeNo} value={w.codeNo}>
                              {w.codeNo}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          className="input"
                          value={line.description}
                          onChange={(e) => {
                            const lines = [...editing.lines];
                            lines[idx] = {
                              ...line,
                              description: e.target.value,
                            };
                            setEditing({ ...editing, lines });
                          }}
                        />
                      </td>
                      <td>
                        <select
                          className="select"
                          value={line.workType}
                          onChange={(e) => {
                            const lines = [...editing.lines];
                            lines[idx] = { ...line, workType: e.target.value };
                            setEditing({ ...editing, lines });
                          }}
                        >
                          <option value="P">Paint</option>
                          <option value="C">Clean</option>
                          <option value="F">Floor</option>
                          <option value="O">Other</option>
                        </select>
                      </td>
                      <td>
                        <input
                          className="input"
                          type="number"
                          step="0.01"
                          value={line.price}
                          onChange={(e) => {
                            const lines = [...editing.lines];
                            lines[idx] = {
                              ...line,
                              price: parseFloat(e.target.value) || 0,
                            };
                            setEditing({ ...editing, lines });
                          }}
                        />
                      </td>
                      <td>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() =>
                            setEditing({
                              ...editing,
                              lines: editing.lines.filter((_, i) => i !== idx),
                            })
                          }
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              className="btn"
              style={{ marginTop: "0.5rem" }}
              onClick={() =>
                setEditing({
                  ...editing,
                  lines: [
                    ...editing.lines,
                    {
                      companyNo: editing.order.companyNo,
                      proNo: editing.order.proNo,
                      orderDate: editing.order.orderDate,
                      orderNo: 0,
                      lineNo: editing.lines.length + 1,
                      codeNo: "*",
                      description: "",
                      workType: "P",
                      price: 0,
                    },
                  ],
                })
              }
            >
              + Add Line
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
