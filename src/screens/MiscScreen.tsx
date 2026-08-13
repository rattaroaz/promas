/**
 * Original Miscellaneous menu:
 *  1. Change System Date
 *  2. Reindex Data Files  (also offered original-data import)
 *  3. Form Management
 *  4. Import Database     — pick original PROMAS folder and load all .DBF files
 */
import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api, SysData, FormRecord, ImportResult } from "../api";
import { useDosKeys } from "../dos/hooks";
import { Screen, FORM_KEYS, HelpOverlay, Prompt } from "../dos/Shell";
import { DotField } from "../dos/Field";
import { SubMenu, MenuItem } from "./SubMenu";
import { padR } from "../dos/utils";
import { log } from "../lib/observability";

const MISC_ITEMS: MenuItem[] = [
  { id: "date", num: "1", label: "Change System Date", accel: "C" },
  { id: "reindex", num: "2", label: "Reindex Data Files", accel: "R" },
  { id: "forms", num: "3", label: "Form Management", accel: "F" },
  { id: "import", num: "4", label: "Import Database", accel: "I" },
];

function formatImportSummary(r: ImportResult): string {
  const lines = [
    `Imported original PROMAS data — Companies ${r.companies}  Properties ${r.properties}  Employees ${r.employees}`,
    `Invoices ${r.invoices}  Lines ${r.invoiceLines}  Receipts ${r.cashReceipts}  Orders ${r.workOrders}  Estimates ${r.estimates}  Materials ${r.materials}`,
  ];
  if (r.messages.length) lines.push(r.messages.slice(-3).join("  "));
  return lines.join("  ");
}

