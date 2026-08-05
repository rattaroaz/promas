import { useCallback, useEffect, useState } from "react";
import {
  api,
  Invoice,
  InvoiceLine,
  InvoiceWithLines,
  Company,
  Property,
  Employee,
  WorkType,
  emptyInvoice,
  emptyInvoiceLine,
  money,
  fmtDate,
} from "../api";
import { Empty, Field, Loading, Modal, StatusBadge } from "../components/ui";

export function Invoices() {
  const [rows, setRows] = useState<Invoice[]>([]);
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<InvoiceWithLines | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listInvoices({
        search,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        limit: 300,
      });
      setRows(data);
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
    const [cos, emps, wts] = await Promise.all([
      api.listCompanies({ limit: 2000 }),
      api.listEmployees({}),
      api.listWorkTypes({}),
    ]);
    setCompanies(cos);
    setEmployees(emps);
    setWorkTypes(wts);
    setProperties([]);
    const inv = emptyInvoice();
    setEditing({ invoice: inv, lines: [emptyInvoiceLine(inv, 1)] });
  }

  async function openEdit(inv: Invoice) {
    const [full, cos, emps, wts, props] = await Promise.all([
      api.getInvoice(inv.companyNo, inv.proNo, inv.salesDate, inv.invoice),
      api.listCompanies({ limit: 2000 }),
      api.listEmployees({}),
      api.listWorkTypes({}),
      api.listProperties({ companyNo: inv.companyNo, limit: 500 }),
    ]);
    setCompanies(cos);
    setEmployees(emps);
    setWorkTypes(wts);
    setProperties(props);
    if (full) setEditing(full);
  }

  async function onCompanyChange(companyNo: string) {
    if (!editing) return;
    const props = await api.listProperties({ companyNo, limit: 500 });
    setProperties(props);
    setEditing({
      ...editing,
      invoice: {
        ...editing.invoice,
        companyNo,
        proNo: props[0]?.proNo || "",
      },
      lines: editing.lines.map((l) => ({ ...l, companyNo })),
    });
  }

  function updateLine(idx: number, patch: Partial<InvoiceLine>) {
    if (!editing) return;
    const lines = editing.lines.map((l, i) =>
      i === idx ? { ...l, ...patch } : l
    );
    // auto emp price from commission
    if (patch.price !== undefined || patch.commission !== undefined) {
      const l = lines[idx];
      lines[idx] = {
        ...l,
        empPrice: (l.price * l.commission) / 100,
      };
    }
    if (patch.codeNo) {
      const wt = workTypes.find((w) => w.codeNo === patch.codeNo);
      if (wt) {
        lines[idx] = {
          ...lines[idx],
          description: lines[idx].description || wt.description,
          workType: wt.workType || lines[idx].workType,
          price: lines[idx].price || wt.price,
          empPrice:
            ((lines[idx].price || wt.price) * lines[idx].commission) / 100,
        };
      }
    }
    setEditing({ ...editing, lines });
  }

  async function save() {
    if (!editing) return;
    const inv = editing.invoice;
    if (!inv.companyNo || !inv.proNo || !inv.salesDate) {
      setError("Company, property, and date are required");
      return;
    }
    try {
      const no = await api.saveInvoice({
        invoice: inv,
        lines: editing.lines.map((l, i) => ({
          ...l,
          companyNo: inv.companyNo,
          proNo: inv.proNo,
          salesDate: inv.salesDate,
          lineNo: i + 1,
        })),
      });
      setEditing(null);
      setError("");
      alert(`Invoice #${no} saved`);
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function voidInv(inv: Invoice) {
    if (!confirm(`Void invoice #${inv.invoice}?`)) return;
    await api.voidInvoice(inv.companyNo, inv.proNo, inv.salesDate, inv.invoice);
    await load();
  }

  const lineTotal = editing?.lines.reduce((s, l) => s + (l.price || 0), 0) ?? 0;

  return (
    <>
      <div className="page-header">
        <h2>Invoices</h2>
        <div className="actions">
          <button className="btn btn-primary" onClick={openNew}>
            + New Invoice
          </button>
        </div>
      </div>
      <div className="page-body">
        {error && <div className="alert error">{error}</div>}
        <div className="toolbar">
          <input
            className="input search"
            placeholder="Search invoice #, company, unit, PO…"
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
          <span className="muted">{rows.length} invoices</span>
        </div>
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty title="No invoices found" />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Inv#</th>
                  <th>Date</th>
                  <th>Company</th>
                  <th>Property</th>
                  <th>Unit / Size</th>
                  <th className="num">Total</th>
                  <th className="num">Paid</th>
                  <th className="num">Balance</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((inv) => (
                  <tr
                    key={`${inv.companyNo}-${inv.invoice}-${inv.salesDate}`}
                    className={inv.voided ? "voided" : ""}
                    onClick={() => openEdit(inv)}
                  >
                    <td>{inv.invoice}</td>
                    <td>{fmtDate(inv.salesDate)}</td>
                    <td>
                      <div>{inv.companyName || inv.companyNo}</div>
                      <div className="muted" style={{ fontSize: "0.75rem" }}>
                        {inv.companyNo}
                      </div>
                    </td>
                    <td>
                      {inv.propertyName || inv.proNo}
                      <div className="muted" style={{ fontSize: "0.75rem" }}>
                        {inv.propertyStreet}
                      </div>
                    </td>
                    <td>
                      {inv.salesUnit}
                      {inv.salesSize ? ` / ${inv.salesSize}` : ""}
                    </td>
                    <td className="num">{money(inv.salesTotal)}</td>
                    <td className="num">{money(inv.payTotal)}</td>
                    <td className="num">{money(inv.balance)}</td>
                    <td>
                      <StatusBadge voided={inv.voided} balance={inv.balance} />
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {!inv.voided && (
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => voidInv(inv)}
                        >
                          Void
                        </button>
                      )}
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
          title={
            editing.invoice.invoice
              ? `Invoice #${editing.invoice.invoice}`
              : "New Invoice"
          }
          onClose={() => setEditing(null)}
          wide
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={save}>
                Save Invoice
              </button>
            </>
          }
        >
          <div className="form-grid cols-4">
            <Field label="Company">
              <select
                className="select"
                value={editing.invoice.companyNo}
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
                value={editing.invoice.proNo}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    invoice: { ...editing.invoice, proNo: e.target.value },
                    lines: editing.lines.map((l) => ({
                      ...l,
                      proNo: e.target.value,
                    })),
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
            <Field label="Invoice Date">
              <input
                className="input"
                type="date"
                value={editing.invoice.salesDate}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    invoice: { ...editing.invoice, salesDate: e.target.value },
                  })
                }
              />
            </Field>
            <Field label="Due Date">
              <input
                className="input"
                type="date"
                value={editing.invoice.salesDue || ""}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    invoice: {
                      ...editing.invoice,
                      salesDue: e.target.value || null,
                    },
                  })
                }
              />
            </Field>
            <Field label="Unit #">
              <input
                className="input"
                value={editing.invoice.salesUnit}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    invoice: { ...editing.invoice, salesUnit: e.target.value },
                  })
                }
              />
            </Field>
            <Field label="Size">
              <input
                className="input"
                value={editing.invoice.salesSize}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    invoice: { ...editing.invoice, salesSize: e.target.value },
                  })
                }
              />
            </Field>
            <Field label="Order By / Manager">
              <input
                className="input"
                value={editing.invoice.orderMan}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    invoice: { ...editing.invoice, orderMan: e.target.value },
                  })
                }
              />
            </Field>
            <Field label="Customer PO">
              <input
                className="input"
                value={editing.invoice.custPoNo}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    invoice: { ...editing.invoice, custPoNo: e.target.value },
                  })
                }
              />
            </Field>
            <Field label="Terms">
              <input
                className="input"
                value={editing.invoice.salesTerm}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    invoice: { ...editing.invoice, salesTerm: e.target.value },
                  })
                }
              />
            </Field>
            <Field label="Deposit">
              <input
                className="input"
                type="number"
                step="0.01"
                value={editing.invoice.salesPay}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    invoice: {
                      ...editing.invoice,
                      salesPay: parseFloat(e.target.value) || 0,
                    },
                  })
                }
              />
            </Field>
            <Field label="Remarks" className="full">
              <input
                className="input"
                value={editing.invoice.remark1}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    invoice: { ...editing.invoice, remark1: e.target.value },
                  })
                }
              />
            </Field>
          </div>

          <div className="lines-editor">
            <div className="section-title">Line Items — Total {money(lineTotal)}</div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th style={{ width: 80 }}>Code</th>
                    <th>Description</th>
                    <th style={{ width: 90 }}>W/T</th>
                    <th style={{ width: 120 }}>Work Date</th>
                    <th style={{ width: 100 }}>Worker</th>
                    <th style={{ width: 90 }} className="num">
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
                          onChange={(e) =>
                            updateLine(idx, { codeNo: e.target.value })
                          }
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
                          onChange={(e) =>
                            updateLine(idx, { description: e.target.value })
                          }
                        />
                      </td>
                      <td>
                        <select
                          className="select"
                          value={line.workType}
                          onChange={(e) =>
                            updateLine(idx, { workType: e.target.value })
                          }
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
                          type="date"
                          value={line.workDate || ""}
                          onChange={(e) =>
                            updateLine(idx, { workDate: e.target.value })
                          }
                        />
                      </td>
                      <td>
                        <select
                          className="select"
                          value={line.empNo}
                          onChange={(e) =>
                            updateLine(idx, { empNo: e.target.value })
                          }
                        >
                          <option value="">—</option>
                          {employees.map((e) => (
                            <option key={e.empNo} value={e.empNo}>
                              {e.empNo}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          className="input"
                          type="number"
                          step="0.01"
                          value={line.price}
                          onChange={(e) =>
                            updateLine(idx, {
                              price: parseFloat(e.target.value) || 0,
                            })
                          }
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
                    emptyInvoiceLine(
                      editing.invoice,
                      editing.lines.length + 1
                    ),
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
