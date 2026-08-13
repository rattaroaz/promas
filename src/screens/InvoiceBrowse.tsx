import { useCallback, useEffect, useState } from "react";
import {
  api,
  Invoice,
  InvoiceWithLines,
  Company,
  Property,
  Employee,
  WorkType,
  emptyInvoice,
  emptyInvoiceLine,
} from "../api";
import { useBrowseIndex, useDosKeys } from "../dos/hooks";
import {
  Screen,
  BROWSE_KEYS,
  Dialog,
  FORM_KEYS,
  Prompt,
  HelpOverlay,
} from "../dos/Shell";
import { DotField } from "../dos/Field";
import { DateInput } from "../dos/DateInput";
import { padR, padL, money, fmtDate, today } from "../dos/utils";

export function InvoiceBrowse({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<Invoice[]>([]);
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [editing, setEditing] = useState<InvoiceWithLines | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
  const [msg, setMsg] = useState(
    "Ins=Add  Ctrl-Home=Edit  Del=Void  Esc=Exit"
  );
  const [msgKind, setMsgKind] = useState<"default" | "error" | "info">("default");
  const [voidAsk, setVoidAsk] = useState(false);
  const [help, setHelp] = useState(false);
  const { index, setIndex, up, down, pageUp, pageDown, home, end } =
    useBrowseIndex(rows.length);

  const load = useCallback(async () => {
    try {
      const data = await api.listInvoices({
        search,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        limit: 500,
      });
      setRows(data);
      setMsg(
        data.length
          ? `${data.length} invoices  —  Ins=Add  Enter=View  Del=Void  Esc=Exit`
          : "No invoices. Press Ins for Manual Invoice."
      );
      setMsgKind("default");
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    }
  }, [search, fromDate, toDate]);

  useEffect(() => {
    const t = setTimeout(load, 150);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    document.querySelector(".dos-row.selected")?.scrollIntoView({
      block: "nearest",
    });
  }, [index]);

  const current = rows[index] ?? null;

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
    setMsg("Enter Invoice Information (Esc=Cancel, Ctrl-W=Save & Exit)");
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
    if (full) {
      setEditing(full);
      setMsg(
        full.invoice.voided
          ? "*** V O I D  I N V O I C E ***"
          : `Invoice #${full.invoice.invoice}  —  Esc=Exit  Ctrl-W=Save`
      );
    }
  }

  useDosKeys({
    forceNav: !editing,
    onEscape: () => {
      if (help) setHelp(false);
      else if (voidAsk) setVoidAsk(false);
      else if (editing) {
        setEditing(null);
        setMsg("Ins=Add  Enter=View  Del=Void  Esc=Exit");
      } else onBack();
    },
    onF1: () => setHelp(true),
    onInsert: () => {
      if (!editing) openNew();
    },
    onEnter: () => {
      if (!editing && current) openEdit(current);
    },
    onCtrlHome: () => {
      if (!editing && current) openEdit(current);
    },
    onDelete: () => {
      if (!editing && current && !current.voided) setVoidAsk(true);
    },
    onArrowUp: !editing ? up : undefined,
    onArrowDown: !editing ? down : undefined,
    onPageUp: !editing ? pageUp : undefined,
    onPageDown: !editing ? pageDown : undefined,
    onHome: !editing ? home : undefined,
    onEnd: !editing ? () => window.print() : end,
    onCtrlW: async () => {
      if (editing) await save();
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
  });

  async function save() {
    if (!editing) return;
    const inv = editing.invoice;
    if (!inv.companyNo || !inv.proNo || !inv.salesDate) {
      setMsg("--> Company, Property, Date required !!");
      setMsgKind("error");
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
      setMsg(`Invoice #${no} saved.`);
      setMsgKind("info");
      await load();
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    }
  }

  async function doVoid() {
    if (!current) return;
    await api.voidInvoice(
      current.companyNo,
      current.proNo,
      current.salesDate,
      current.invoice
    );
    setVoidAsk(false);
    setMsg(`*** Void Invoice ***  #${current.invoice}`);
    await load();
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
    });
  }

  const lineTotal =
    editing?.lines.reduce((s, l) => s + (l.price || 0), 0) ?? 0;

  return (
    <Screen
      statusKeys={editing ? FORM_KEYS : BROWSE_KEYS}
      title=" Invoice Process "
      message={msg}
      messageKind={msgKind}
    >
      {!editing && (
        <>
          <div className="dos-searchline">
            <label>Search:</label>
            <input
              className="dos-input"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setIndex(0);
              }}
              placeholder="Invoice#, Company, Address, Unit, PO"
            />
            <label>From:</label>
            <DateInput
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
            <label>To:</label>
            <DateInput
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
          <div className="dos-browse">
            <div className="dos-browse-header">
              {"Inv#  Inv_Date  Co#  Pro Unit/Size          Inv_Amount   PayTotal    Balance"}
            </div>
            <div className="dos-browse-body">
              {rows.map((inv, i) => (
                <button
                  key={`${inv.companyNo}-${inv.invoice}-${inv.salesDate}`}
                  className={`dos-row ${i === index ? "selected" : ""} ${inv.voided ? "voided" : ""}`}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => {
                    setIndex(i);
                    openEdit(inv);
                  }}
                >
                  {padL(inv.invoice, 5)}{" "}
                  {padR(fmtDate(inv.salesDate), 10)}{" "}
                  {padR(inv.companyNo, 4)}{" "}
                  {padR(inv.proNo, 3)}{" "}
                  {padR(
                    `${inv.salesUnit}${inv.salesSize ? "/" + inv.salesSize : ""}`,
                    16
                  )}{" "}
                  {padL(money(inv.salesTotal), 11)}{" "}
                  {padL(money(inv.payTotal), 10)}{" "}
                  {padL(money(inv.balance), 10)}
                  {inv.voided ? " V" : inv.balance <= 0 ? " *" : "  "}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {editing && (
        <Dialog
          title={
            editing.invoice.invoice
              ? `Invoice No........ ${editing.invoice.invoice}`
              : "Enter Invoice Information"
          }
          wide
          foot="Esc=Cancel, Ctrl-W=Save & Exit"
          red={editing.invoice.voided}
        >
          <div className="dos-form">
            <div className="dos-form-row">
              <DotField label="Company NO" width={14}>
                <select
                  className="dos-select"
                  value={editing.invoice.companyNo}
                  onChange={(e) => onCompanyChange(e.target.value)}
                >
                  <option value="">----</option>
                  {companies.map((c) => (
                    <option key={c.companyNo} value={c.companyNo}>
                      {c.companyNo} {c.name}
                    </option>
                  ))}
                </select>
              </DotField>
              <DotField label="Property NO" width={12}>
                <select
                  className="dos-select"
                  value={editing.invoice.proNo}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      invoice: {
                        ...editing.invoice,
                        proNo: e.target.value,
                      },
                    })
                  }
                >
                  <option value="">---</option>
                  {properties.map((p) => (
                    <option key={p.proNo} value={p.proNo}>
                      {p.proNo} {p.name}
                    </option>
                  ))}
                </select>
              </DotField>
            </div>
            <div className="dos-form-row">
              <DotField label="Invoice Date" width={14}>
                <DateInput
                  value={editing.invoice.salesDate}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      invoice: {
                        ...editing.invoice,
                        salesDate: e.target.value,
                      },
                    })
                  }
                />
              </DotField>
              <DotField label="Due Date" width={12}>
                <DateInput
                  allowFutureYears={5}
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
              </DotField>
              <DotField label="Terms" width={8}>
                <input
                  className="dos-input w15"
                  value={editing.invoice.salesTerm}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      invoice: {
                        ...editing.invoice,
                        salesTerm: e.target.value,
                      },
                    })
                  }
                />
              </DotField>
            </div>
            <div className="dos-form-row">
              <DotField label="Unit" width={14}>
                <input
                  className="dos-input w10"
                  value={editing.invoice.salesUnit}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      invoice: {
                        ...editing.invoice,
                        salesUnit: e.target.value,
                      },
                    })
                  }
                />
              </DotField>
              <DotField label="Size" width={8}>
                <input
                  className="dos-input w12"
                  value={editing.invoice.salesSize}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      invoice: {
                        ...editing.invoice,
                        salesSize: e.target.value,
                      },
                    })
                  }
                />
              </DotField>
              <DotField label="Order Person" width={14}>
                <input
                  className="dos-input w12"
                  value={editing.invoice.orderMan}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      invoice: {
                        ...editing.invoice,
                        orderMan: e.target.value,
                      },
                    })
                  }
                />
              </DotField>
              <DotField label="Customer P.O" width={14}>
                <input
                  className="dos-input w12"
                  value={editing.invoice.custPoNo}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      invoice: {
                        ...editing.invoice,
                        custPoNo: e.target.value,
                      },
                    })
                  }
                />
              </DotField>
            </div>

            <div
              style={{
                color: "var(--dos-yellow)",
                margin: "0.5em 0 0.2em",
                whiteSpace: "pre",
              }}
            >
              {"Code# Description                                        WorkDate     Price "}
            </div>
            {editing.lines.map((line, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  gap: "0.5ch",
                  marginBottom: "0.15em",
                  alignItems: "center",
                }}
              >
                <select
                  className="dos-select"
                  style={{ width: "7ch" }}
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
                      price: line.price || wt?.price || 0,
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
                <input
                  className="dos-input"
                  style={{ flex: 1 }}
                  value={line.description}
                  onChange={(e) => {
                    const lines = [...editing.lines];
                    lines[idx] = { ...line, description: e.target.value };
                    setEditing({ ...editing, lines });
                  }}
                />
                <DateInput
                  value={line.workDate || today()}
                  onChange={(e) => {
                    const lines = [...editing.lines];
                    lines[idx] = { ...line, workDate: e.target.value };
                    setEditing({ ...editing, lines });
                  }}
                />
                <select
                  className="dos-select"
                  style={{ width: "6ch" }}
                  value={line.empNo}
                  onChange={(e) => {
                    const lines = [...editing.lines];
                    lines[idx] = { ...line, empNo: e.target.value };
                    setEditing({ ...editing, lines });
                  }}
                >
                  <option value="">---</option>
                  {employees.map((e) => (
                    <option key={e.empNo} value={e.empNo}>
                      {e.empNo}
                    </option>
                  ))}
                </select>
                <input
                  className="dos-input w10 num"
                  type="number"
                  step="0.01"
                  value={line.price}
                  onChange={(e) => {
                    const lines = [...editing.lines];
                    const price = parseFloat(e.target.value) || 0;
                    lines[idx] = {
                      ...line,
                      price,
                      empPrice: (price * line.commission) / 100,
                    };
                    setEditing({ ...editing, lines });
                  }}
                />
                <button
                  className="dos-btn danger"
                  onClick={() =>
                    setEditing({
                      ...editing,
                      lines: editing.lines.filter((_, i) => i !== idx),
                    })
                  }
                >
                  Del
                </button>
              </div>
            ))}
            <div style={{ marginTop: "0.4em" }}>
              <button
                className="dos-btn"
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
                + Line (Ins)
              </button>
              <span
                style={{
                  float: "right",
                  color: "var(--dos-yellow)",
                  fontWeight: "bold",
                }}
              >
                Invoice Total : {money(lineTotal)}
              </span>
            </div>
          </div>
        </Dialog>
      )}

      {voidAsk && (
        <Prompt
          question={`Do you want Void (Y/N) ?  Invoice #${current?.invoice}`}
          onYes={doVoid}
          onNo={() => setVoidAsk(false)}
        />
      )}
      {help && <HelpOverlay onClose={() => setHelp(false)} />}
    </Screen>
  );
}
