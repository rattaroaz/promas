import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  Company,
  Property,
  emptyCompany,
  emptyProperty,
} from "../api";
import { useBrowseIndex, useDosKeys } from "../dos/hooks";
import { Screen, BROWSE_KEYS, Dialog, FORM_KEYS, Prompt, HelpOverlay } from "../dos/Shell";
import { DotField } from "../dos/Field";
import { padR, fmtDate, today } from "../dos/utils";

type Mode = "list" | "edit" | "detail" | "props" | "propedit";

export function CompanyBrowse({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<Company[]>([]);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<Mode>("list");
  const [edit, setEdit] = useState<Company | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [props, setProps] = useState<Property[]>([]);
  const [propEdit, setPropEdit] = useState<Property | null>(null);
  const [msg, setMsg] = useState("Ins=Add  Ctrl-Home=Edit  Del=Void  Home=Properties  Esc=Exit");
  const [msgKind, setMsgKind] = useState<"default" | "error" | "info">("default");
  const [voidAsk, setVoidAsk] = useState(false);
  const [help, setHelp] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const { index, setIndex, up, down, pageUp, pageDown, home, end } =
    useBrowseIndex(rows.length);

  const load = useCallback(async () => {
    try {
      const data = await api.listCompanies({ search, limit: 2000 });
      setRows(data);
      setMsgKind("default");
      setMsg(
        data.length
          ? `${data.length} companies  —  Ins=Add  Ctrl-Home=Edit  Del=Void  Home=Properties`
          : "No companies. Press Ins to add, or import data from Miscellaneous."
      );
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 150);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    const el = document.querySelector(".dos-row.selected");
    el?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const current = rows[index] ?? null;

  async function openProps() {
    if (!current) return;
    const p = await api.listProperties({
      companyNo: current.companyNo,
      limit: 500,
    });
    setProps(p);
    setMode("props");
    setMsg(
      `Properties for ${current.companyNo} ${current.name}  —  Esc=Back  Ins=Add`
    );
  }

  useDosKeys(
    {
      forceNav: mode === "list" || mode === "props",
      onEscape: () => {
        if (help) setHelp(false);
        else if (voidAsk) setVoidAsk(false);
        else if (mode === "edit" || mode === "detail") setMode("list");
        else if (mode === "propedit") setMode("props");
        else if (mode === "props") {
          setMode("list");
          setMsg("Ins=Add  Ctrl-Home=Edit  Del=Void  Home=Properties  Esc=Exit");
        } else onBack();
      },
      onF1: () => setHelp(true),
      onInsert: () => {
        if (mode === "list") {
          setIsNew(true);
          setEdit(emptyCompany());
          setMode("edit");
          setMsg("Enter Company Information (Esc=Cancel, Ctrl-W=Save & Exit)");
        } else if (mode === "props" && current) {
          setPropEdit(emptyProperty(current.companyNo));
          setMode("propedit");
        }
      },
      onCtrlHome: () => {
        if (mode === "list" && current) {
          setIsNew(false);
          setEdit({ ...current });
          setMode("edit");
          setMsg("Esc=Cancel, Ctrl-W=Save & Exit, Edit=Arrow_Key");
        }
      },
      onEnter: () => {
        if (mode === "list" && current) {
          setIsNew(false);
          setEdit({ ...current });
          setMode("detail");
        }
      },
      onDelete: () => {
        if (mode === "list" && current) setVoidAsk(true);
      },
      onHome: () => {
        if (mode === "list") openProps();
        else home();
      },
      onEnd: () => {
        if (mode === "list") window.print();
        else end();
      },
      onArrowUp: mode === "list" || mode === "props" ? up : undefined,
      onArrowDown: mode === "list" || mode === "props" ? down : undefined,
      onPageUp: mode === "list" || mode === "props" ? pageUp : undefined,
      onPageDown: mode === "list" || mode === "props" ? pageDown : undefined,
      onCtrlW: async () => {
        if (mode === "edit" && edit) await saveCompany();
        if (mode === "propedit" && propEdit) await saveProp();
      },
      onChar: (ch) => {
        if (voidAsk) {
          if (ch === "y" || ch === "Y") {
            doVoid();
            return true;
          }
          if (ch === "n" || ch === "N") {
            setVoidAsk(false);
            return true;
          }
        }
        return false;
      },
    },
    true
  );

  async function saveCompany() {
    if (!edit?.companyNo.trim() || !edit.name.trim()) {
      setMsg("--> Company NO and Name required !!");
      setMsgKind("error");
      return;
    }
    try {
      await api.saveCompany(edit);
      setMode("list");
      setMsg(`Company ${edit.companyNo} saved.`);
      setMsgKind("info");
      await load();
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    }
  }

  async function saveProp() {
    if (!propEdit?.proNo || !propEdit.name) {
      setMsg("--> Property NO and Name required !!");
      setMsgKind("error");
      return;
    }
    try {
      await api.saveProperty(propEdit);
      const p = await api.listProperties({
        companyNo: propEdit.companyNo,
        limit: 500,
      });
      setProps(p);
      setMode("props");
      setMsg("Property saved.");
      setMsgKind("info");
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    }
  }

  async function doVoid() {
    if (!current) return;
    await api.deleteCompany(current.companyNo);
    setVoidAsk(false);
    await load();
    setMsg(`Company ${current.companyNo} voided.`);
  }

  const header =
    "Co#  Company Name                   City            Phone         Contact";

  return (
    <Screen
      statusKeys={
        mode === "edit" || mode === "propedit" ? FORM_KEYS : BROWSE_KEYS
      }
      title={
        mode === "props" || mode === "propedit"
          ? " Property File "
          : " Company File "
      }
      message={msg}
      messageKind={msgKind}
    >
      {(mode === "list" || mode === "detail") && (
        <>
          <div className="dos-searchline">
            <label>Search:</label>
            <input
              ref={searchRef}
              className="dos-input"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setIndex(0);
              }}
              placeholder="Company NO, Name, Phone  (Esc=Exit)"
            />
          </div>
          <div className="dos-browse">
            <div className="dos-browse-header">{header}</div>
            <div className="dos-browse-body">
              {rows.map((c, i) => (
                <button
                  key={c.companyNo}
                  className={`dos-row ${i === index ? "selected" : ""} ${c.voided ? "voided" : ""}`}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => {
                    setIndex(i);
                    setIsNew(false);
                    setEdit({ ...c });
                    setMode("detail");
                  }}
                  onDoubleClick={() => {
                    setIsNew(false);
                    setEdit({ ...c });
                    setMode("edit");
                  }}
                >
                  {padR(c.companyNo, 5)}
                  {padR(c.name, 30)}{" "}
                  {padR(c.city, 15)}{" "}
                  {padR(c.phone, 13)}{" "}
                  {padR(c.contact, 20)}
                </button>
              ))}
              {rows.length === 0 && (
                <div className="dos-row" style={{ color: "var(--dos-yellow)" }}>
                  {"  ( no records )"}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {mode === "props" && (
        <div className="dos-browse">
          <div className="dos-browse-header">
            {"Pro# Name                           Street                         Phone"}
          </div>
          <div className="dos-browse-body">
            {props.map((p, i) => (
              <button
                key={p.proNo}
                className={`dos-row ${i === index % Math.max(props.length, 1) ? "selected" : ""}`}
                onClick={() => {
                  setPropEdit({ ...p });
                  setMode("propedit");
                }}
              >
                {padR(p.proNo, 4)} {padR(p.name, 30)} {padR(p.street, 30)}{" "}
                {padR(p.phone, 13)}
              </button>
            ))}
            {props.length === 0 && (
              <div className="dos-row" style={{ color: "var(--dos-yellow)" }}>
                {"  Property Empty !! Press Ins to Add Property"}
              </div>
            )}
          </div>
        </div>
      )}

      {(mode === "edit" || mode === "detail") && edit && (
        <Dialog
          title={
            mode === "detail"
              ? "Detaill Company Information"
              : isNew
                ? "Company Information"
                : "Detaill Company Information"
          }
          foot={
            mode === "detail"
              ? "Esc=Cancel, Home=Detail_Data, Enter/Ctrl-Home=Edit"
              : "Esc=Cancel, Ctrl-W=Save & Exit, Edit=Arrow_Key"
          }
        >
          <div className="dos-form">
            <DotField label="Company NO" width={14}>
              <input
                className="dos-input w5"
                value={edit.companyNo}
                disabled={!isNew || mode === "detail"}
                onChange={(e) =>
                  setEdit({ ...edit, companyNo: e.target.value })
                }
                autoFocus={isNew}
              />
            </DotField>
            <DotField label="Company Name" width={14}>
              <input
                className="dos-input w30"
                value={edit.name}
                disabled={mode === "detail"}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
            </DotField>
            <DotField label="Class" width={14}>
              <input
                className="dos-input w4"
                value={edit.class}
                disabled={mode === "detail"}
                onChange={(e) => setEdit({ ...edit, class: e.target.value })}
              />
            </DotField>
            <DotField label="Street" width={14}>
              <input
                className="dos-input w30"
                value={edit.street}
                disabled={mode === "detail"}
                onChange={(e) => setEdit({ ...edit, street: e.target.value })}
              />
            </DotField>
            <div className="dos-form-row">
              <DotField label="City" width={8}>
                <input
                  className="dos-input w15"
                  value={edit.city}
                  disabled={mode === "detail"}
                  onChange={(e) => setEdit({ ...edit, city: e.target.value })}
                />
              </DotField>
              <DotField label="Sta" width={5}>
                <input
                  className="dos-input w4"
                  value={edit.state}
                  disabled={mode === "detail"}
                  onChange={(e) => setEdit({ ...edit, state: e.target.value })}
                />
              </DotField>
              <DotField label="Zip" width={5}>
                <input
                  className="dos-input w10"
                  value={edit.zip}
                  disabled={mode === "detail"}
                  onChange={(e) => setEdit({ ...edit, zip: e.target.value })}
                />
              </DotField>
            </div>
            <DotField label="Phone1" width={14}>
              <input
                className="dos-input w15"
                value={edit.phone}
                disabled={mode === "detail"}
                onChange={(e) => setEdit({ ...edit, phone: e.target.value })}
              />
            </DotField>
            <DotField label="Phone2" width={14}>
              <input
                className="dos-input w15"
                value={edit.phone2}
                disabled={mode === "detail"}
                onChange={(e) => setEdit({ ...edit, phone2: e.target.value })}
              />
            </DotField>
            <DotField label="Fax NO" width={14}>
              <input
                className="dos-input w15"
                value={edit.phone4}
                disabled={mode === "detail"}
                onChange={(e) => setEdit({ ...edit, phone4: e.target.value })}
              />
            </DotField>
            <DotField label="Contact" width={14}>
              <input
                className="dos-input w30"
                value={edit.contact}
                disabled={mode === "detail"}
                onChange={(e) => setEdit({ ...edit, contact: e.target.value })}
              />
            </DotField>
            {mode === "detail" && (
              <div style={{ marginTop: "0.8em", color: "var(--dos-yellow)" }}>
                Entered: {fmtDate(edit.enterDate || today())}
                {"  "}
                <button
                  className="dos-btn"
                  onClick={() => {
                    setMode("edit");
                    setIsNew(false);
                  }}
                >
                  Edit (Ctrl-Home)
                </button>{" "}
                <button className="dos-btn" onClick={openProps}>
                  Properties (Home)
                </button>
              </div>
            )}
          </div>
        </Dialog>
      )}

      {mode === "propedit" && propEdit && (
        <Dialog
          title="Property Information"
          wide
          foot="Esc=Cancel, Ctrl-W=Save & Exit"
        >
          <div className="dos-form">
            <DotField label="Property NO" width={14}>
              <input
                className="dos-input w5"
                value={propEdit.proNo}
                onChange={(e) =>
                  setPropEdit({ ...propEdit, proNo: e.target.value })
                }
                autoFocus
              />
            </DotField>
            <DotField label="PropertyName" width={14}>
              <input
                className="dos-input w30"
                value={propEdit.name}
                onChange={(e) =>
                  setPropEdit({ ...propEdit, name: e.target.value })
                }
              />
            </DotField>
            <DotField label="Street" width={14}>
              <input
                className="dos-input w30"
                value={propEdit.street}
                onChange={(e) =>
                  setPropEdit({ ...propEdit, street: e.target.value })
                }
              />
            </DotField>
            <div className="dos-form-row">
              <DotField label="City" width={8}>
                <input
                  className="dos-input w15"
                  value={propEdit.city}
                  onChange={(e) =>
                    setPropEdit({ ...propEdit, city: e.target.value })
                  }
                />
              </DotField>
              <DotField label="Sta" width={5}>
                <input
                  className="dos-input w4"
                  value={propEdit.state}
                  onChange={(e) =>
                    setPropEdit({ ...propEdit, state: e.target.value })
                  }
                />
              </DotField>
              <DotField label="Zip" width={5}>
                <input
                  className="dos-input w10"
                  value={propEdit.zip}
                  onChange={(e) =>
                    setPropEdit({ ...propEdit, zip: e.target.value })
                  }
                />
              </DotField>
            </div>
            <DotField label="Phone" width={14}>
              <input
                className="dos-input w15"
                value={propEdit.phone}
                onChange={(e) =>
                  setPropEdit({ ...propEdit, phone: e.target.value })
                }
              />
            </DotField>
            <DotField label="Manager" width={14}>
              <input
                className="dos-input w20"
                value={propEdit.manager}
                onChange={(e) =>
                  setPropEdit({ ...propEdit, manager: e.target.value })
                }
              />
            </DotField>
            <DotField label="Key" width={14}>
              <input
                className="dos-input w12"
                value={propEdit.keyInfo}
                onChange={(e) =>
                  setPropEdit({ ...propEdit, keyInfo: e.target.value })
                }
              />
            </DotField>
            <DotField label="Time" width={14}>
              <input
                className="dos-input w15"
                value={propEdit.paintTime}
                onChange={(e) =>
                  setPropEdit({ ...propEdit, paintTime: e.target.value })
                }
              />
            </DotField>
            <DotField label="PageMap" width={14}>
              <input
                className="dos-input w12"
                value={propEdit.pageMap}
                onChange={(e) =>
                  setPropEdit({ ...propEdit, pageMap: e.target.value })
                }
              />
            </DotField>
            <DotField label="Comment" width={14}>
              <input
                className="dos-input w40"
                value={propEdit.comment1}
                onChange={(e) =>
                  setPropEdit({ ...propEdit, comment1: e.target.value })
                }
              />
            </DotField>
          </div>
        </Dialog>
      )}

      {voidAsk && (
        <Prompt
          question={`Do you want delete (Y/N) ?  ${current?.companyNo} ${current?.name}`}
          onYes={doVoid}
          onNo={() => setVoidAsk(false)}
        />
      )}
      {help && <HelpOverlay onClose={() => setHelp(false)} />}
    </Screen>
  );
}
