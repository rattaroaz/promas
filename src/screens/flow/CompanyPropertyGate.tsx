/**
 * Original PROMAS gateway shared by Estimate / Work Order / Invoice / Cash:
 *   Search Company (NO / Name / Phone) → select or add
 *   Search Property (NO / Name / Phone / Street) → select or add
 * Then hand off company+property to the process screen.
 */
import { useEffect, useState } from "react";
import {
  api,
  Company,
  Property,
  emptyCompany,
  emptyProperty,
} from "../../api";
import { useBrowseIndex, useDosKeys } from "../../dos/hooks";
import {
  Screen,
  Dialog,
  Prompt,
  HelpOverlay,
  BROWSE_KEYS,
  FORM_KEYS,
} from "../../dos/Shell";
import { DotField } from "../../dos/Field";
import { padR, today } from "../../dos/utils";

export type ProcessKind =
  | "invoice"
  | "workorder"
  | "estimate"
  | "cash";

const PROCESS_TITLE: Record<ProcessKind, string> = {
  invoice: " Invoice Process ",
  workorder: " Work Order Process ",
  estimate: " Estimate Process ",
  cash: " Cash Receipts Process ",
};

type Phase =
  | "co-search"
  | "co-browse"
  | "co-edit"
  | "pr-search"
  | "pr-browse"
  | "pr-edit";

type CoField = "no" | "name" | "phone";
type PrField = "no" | "name" | "phone" | "street";

