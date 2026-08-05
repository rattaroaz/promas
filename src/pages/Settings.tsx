import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api, SysData, ImportResult } from "../api";
import { Field, Loading } from "../components/ui";

export function Settings() {
  const [data, setData] = useState<SysData | null>(null);
  const [dbPath, setDbPath] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    Promise.all([api.getSysdata(), api.getDbPath()])
      .then(([s, p]) => {
        setData(s);
        setDbPath(p);
      })
      .catch((e) => setError(String(e)));
  }, []);

  async function save() {
    if (!data) return;
    try {
      await api.saveSysdata(data);
      setMsg("Settings saved.");
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }

  async function importData() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select PROMAS data folder (contains COMPANY.DBF, etc.)",
      });
      if (!selected || Array.isArray(selected)) return;

      if (
        !confirm(
          "This will REPLACE all current data with the imported DBF files. Continue?"
        )
      ) {
        return;
      }

      setImporting(true);
      setError("");
      setMsg("");
      setImportResult(null);
      const result = await api.importDbfFolder(selected);
      setImportResult(result);
      setMsg("Import completed successfully.");
      // refresh sysdata
      setData(await api.getSysdata());
    } catch (e) {
      setError(String(e));
    } finally {
      setImporting(false);
    }
  }

  if (!data) return <Loading />;

  return (
    <>
      <div className="page-header">
        <h2>Settings & Import</h2>
        <div className="actions">
          <button className="btn btn-primary" onClick={save}>
            Save Settings
          </button>
        </div>
      </div>
      <div className="page-body">
        {error && <div className="alert error">{error}</div>}
        {msg && <div className="alert success">{msg}</div>}

        <div className="section-title">Your Company</div>
        <div className="form-grid" style={{ maxWidth: 720 }}>
          <Field label="Company Name" className="full">
            <input
              className="input"
              value={data.company}
              onChange={(e) => setData({ ...data, company: e.target.value })}
            />
          </Field>
          <Field label="Address 1" className="full">
            <input
              className="input"
              value={data.address1}
              onChange={(e) => setData({ ...data, address1: e.target.value })}
            />
          </Field>
          <Field label="Address 2" className="full">
            <input
              className="input"
              value={data.address2}
              onChange={(e) => setData({ ...data, address2: e.target.value })}
            />
          </Field>
          <Field label="City">
            <input
              className="input"
              value={data.city}
              onChange={(e) => setData({ ...data, city: e.target.value })}
            />
          </Field>
          <Field label="Zip">
            <input
              className="input"
              value={data.zip}
              onChange={(e) => setData({ ...data, zip: e.target.value })}
            />
          </Field>
          <Field label="Default Terms (days)">
            <input
              className="input"
              type="number"
              value={data.termsDays}
              onChange={(e) =>
                setData({ ...data, termsDays: parseInt(e.target.value, 10) || 7 })
              }
            />
          </Field>
          <Field label="Interest Rate %">
            <input
              className="input"
              type="number"
              step="0.1"
              value={data.interestRate}
              onChange={(e) =>
                setData({
                  ...data,
                  interestRate: parseFloat(e.target.value) || 0,
                })
              }
            />
          </Field>
          <Field label="Next Invoice #">
            <input
              className="input"
              type="number"
              value={data.nextInvoice}
              onChange={(e) =>
                setData({
                  ...data,
                  nextInvoice: parseInt(e.target.value, 10) || 1,
                })
              }
            />
          </Field>
          <Field label="Next Order #">
            <input
              className="input"
              type="number"
              value={data.nextOrder}
              onChange={(e) =>
                setData({
                  ...data,
                  nextOrder: parseInt(e.target.value, 10) || 1,
                })
              }
            />
          </Field>
        </div>

        <div className="section-title">Import Legacy PROMAS Data</div>
        <div className="alert info">
          Import your original Clipper/dBase files from the PROMAS folder
          (COMPANY.DBF, PROPERTY.DBF, SALES1.DBF, SALES2.DBF, CASHRECT.DBF,
          etc.). This replaces current SQLite data.
        </div>
        <button
          className="btn btn-primary"
          onClick={importData}
          disabled={importing}
        >
          {importing ? "Importing…" : "Select PROMAS Folder & Import"}
        </button>

        {importResult && (
          <div className="table-wrap" style={{ marginTop: "1rem", maxWidth: 480 }}>
            <table className="data">
              <tbody>
                <tr>
                  <td>Companies</td>
                  <td className="num">{importResult.companies}</td>
                </tr>
                <tr>
                  <td>Properties</td>
                  <td className="num">{importResult.properties}</td>
                </tr>
                <tr>
                  <td>Employees</td>
                  <td className="num">{importResult.employees}</td>
                </tr>
                <tr>
                  <td>Work Types</td>
                  <td className="num">{importResult.workTypes}</td>
                </tr>
                <tr>
                  <td>Invoices</td>
                  <td className="num">{importResult.invoices}</td>
                </tr>
                <tr>
                  <td>Invoice Lines</td>
                  <td className="num">{importResult.invoiceLines}</td>
                </tr>
                <tr>
                  <td>Cash Receipts</td>
                  <td className="num">{importResult.cashReceipts}</td>
                </tr>
                <tr>
                  <td>Materials</td>
                  <td className="num">{importResult.materials}</td>
                </tr>
                <tr>
                  <td>Work Orders</td>
                  <td className="num">{importResult.workOrders}</td>
                </tr>
                <tr>
                  <td>Estimates</td>
                  <td className="num">{importResult.estimates}</td>
                </tr>
              </tbody>
            </table>
            <ul style={{ padding: "0.75rem 1.25rem", color: "var(--text-muted)" }}>
              {importResult.messages.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="section-title">Database</div>
        <p className="muted" style={{ fontFamily: "var(--mono)", fontSize: "0.85rem" }}>
          {dbPath}
        </p>
        <p className="muted" style={{ marginTop: "0.5rem", fontSize: "0.85rem" }}>
          PROMAS modern rewrite — TypeScript + Tauri + SQLite. Original Clipper
          app © 1990 Computer Communications Center.
        </p>
      </div>
    </>
  );
}
