import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api, SysData, ImportResult } from "../api";
import { useDosKeys } from "../dos/hooks";
import { Screen, FORM_KEYS, HelpOverlay, Prompt } from "../dos/Shell";
import { DotField } from "../dos/Field";
import { SubMenu, MenuItem } from "./SubMenu";

const MISC_ITEMS: MenuItem[] = [
  { id: "date", num: "1", label: "Change System Date / Company Info", accel: "C" },
  { id: "reindex", num: "2", label: "Reindex / Import Data Files", accel: "R" },
  { id: "workers", num: "3", label: "Worker File Maintenance", accel: "W" },
  { id: "worktype", num: "4", label: "Job Code / Work Type File", accel: "J" },
];

export function MiscScreen({
  onBack,
  onWorkers,
  onWorkTypes,
}: {
  onBack: () => void;
  onWorkers: () => void;
  onWorkTypes: () => void;
}) {
  const [screen, setScreen] = useState<string | null>(null);
  const [data, setData] = useState<SysData | null>(null);
  const [dbPath, setDbPath] = useState("");
  const [msg, setMsg] = useState("");
  const [msgKind, setMsgKind] = useState<"default" | "error" | "info">("default");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [confirmImport, setConfirmImport] = useState(false);
  const [pendingFolder, setPendingFolder] = useState<string | null>(null);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    if (screen === "date" || screen === "reindex") {
      Promise.all([api.getSysdata(), api.getDbPath()])
        .then(([s, p]) => {
          setData(s);
          setDbPath(p);
        })
        .catch((e) => {
          setMsg(String(e));
          setMsgKind("error");
        });
    }
  }, [screen]);

  useDosKeys(
    {
      onEscape: () => {
        if (help) setHelp(false);
        else if (confirmImport) setConfirmImport(false);
        else if (screen) {
          setScreen(null);
          setResult(null);
        } else onBack();
      },
      onF1: () => setHelp(true),
      onCtrlW: () => {
        if (screen === "date" && data) save();
      },
      onChar: (ch) => {
        if (confirmImport) {
          if (ch === "y" || ch === "Y") {
            doImport();
            return true;
          }
          if (ch === "n" || ch === "N") {
            setConfirmImport(false);
            setPendingFolder(null);
            return true;
          }
        }
        return false;
      },
    },
    !!screen
  );

  async function save() {
    if (!data) return;
    try {
      await api.saveSysdata(data);
      setMsg("Settings saved.");
      setMsgKind("info");
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    }
  }

  async function pickFolder() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select PROMAS folder (COMPANY.DBF ...)",
      });
      if (!selected || Array.isArray(selected)) return;
      setPendingFolder(selected);
      setConfirmImport(true);
      setMsg(
        "*** DO NOT RUN THIS PROGRAM IF OTHER USERS ARE LOGGED IN ***  Are you sure(Y/N) ?"
      );
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    }
  }

  async function doImport() {
    if (!pendingFolder) return;
    setConfirmImport(false);
    setImporting(true);
    setMsg("Reindexing Data Files......");
    setMsgKind("info");
    try {
      const r = await api.importDbfFolder(pendingFolder);
      setResult(r);
      setMsg("Import completed successfully");
      setMsgKind("info");
      setData(await api.getSysdata());
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    } finally {
      setImporting(false);
      setPendingFolder(null);
    }
  }

  if (!screen) {
    return (
      <SubMenu
        title=" Miscellaneous "
        items={MISC_ITEMS}
        onBack={onBack}
        onSelect={(id) => {
          if (id === "workers") onWorkers();
          else if (id === "worktype") onWorkTypes();
          else setScreen(id);
        }}
      />
    );
  }

  if (screen === "date" && data) {
    return (
      <Screen
        statusKeys={FORM_KEYS}
        title=" Change System Date / Company Info "
        message={msg || "Esc=Cancel, Ctrl-W=Save & Exit"}
        messageKind={msgKind}
      >
        <div className="dos-main-wrap">
          <div
            className="dos-dialog"
            style={{ position: "relative", boxShadow: "4px 4px 0 #000055" }}
          >
            <div className="dlg-title"> System / Company Information </div>
            <div className="dlg-body">
              <div className="dos-form">
                <DotField label="Company" width={12}>
                  <input
                    className="dos-input w30"
                    value={data.company}
                    onChange={(e) =>
                      setData({ ...data, company: e.target.value })
                    }
                    autoFocus
                  />
                </DotField>
                <DotField label="Address1" width={12}>
                  <input
                    className="dos-input w30"
                    value={data.address1}
                    onChange={(e) =>
                      setData({ ...data, address1: e.target.value })
                    }
                  />
                </DotField>
                <DotField label="Address2" width={12}>
                  <input
                    className="dos-input w30"
                    value={data.address2}
                    onChange={(e) =>
                      setData({ ...data, address2: e.target.value })
                    }
                  />
                </DotField>
                <DotField label="City" width={12}>
                  <input
                    className="dos-input w15"
                    value={data.city}
                    onChange={(e) =>
                      setData({ ...data, city: e.target.value })
                    }
                  />
                </DotField>
                <DotField label="Zip" width={12}>
                  <input
                    className="dos-input w10"
                    value={data.zip}
                    onChange={(e) => setData({ ...data, zip: e.target.value })}
                  />
                </DotField>
                <DotField label="Next Invoice" width={12}>
                  <input
                    className="dos-input w8"
                    type="number"
                    value={data.nextInvoice}
                    onChange={(e) =>
                      setData({
                        ...data,
                        nextInvoice: parseInt(e.target.value, 10) || 1,
                      })
                    }
                  />
                </DotField>
                <DotField label="Next Order" width={12}>
                  <input
                    className="dos-input w8"
                    type="number"
                    value={data.nextOrder}
                    onChange={(e) =>
                      setData({
                        ...data,
                        nextOrder: parseInt(e.target.value, 10) || 1,
                      })
                    }
                  />
                </DotField>
                <DotField label="Terms Days" width={12}>
                  <input
                    className="dos-input w5"
                    type="number"
                    value={data.termsDays}
                    onChange={(e) =>
                      setData({
                        ...data,
                        termsDays: parseInt(e.target.value, 10) || 7,
                      })
                    }
                  />
                </DotField>
              </div>
            </div>
            <div className="dlg-foot">Esc=Cancel, Ctrl-W=Save & Exit</div>
          </div>
        </div>
        {help && <HelpOverlay onClose={() => setHelp(false)} />}
      </Screen>
    );
  }

  if (screen === "reindex") {
    return (
      <Screen
        statusKeys={[
          { key: "Esc", label: "Exit" },
          { key: "Enter", label: "Import" },
          { key: "F1", label: "Help" },
        ]}
        title=" *** Reindex Data Files *** "
        message={
          msg ||
          "*** DO NOT RUN THIS PROGRAM IF OTHER USERS ARE LOGGED IN ***"
        }
        messageKind={msgKind}
      >
        <div className="dos-main-wrap">
          <div className="dos-menu-frame" style={{ minWidth: "56ch" }}>
            <div className="menu-header"> Import Legacy PROMAS (.DBF) Files </div>
            <div className="menu-body" style={{ padding: "1em 2ch" }}>
              <div style={{ color: "var(--dos-yellow)", marginBottom: "1em" }}>
                Select the PROMAS folder containing COMPANY.DBF, SALES1.DBF,
                SALES2.DBF, etc.
              </div>
              <div style={{ color: "var(--dos-cyan-bright)", marginBottom: "1em", fontSize: "0.9em" }}>
                Database: {dbPath}
              </div>
              <button
                className="dos-btn"
                disabled={importing}
                onClick={pickFolder}
                autoFocus
              >
                {importing ? "Reindexing Data Files......" : "Select Folder & Import"}
              </button>
              {result && (
                <pre
                  style={{
                    marginTop: "1em",
                    color: "var(--dos-white-bright)",
                    whiteSpace: "pre",
                  }}
                >
                  {`Companies...... ${result.companies}
Properties..... ${result.properties}
Employees...... ${result.employees}
Work Types..... ${result.workTypes}
Invoices....... ${result.invoices}
Invoice Lines.. ${result.invoiceLines}
Cash Receipts.. ${result.cashReceipts}
Materials...... ${result.materials}
Work Orders.... ${result.workOrders}
Estimates...... ${result.estimates}

Import completed successfully`}
                </pre>
              )}
            </div>
          </div>
        </div>
        {confirmImport && (
          <Prompt
            question="Are you sure(Y/N) ?  This REPLACES all current data."
            onYes={doImport}
            onNo={() => {
              setConfirmImport(false);
              setPendingFolder(null);
            }}
          />
        )}
        {help && <HelpOverlay onClose={() => setHelp(false)} />}
      </Screen>
    );
  }

  return null;
}