export function CompanyPropertyGate({
  process,
  onBack,
  onReady,
}: {
  process: ProcessKind;
  onBack: () => void;
  onReady: (company: Company, property: Property) => void;
}) {
  const title = PROCESS_TITLE[process];
  const [phase, setPhase] = useState<Phase>("co-search");
  const [coField, setCoField] = useState<CoField>("no");
  const [prField, setPrField] = useState<PrField>("no");
  const [query, setQuery] = useState("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [editCo, setEditCo] = useState<Company | null>(null);
  const [editPr, setEditPr] = useState<Property | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [msg, setMsg] = useState(
    "Enter Search Company NO (Esc=Exit, ?=First)"
  );
  const [msgKind, setMsgKind] = useState<"default" | "error" | "info">(
    "default"
  );
  const [askAdd, setAskAdd] = useState(false);
  const [help, setHelp] = useState(false);

  const coBrowse = useBrowseIndex(companies.length);
  const prBrowse = useBrowseIndex(properties.length);

  useEffect(() => {
    if (phase === "co-search") {
      setMsg(
        coField === "no"
          ? "Enter Search Company NO (Esc=Exit, ?=First)"
          : coField === "name"
            ? "Enter Search Company Name (Esc=Exit, ?=First)"
            : "Enter Search Company Phone (Esc=Exit, ?=First)"
      );
    } else if (phase === "pr-search") {
      setMsg(
        prField === "no"
          ? "Enter Property NO(Esc=Exit,?=First)"
          : prField === "name"
            ? "Enter Property Name(Esc=Exit,?=First)"
            : prField === "phone"
              ? "Enter Property Phone(Esc=Exit,?=First)"
              : "Enter Search Property Street (Esc=Exit) !"
      );
    }
  }, [phase, coField, prField]);

  async function searchCompanies(raw: string) {
    const q = raw.trim();
    if (q === "?") {
      const all = await api.listCompanies({ limit: 2000 });
      setCompanies(all);
      coBrowse.setIndex(0);
      setPhase("co-browse");
      setMsg(
        all.length
          ? "Ins=Add  Ctrl-Home=Edit  Enter=Select  Esc=Back"
          : "No companies. Press Ins to add."
      );
      return;
    }
    if (!q) {
      setMsg("--> enter search value or ? for first !!");
      setMsgKind("error");
      return;
    }

    let list = await api.listCompanies({ search: q, limit: 500 });
    if (coField === "no") {
      const exact = list.find(
        (c) => c.companyNo.trim() === q || c.companyNo.trim() === q.padStart(4, "0")
      );
      if (exact) {
        await selectCompany(exact);
        return;
      }
      // also try get_company
      const one = await api.getCompany(q);
      if (one) {
        await selectCompany(one);
        return;
      }
      list = list.filter((c) => c.companyNo.startsWith(q));
    } else if (coField === "name") {
      list = list.filter((c) =>
        c.name.toUpperCase().includes(q.toUpperCase())
      );
    } else {
      list = list.filter((c) => c.phone.includes(q) || c.phone2.includes(q));
    }

    if (list.length === 0) {
      setMsg(`--> Does not exist !! Do you want Add Company (Y/N) ?`);
      setMsgKind("error");
      setAskAdd(true);
      setIsNew(true);
      const blank = emptyCompany();
      if (coField === "no") blank.companyNo = q;
      if (coField === "name") blank.name = q;
      if (coField === "phone") blank.phone = q;
      setEditCo(blank);
      return;
    }
    if (list.length === 1 && coField === "no") {
      await selectCompany(list[0]);
      return;
    }
    setCompanies(list);
    coBrowse.setIndex(0);
    setPhase("co-browse");
    setMsg("Enter=Select  Ins=Add  Ctrl-Home=Edit  Esc=Back");
    setMsgKind("default");
  }

  async function selectCompany(c: Company) {
    setCompany(c);
    setProperty(null);
    setQuery("");
    setPhase("pr-search");
    setPrField("no");
    setMsgKind("default");
    setMsg(
      `Company ${c.companyNo} ${c.name}  —  Enter Property NO(Esc=Exit,?=First)`
    );
  }

  async function searchProperties(raw: string) {
    if (!company) return;
    const q = raw.trim();
    const all = await api.listProperties({
      companyNo: company.companyNo,
      limit: 500,
    });

    if (q === "?") {
      if (all.length === 0) {
        setMsg("Property Empty !! Do you want Add Property(Y/N) ?");
        setMsgKind("error");
        setAskAdd(true);
        setIsNew(true);
        setEditPr(emptyProperty(company.companyNo));
        return;
      }
      setProperties(all);
      prBrowse.setIndex(0);
      setPhase("pr-browse");
      setMsg("Enter=Select  Ins=Add  Ctrl-Home=Edit  Esc=Back");
      return;
    }
    if (!q) {
      setMsg("--> enter search value or ? for first !!");
      setMsgKind("error");
      return;
    }

    let list = all;
    if (prField === "no") {
      const exact = all.find((p) => p.proNo.trim() === q);
      if (exact) {
        selectProperty(exact);
        return;
      }
      list = all.filter((p) => p.proNo.startsWith(q));
    } else if (prField === "name") {
      list = all.filter((p) =>
        p.name.toUpperCase().includes(q.toUpperCase())
      );
    } else if (prField === "phone") {
      list = all.filter((p) => p.phone.includes(q) || p.phone2.includes(q));
    } else {
      list = all.filter((p) =>
        p.street.toUpperCase().includes(q.toUpperCase())
      );
    }

    if (list.length === 0) {
      setMsg("--> does not exist !! Do you want Add Property(Y/N) ?");
      setMsgKind("error");
      setAskAdd(true);
      setIsNew(true);
      const blank = emptyProperty(company.companyNo);
      if (prField === "no") blank.proNo = q;
      if (prField === "name") blank.name = q;
      setEditPr(blank);
      return;
    }
    if (list.length === 1 && prField === "no") {
      selectProperty(list[0]);
      return;
    }
    setProperties(list);
    prBrowse.setIndex(0);
    setPhase("pr-browse");
    setMsg("Enter=Select  Ins=Add  Ctrl-Home=Edit  Esc=Back");
    setMsgKind("default");
  }

  function selectProperty(p: Property) {
    if (!company) return;
    setProperty(p);
    onReady(company, p);
  }

  async function saveCompany() {
    if (!editCo?.companyNo.trim() || !editCo.name.trim()) {
      setMsg("--> Company NO and Name required !!");
      setMsgKind("error");
      return;
    }
    try {
      if (!editCo.enterDate) editCo.enterDate = today();
      await api.saveCompany(editCo);
      setPhase("co-search");
      setEditCo(null);
      await selectCompany(editCo);
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    }
  }

  async function saveProperty() {
    if (!editPr?.proNo.trim() || !editPr.name.trim()) {
      setMsg("--> Property NO and Name required !!");
      setMsgKind("error");
      return;
    }
    try {
      await api.saveProperty(editPr);
      setEditPr(null);
      selectProperty(editPr);
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    }
  }

  useDosKeys({
    forceNav: phase === "co-browse" || phase === "pr-browse",
    onEscape: () => {
      if (help) {
        setHelp(false);
        return;
      }
      if (askAdd) {
        setAskAdd(false);
        setEditCo(null);
        setEditPr(null);
        return;
      }
      if (phase === "co-edit") {
        setPhase(companies.length ? "co-browse" : "co-search");
        setEditCo(null);
        return;
      }
      if (phase === "pr-edit") {
        setPhase(properties.length ? "pr-browse" : "pr-search");
        setEditPr(null);
        return;
      }
      if (phase === "co-browse") {
        setPhase("co-search");
        setQuery("");
        return;
      }
      if (phase === "pr-browse" || phase === "pr-search") {
        if (phase === "pr-browse") {
          setPhase("pr-search");
          setQuery("");
          return;
        }
        setCompany(null);
        setPhase("co-search");
        setQuery("");
        setMsg("Enter Search Company NO (Esc=Exit, ?=First)");
        return;
      }
      onBack();
    },
    onF1: () => setHelp(true),
    onInsert: () => {
      if (phase === "co-search" || phase === "co-browse") {
        setIsNew(true);
        setEditCo(emptyCompany());
        setPhase("co-edit");
        setMsg("Enter Company Information (Esc=exit) !");
      } else if (phase === "pr-search" || phase === "pr-browse") {
        if (!company) return;
        setIsNew(true);
        setEditPr(emptyProperty(company.companyNo));
        setPhase("pr-edit");
        setMsg("Enter Property Information (Esc=Exit) !");
      }
    },
    onCtrlHome: () => {
      if (phase === "co-browse" && companies[coBrowse.index]) {
        setIsNew(false);
        setEditCo({ ...companies[coBrowse.index] });
        setPhase("co-edit");
        setMsg("Esc=Cancel, Ctrl-W=Save & Exit, Edit=Arrow_Key");
      } else if (phase === "pr-browse" && properties[prBrowse.index]) {
        setIsNew(false);
        setEditPr({ ...properties[prBrowse.index] });
        setPhase("pr-edit");
        setMsg("Esc=Cancel, Ctrl-W=Save & Exit, Edit=Arrow_Key");
      }
    },
    onEnter: () => {
      if (phase === "co-browse" && companies[coBrowse.index]) {
        selectCompany(companies[coBrowse.index]);
      } else if (phase === "pr-browse" && properties[prBrowse.index]) {
        selectProperty(properties[prBrowse.index]);
      } else if (phase === "co-search") {
        searchCompanies(query);
      } else if (phase === "pr-search") {
        searchProperties(query);
      }
    },
    onCtrlW: () => {
      if (phase === "co-edit") saveCompany();
      if (phase === "pr-edit") saveProperty();
    },
    onHome: () => {
      if (phase === "co-browse" && companies[coBrowse.index]) {
        setIsNew(false);
        setEditCo({ ...companies[coBrowse.index] });
        setPhase("co-edit");
        setMsg("Detaill Company Information — Esc=Cancel, Ctrl-W=Save");
      } else if (phase === "pr-browse" && properties[prBrowse.index]) {
        setIsNew(false);
        setEditPr({ ...properties[prBrowse.index] });
        setPhase("pr-edit");
      } else if (phase === "co-browse") coBrowse.home();
      else if (phase === "pr-browse") prBrowse.home();
    },
    onArrowUp:
      phase === "co-browse"
        ? coBrowse.up
        : phase === "pr-browse"
          ? prBrowse.up
          : undefined,
    onArrowDown:
      phase === "co-browse"
        ? coBrowse.down
        : phase === "pr-browse"
          ? prBrowse.down
          : undefined,
    onPageUp:
      phase === "co-browse"
        ? coBrowse.pageUp
        : phase === "pr-browse"
          ? prBrowse.pageUp
          : undefined,
    onPageDown:
      phase === "co-browse"
        ? coBrowse.pageDown
        : phase === "pr-browse"
          ? prBrowse.pageDown
          : undefined,
    onEnd:
      phase === "co-browse"
        ? coBrowse.end
        : phase === "pr-browse"
          ? prBrowse.end
          : undefined,
    onChar: (ch) => {
      if (askAdd) {
        if (ch === "y" || ch === "Y") {
          setAskAdd(false);
          if (editCo && !editPr) setPhase("co-edit");
          else if (editPr) setPhase("pr-edit");
          setMsg(
            editPr
              ? "Enter Property Information (Esc=Exit) !"
              : "Enter Company Information (Esc=exit) !"
          );
          setMsgKind("default");
          return true;
        }
        if (ch === "n" || ch === "N") {
          setAskAdd(false);
          setEditCo(null);
          setEditPr(null);
          setMsgKind("default");
          return true;
        }
      }
      return false;
    },
  });

  const statusKeys =
    phase === "co-edit" || phase === "pr-edit"
      ? FORM_KEYS
      : phase === "co-browse" || phase === "pr-browse"
        ? BROWSE_KEYS
        : [
            { key: "Esc", label: "Exit" },
            { key: "Enter", label: "Search" },
            { key: "?", label: "First" },
            { key: "F1", label: "Help" },
          ];

  return (
    <Screen
      statusKeys={statusKeys}
      title={title}
      message={msg}
      messageKind={msgKind}
      left={company ? `Co:${company.companyNo}` : undefined}
      right={property ? `Pro:${property.proNo}` : undefined}
    >
      {/* ── Company search ─────────────────────────────── */}
      {phase === "co-search" && (
        <div className="dos-main-wrap">
          <div className="dos-menu-frame" style={{ minWidth: "48ch" }}>
            <div className="menu-header"> Search Company </div>
            <div className="menu-body" style={{ padding: "0.8em 2ch" }}>
              <div className="dos-form">
                <DotField label="Company NO" width={16}>
                  <input
                    className="dos-input w15"
                    value={coField === "no" ? query : ""}
                    onFocus={() => {
                      setCoField("no");
                      setQuery("");
                    }}
                    onChange={(e) => {
                      setCoField("no");
                      setQuery(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        setCoField("no");
                        searchCompanies(
                          coField === "no" ? query : e.currentTarget.value
                        );
                      }
                    }}
                    autoFocus={coField === "no"}
                    placeholder="? = first"
                  />
                </DotField>
                <DotField label="Company Name" width={16}>
                  <input
                    className="dos-input w30"
                    value={coField === "name" ? query : ""}
                    onFocus={() => {
                      setCoField("name");
                      setQuery("");
                    }}
                    onChange={(e) => {
                      setCoField("name");
                      setQuery(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        searchCompanies(e.currentTarget.value);
                      }
                    }}
                  />
                </DotField>
                <DotField label="Company Phone" width={16}>
                  <input
                    className="dos-input w15"
                    value={coField === "phone" ? query : ""}
                    onFocus={() => {
                      setCoField("phone");
                      setQuery("");
                    }}
                    onChange={(e) => {
                      setCoField("phone");
                      setQuery(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        searchCompanies(e.currentTarget.value);
                      }
                    }}
                    placeholder="(999)999-9999"
                  />
                </DotField>
              </div>
              <div
                style={{
                  marginTop: "0.8em",
                  color: "var(--dos-yellow)",
                  fontSize: "0.9em",
                }}
              >
                Type value + Enter &nbsp;|&nbsp; ? = list all &nbsp;|&nbsp; Esc
                = main menu
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Company browse ─────────────────────────────── */}
      {phase === "co-browse" && (
        <div className="dos-browse">
          <div className="dos-browse-header">
            {"Company NO...Company Name.......................Phone........"}
          </div>
          <div className="dos-browse-body">
            {companies.map((c, i) => (
              <button
                key={c.companyNo}
                className={`dos-row ${i === coBrowse.index ? "selected" : ""}`}
                onMouseEnter={() => coBrowse.setIndex(i)}
                onClick={() => selectCompany(c)}
                onDoubleClick={() => selectCompany(c)}
              >
                {padR(c.companyNo, 12)}
                {padR(c.name, 35)}
                {padR(c.phone, 13)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Property search ────────────────────────────── */}
      {phase === "pr-search" && company && (
        <div className="dos-main-wrap">
          <div className="dos-menu-frame" style={{ minWidth: "52ch" }}>
            <div className="menu-header">
              {" "}
              {company.companyNo} {company.name.slice(0, 28)} — Property{" "}
            </div>
            <div className="menu-body" style={{ padding: "0.8em 2ch" }}>
              <div className="dos-form">
                <DotField label="Property NO" width={16}>
                  <input
                    className="dos-input w10"
                    value={prField === "no" ? query : ""}
                    onFocus={() => {
                      setPrField("no");
                      setQuery("");
                    }}
                    onChange={(e) => {
                      setPrField("no");
                      setQuery(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        searchProperties(e.currentTarget.value);
                      }
                    }}
                    autoFocus
                    placeholder="? = first"
                  />
                </DotField>
                <DotField label="Property Name" width={16}>
                  <input
                    className="dos-input w30"
                    value={prField === "name" ? query : ""}
                    onFocus={() => {
                      setPrField("name");
                      setQuery("");
                    }}
                    onChange={(e) => {
                      setPrField("name");
                      setQuery(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        searchProperties(e.currentTarget.value);
                      }
                    }}
                  />
                </DotField>
                <DotField label="Property Phone" width={16}>
                  <input
                    className="dos-input w15"
                    value={prField === "phone" ? query : ""}
                    onFocus={() => {
                      setPrField("phone");
                      setQuery("");
                    }}
                    onChange={(e) => {
                      setPrField("phone");
                      setQuery(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        searchProperties(e.currentTarget.value);
                      }
                    }}
                  />
                </DotField>
                <DotField label="Property Street" width={16}>
                  <input
                    className="dos-input w30"
                    value={prField === "street" ? query : ""}
                    onFocus={() => {
                      setPrField("street");
                      setQuery("");
                    }}
                    onChange={(e) => {
                      setPrField("street");
                      setQuery(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        searchProperties(e.currentTarget.value);
                      }
                    }}
                  />
                </DotField>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Property browse ────────────────────────────── */}
      {phase === "pr-browse" && (
        <div className="dos-browse">
          <div className="dos-browse-header">
            {"Property NO..Property Name......................Phone........"}
          </div>
          <div className="dos-browse-body">
            {properties.map((p, i) => (
              <button
                key={p.proNo}
                className={`dos-row ${i === prBrowse.index ? "selected" : ""}`}
                onMouseEnter={() => prBrowse.setIndex(i)}
                onClick={() => selectProperty(p)}
              >
                {padR(p.proNo, 12)}
                {padR(p.name, 35)}
                {padR(p.phone, 13)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Company edit form ──────────────────────────── */}
      {phase === "co-edit" && editCo && (
        <Dialog
          title={
            isNew ? "Company Information" : "Detaill Company Information"
          }
          foot="Esc=Cancel, Ctrl-W=Save & Exit, Edit=Arrow_Key"
        >
          <div className="dos-form">
            <DotField label="Company NO" width={14}>
              <input
                className="dos-input w5"
                value={editCo.companyNo}
                disabled={!isNew}
                onChange={(e) =>
                  setEditCo({ ...editCo, companyNo: e.target.value })
                }
                autoFocus
              />
            </DotField>
            <DotField label="Company Name" width={14}>
              <input
                className="dos-input w30"
                value={editCo.name}
                onChange={(e) => setEditCo({ ...editCo, name: e.target.value })}
              />
            </DotField>
            <DotField label="Class" width={14}>
              <input
                className="dos-input w4"
                value={editCo.class}
                onChange={(e) =>
                  setEditCo({ ...editCo, class: e.target.value })
                }
              />
            </DotField>
            <DotField label="Street" width={14}>
              <input
                className="dos-input w30"
                value={editCo.street}
                onChange={(e) =>
                  setEditCo({ ...editCo, street: e.target.value })
                }
              />
            </DotField>
            <DotField label="City" width={14}>
              <input
                className="dos-input w15"
                value={editCo.city}
                onChange={(e) => setEditCo({ ...editCo, city: e.target.value })}
              />
            </DotField>
            <div className="dos-form-row">
              <DotField label="Sta" width={5}>
                <input
                  className="dos-input w4"
                  value={editCo.state}
                  onChange={(e) =>
                    setEditCo({ ...editCo, state: e.target.value })
                  }
                />
              </DotField>
              <DotField label="Zip" width={5}>
                <input
                  className="dos-input w10"
                  value={editCo.zip}
                  onChange={(e) =>
                    setEditCo({ ...editCo, zip: e.target.value })
                  }
                />
              </DotField>
            </div>
            <DotField label="Phone1" width={14}>
              <input
                className="dos-input w15"
                value={editCo.phone}
                onChange={(e) =>
                  setEditCo({ ...editCo, phone: e.target.value })
                }
              />
            </DotField>
            <DotField label="Phone2" width={14}>
              <input
                className="dos-input w15"
                value={editCo.phone2}
                onChange={(e) =>
                  setEditCo({ ...editCo, phone2: e.target.value })
                }
              />
            </DotField>
            <DotField label="Beeper" width={14}>
              <input
                className="dos-input w15"
                value={editCo.phone3}
                onChange={(e) =>
                  setEditCo({ ...editCo, phone3: e.target.value })
                }
              />
            </DotField>
            <DotField label="Fax NO" width={14}>
              <input
                className="dos-input w15"
                value={editCo.phone4}
                onChange={(e) =>
                  setEditCo({ ...editCo, phone4: e.target.value })
                }
              />
            </DotField>
            <DotField label="Contact" width={14}>
              <input
                className="dos-input w30"
                value={editCo.contact}
                onChange={(e) =>
                  setEditCo({ ...editCo, contact: e.target.value })
                }
              />
            </DotField>
          </div>
        </Dialog>
      )}

      {/* ── Property edit form ─────────────────────────── */}
      {phase === "pr-edit" && editPr && (
        <Dialog
          title={
            isNew ? "Property Information" : "Detaill Property Information"
          }
          wide
          foot="Esc=Cancel, Ctrl-W=Save & Exit, Edit=Arrow_Key"
        >
          <div className="dos-form">
            <DotField label="Property NO" width={14}>
              <input
                className="dos-input w5"
                value={editPr.proNo}
                disabled={!isNew}
                onChange={(e) =>
                  setEditPr({ ...editPr, proNo: e.target.value })
                }
                autoFocus
              />
            </DotField>
            <DotField label="PropertyName" width={14}>
              <input
                className="dos-input w30"
                value={editPr.name}
                onChange={(e) => setEditPr({ ...editPr, name: e.target.value })}
              />
            </DotField>
            <DotField label="Class" width={14}>
              <input
                className="dos-input w4"
                value={editPr.class}
                onChange={(e) =>
                  setEditPr({ ...editPr, class: e.target.value })
                }
              />
            </DotField>
            <DotField label="Street" width={14}>
              <input
                className="dos-input w30"
                value={editPr.street}
                onChange={(e) =>
                  setEditPr({ ...editPr, street: e.target.value })
                }
              />
            </DotField>
            <DotField label="City" width={14}>
              <input
                className="dos-input w15"
                value={editPr.city}
                onChange={(e) => setEditPr({ ...editPr, city: e.target.value })}
              />
            </DotField>
            <div className="dos-form-row">
              <DotField label="Sta" width={5}>
                <input
                  className="dos-input w4"
                  value={editPr.state}
                  onChange={(e) =>
                    setEditPr({ ...editPr, state: e.target.value })
                  }
                />
              </DotField>
              <DotField label="Zip" width={5}>
                <input
                  className="dos-input w10"
                  value={editPr.zip}
                  onChange={(e) =>
                    setEditPr({ ...editPr, zip: e.target.value })
                  }
                />
              </DotField>
            </div>
            <DotField label="Phone1" width={14}>
              <input
                className="dos-input w15"
                value={editPr.phone}
                onChange={(e) =>
                  setEditPr({ ...editPr, phone: e.target.value })
                }
              />
            </DotField>
            <DotField label="Phone2" width={14}>
              <input
                className="dos-input w15"
                value={editPr.phone2}
                onChange={(e) =>
                  setEditPr({ ...editPr, phone2: e.target.value })
                }
              />
            </DotField>
            <DotField label="Contact" width={14}>
              <input
                className="dos-input w20"
                value={editPr.manager || editPr.contact}
                onChange={(e) =>
                  setEditPr({
                    ...editPr,
                    manager: e.target.value,
                    contact: e.target.value,
                  })
                }
              />
            </DotField>
            <DotField label="Key" width={14}>
              <input
                className="dos-input w12"
                value={editPr.keyInfo}
                onChange={(e) =>
                  setEditPr({ ...editPr, keyInfo: e.target.value })
                }
              />
            </DotField>
            <DotField label="Time" width={14}>
              <input
                className="dos-input w15"
                value={editPr.paintTime}
                onChange={(e) =>
                  setEditPr({ ...editPr, paintTime: e.target.value })
                }
              />
            </DotField>
            <DotField label="PageMap" width={14}>
              <input
                className="dos-input w12"
                value={editPr.pageMap}
                onChange={(e) =>
                  setEditPr({ ...editPr, pageMap: e.target.value })
                }
              />
            </DotField>
            <DotField label="Comment" width={14}>
              <input
                className="dos-input w40"
                value={editPr.comment1}
                onChange={(e) =>
                  setEditPr({ ...editPr, comment1: e.target.value })
                }
              />
            </DotField>
          </div>
        </Dialog>
      )}

      {askAdd && (
        <Prompt
          question={
            editPr
              ? "Do you want Add Property(Y/N) ?"
              : "Do you want Add Company (Y/N) ?"
          }
          onYes={() => {
            setAskAdd(false);
            if (editPr) setPhase("pr-edit");
            else setPhase("co-edit");
          }}
          onNo={() => {
            setAskAdd(false);
            setEditCo(null);
            setEditPr(null);
          }}
        />
      )}
      {help && <HelpOverlay onClose={() => setHelp(false)} />}
    </Screen>
  );
}