export function MiscScreen({ onBack }: { onBack: () => void }) {
  const [screen, setScreen] = useState<string | null>(null);
  const [data, setData] = useState<SysData | null>(null);
  const [msg, setMsg] = useState("");
  const [msgKind, setMsgKind] = useState<"default" | "error" | "info">(
    "default"
  );
  const [confirmReindex, setConfirmReindex] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [confirmImport, setConfirmImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [forms, setForms] = useState<FormRecord[]>([]);
  const [editForm, setEditForm] = useState<FormRecord | null>(null);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    if (screen === "date") {
      api
        .getSysdata()
        .then(setData)
        .catch((e) => {
          setMsg(String(e));
          setMsgKind("error");
        });
    }
    if (screen === "forms") {
      api
        .listForms()
        .then((f) => {
          setForms(f);
          if (f.length === 0) {
            setForms([{ formNo: "EST-1", content: "" }]);
          }
        })
        .catch((e) => setMsg(String(e)));
    }
  }, [screen]);

  useDosKeys(
    {
      onEscape: () => {
        if (help) setHelp(false);
        else if (confirmReindex) setConfirmReindex(false);
        else if (confirmImport) setConfirmImport(false);
        else if (editForm) setEditForm(null);
        else if (screen) setScreen(null);
        else onBack();
      },
      onF1: () => setHelp(true),
      onCtrlW: () => {
        if (screen === "date" && data) saveSys();
        if (editForm) saveForm();
      },
      onInsert: () => {
        if (screen === "forms" && !editForm) {
          setEditForm({ formNo: "", content: "" });
        }
      },
      onChar: (ch) => {
        if (confirmReindex) {
          if (ch === "y" || ch === "Y") {
            doReindex();
            return true;
          }
          if (ch === "n" || ch === "N") {
            setConfirmReindex(false);
            return true;
          }
        }
        if (confirmImport) {
          if (ch === "y" || ch === "Y") {
            void doImportOriginal();
            return true;
          }
          if (ch === "n" || ch === "N") {
            setConfirmImport(false);
            return true;
          }
        }
        return false;
      },
    },
    !!screen
  );

  async function saveSys() {
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

  async function doReindex() {
    setConfirmReindex(false);
    setReindexing(true);
    setMsg("Reindexing Data Files......");
    setMsgKind("info");
    try {
      const r = await api.reindexDataFiles();
      setMsg(r);
      setMsgKind("info");
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    } finally {
      setReindexing(false);
    }
  }

  async function doImportOriginal() {
    setConfirmImport(false);
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select original PROMAS folder (app folder, COMPBACK, or .DBF folder)",
      });
      if (!selected || Array.isArray(selected)) return;
      setImporting(true);
      setMsg("Importing original PROMAS data files…");
      setMsgKind("info");
      log.info("db", "legacy dbf import started", { folder: selected });
      const result = await api.importDbfFolder(selected);
      setMsg(formatImportSummary(result));
      setMsgKind("info");
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    } finally {
      setImporting(false);
    }
  }

  async function saveForm() {
    if (!editForm?.formNo.trim()) {
      setMsg("--> Form # required !!");
      setMsgKind("error");
      return;
    }
    try {
      await api.saveForm(editForm);
      setEditForm(null);
      setForms(await api.listForms());
      setMsg("Form saved.");
      setMsgKind("info");
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    }
  }

  if (!screen) {
    return (
      <SubMenu
        title=" Miscellaneous "
        items={MISC_ITEMS}
        onBack={onBack}
        onSelect={(id) => {
          if (id === "reindex") {
            setScreen("reindex");
            setConfirmReindex(false);
            setMsg("");
          } else if (id === "import") {
            setScreen("import");
            setMsg("");
          } else {
            setScreen(id);
            setMsg("");
          }
        }}
      />
    );
  }

  if (screen === "date" && data) {
    return (
      <Screen
        statusKeys={FORM_KEYS}
        title=" Change System Date "
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
                <DotField label="Company" width={14}>
                  <input
                    className="dos-input w30"
                    value={data.company}
                    onChange={(e) =>
                      setData({ ...data, company: e.target.value })
                    }
                    autoFocus
                  />
                </DotField>
                <DotField label="Address1" width={14}>
                  <input
                    className="dos-input w30"
                    value={data.address1}
                    onChange={(e) =>
                      setData({ ...data, address1: e.target.value })
                    }
                  />
                </DotField>
                <DotField label="Address2" width={14}>
                  <input
                    className="dos-input w30"
                    value={data.address2}
                    onChange={(e) =>
                      setData({ ...data, address2: e.target.value })
                    }
                  />
                </DotField>
                <DotField label="City" width={14}>
                  <input
                    className="dos-input w15"
                    value={data.city}
                    onChange={(e) =>
                      setData({ ...data, city: e.target.value })
                    }
                  />
                </DotField>
                <DotField label="Zip" width={14}>
                  <input
                    className="dos-input w10"
                    value={data.zip}
                    onChange={(e) => setData({ ...data, zip: e.target.value })}
                  />
                </DotField>
                <DotField label="Close Date" width={14}>
                  <input
                    className="dos-input w12"
                    type="date"
                    value={data.closeDate || ""}
                    onChange={(e) =>
                      setData({
                        ...data,
                        closeDate: e.target.value || null,
                      })
                    }
                  />
                </DotField>
                <DotField label="Next Invoice" width={14}>
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
                <DotField label="Next Order" width={14}>
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
                <DotField label="Next Estimate" width={14}>
                  <input
                    className="dos-input w8"
                    type="number"
                    value={data.nextEstimate}
                    onChange={(e) =>
                      setData({
                        ...data,
                        nextEstimate: parseInt(e.target.value, 10) || 1,
                      })
                    }
                  />
                </DotField>
                <DotField label="Terms Days" width={14}>
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

  if (screen === "reindex" || screen === "import") {
    const isImport = screen === "import";
    return (
      <Screen
        statusKeys={[
          { key: "Esc", label: "Exit" },
          { key: "Y/N", label: "Confirm" },
        ]}
        title={
          isImport ? " *** Import Database *** " : " *** Reindex Data Files *** "
        }
        message={
          msg ||
          (isImport
            ? "Select the original PROMAS folder to import all .DBF files"
            : "*** DO NOT RUN THIS PROGRAM IF OTHER USERS ARE LOGGED IN ***")
        }
        messageKind={msgKind}
      >
        <div className="dos-main-wrap">
          <div className="dos-menu-frame" style={{ minWidth: "58ch" }}>
            <div className="menu-header">
              {isImport ? " Import Original Database " : " Reindex Data Files "}
            </div>
            <div className="menu-body" style={{ padding: "1em 2ch" }}>
              <div style={{ color: "var(--dos-yellow)", marginBottom: "1em" }}>
                {isImport
                  ? "This REPLACES all current companies, invoices, receipts, and related files."
                  : "*** DO NOT RUN THIS PROGRAM IF OTHER USERS ARE LOGGED IN ***"}
              </div>
              <div style={{ marginBottom: "1em" }}>
                {isImport ? (
                  <>
                    Choose the original application folder. PROMAS finds{" "}
                    COMPANY.DBF automatically in that folder, in COMPBACK, or in
                    COMPBACK\PROMAS (for example DKSKapp\COMPBACK\PROMAS).
                  </>
                ) : (
                  <>
                    Rebuilds internal indexes (SQLite REINDEX / ANALYZE).
                    <br />
                    Original rebuilt COMPANY, PROPERTY, SALES, CASHRECT, etc. NTX
                    files.
                    <br />
                    <br />
                    Import Database loads all original .DBF files from the old
                    PROMAS folder.
                  </>
                )}
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.6em",
                }}
              >
                {!isImport && (
                  <button
                    className="dos-btn"
                    disabled={reindexing || importing}
                    onClick={() => setConfirmReindex(true)}
                  >
                    {reindexing ? "Reindexing Data Files......" : "Reindex Now"}
                  </button>
                )}
                <button
                  className="dos-btn"
                  disabled={reindexing || importing}
                  onClick={() => setConfirmImport(true)}
                  autoFocus={isImport}
                >
                  {importing
                    ? "Importing original data......"
                    : "Select Original PROMAS Folder & Import"}
                </button>
              </div>
            </div>
          </div>
        </div>
        {confirmReindex && (
          <Prompt
            question="Are you sure(Y/N) ?"
            onYes={doReindex}
            onNo={() => setConfirmReindex(false)}
          />
        )}
        {confirmImport && (
          <Prompt
            question="Import REPLACES all current data. Are you sure(Y/N) ?"
            onYes={() => void doImportOriginal()}
            onNo={() => setConfirmImport(false)}
          />
        )}
        {help && <HelpOverlay onClose={() => setHelp(false)} />}
      </Screen>
    );
  }

  if (screen === "forms") {
    return (
      <Screen
        statusKeys={[
          { key: "Esc", label: "Exit" },
          { key: "Ins", label: "Add" },
          { key: "Enter", label: "Edit" },
          { key: "Ctrl-W", label: "Save" },
        ]}
        title=" <<< Form Management >>> "
        message={msg || "Enter Form #(Esc=Exit) !  Ins=Add  Enter=Edit"}
        messageKind={msgKind}
      >
        {!editForm ? (
          <div className="dos-browse">
            <div className="dos-browse-header">
              {"Form #............  Content preview"}
            </div>
            <div className="dos-browse-body">
              {forms.map((f) => (
                <button
                  key={f.formNo}
                  className="dos-row"
                  onClick={() => setEditForm({ ...f })}
                >
                  {padR(f.formNo, 16)} {padR(f.content.slice(0, 40), 40)}
                </button>
              ))}
              {forms.length === 0 && (
                <div className="dos-row" style={{ color: "var(--dos-yellow)" }}>
                  {"  Press Ins to add Form #"}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="dos-main-wrap">
            <div className="dos-dialog" style={{ minWidth: "50ch" }}>
              <div className="dlg-title"> Enter Form </div>
              <div className="dlg-body">
                <div className="dos-form">
                  <DotField label="Form #" width={12}>
                    <input
                      className="dos-input w12"
                      value={editForm.formNo}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          formNo: e.target.value.toUpperCase(),
                        })
                      }
                      autoFocus
                    />
                  </DotField>
                  <DotField label="Form text" width={12}>
                    <textarea
                      className="dos-textarea"
                      value={editForm.content}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          content: e.target.value,
                        })
                      }
                      rows={8}
                    />
                  </DotField>
                </div>
              </div>
              <div className="dlg-foot">
                Esc=Cancel, Ctrl-W=Save & Exit
              </div>
            </div>
          </div>
        )}
        {help && <HelpOverlay onClose={() => setHelp(false)} />}
      </Screen>
    );
  }

  return null;
}
