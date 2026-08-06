/**
 * Invoice Process after Company+Property selected.
 * Original: browse invoices for site; Ins=new (date, work order# or manual);
 * form fields match SALES2 labels; lines from SALES1 / job codes.
 */
import { useCallback, useEffect, useState } from "react";
import {
  api,
  Company,
  Property,
  Invoice,
  InvoiceWithLines,
  Employee,
  WorkType,
  emptyInvoice,
  emptyInvoiceLine,
  emptyWorkType,
} from "../../api";
import { useBrowseIndex, useDosKeys } from "../../dos/hooks";
import {
  Screen,
  Dialog,
  Prompt,
  HelpOverlay,
} from "../../dos/Shell";
import { DotField } from "../../dos/Field";
import { padR, padL, money, fmtDate, today } from "../../dos/utils";
import {
  printInvoiceOnTemplate,
  downloadInvoicePdf,
} from "../../lib/invoicePrint";

type Mode = "browse" | "new-prompt" | "edit";

export function InvoiceProcess({
  company,
  property,
  onBack,
}: {
  company: Company;
  property: Property;
  onBack: () => void;
}) {
  const [rows, setRows] = useState<Invoice[]>([]);
  const [mode, setMode] = useState<Mode>("browse");
  const [editing, setEditing] = useState<InvoiceWithLines | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
  const [invDate, setInvDate] = useState(today());
  const [orderNo, setOrderNo] = useState("");
  const [msg, setMsg] = useState(
    "Ins=Add  Ctrl-Home=Edit  Del=Void  Esc=Exit"
  );
  const [msgKind, setMsgKind] = useState<"default" | "error" | "info">(
    "default"
  );
  const [voidAsk, setVoidAsk] = useState(false);
  const [confirmData, setConfirmData] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [voidWoRetry, setVoidWoRetry] = useState(false);
  const [addWtAsk, setAddWtAsk] = useState<string | null>(null);
  const [pendingWtLine, setPendingWtLine] = useState<number | null>(null);
  const [help, setHelp] = useState(false);
  const { index, setIndex, up, down, pageUp, pageDown, home } =
    useBrowseIndex(rows.length);

  const load = useCallback(async () => {
    const data = await api.listInvoices({
      companyNo: company.companyNo,
      limit: 500,
    });
    // filter this property
    const mine = data.filter((i) => i.proNo === property.proNo);
    setRows(mine);
    setMsg(
      mine.length
        ? `${mine.length} invoices  Ins=Add  Enter=Edit  Del=Void  Esc=Back`
        : "No invoices for this property. Press Ins for new invoice."
    );
  }, [company.companyNo, property.proNo]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    document
      .querySelector(".dos-row.selected")
      ?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const current = rows[index] ?? null;

  async function startNew() {
    const [emps, wts] = await Promise.all([
      api.listEmployees({}),
      api.listWorkTypes({}),
    ]);
    setEmployees(emps);
    setWorkTypes(wts);
    setInvDate(today());
    setOrderNo("");
    setMode("new-prompt");
    setMsg("Enter Invoice Date (Esc=Exit) !");
  }

  async function openManual() {
    const inv = emptyInvoice();
    inv.companyNo = company.companyNo;
    inv.proNo = property.proNo;
    inv.salesDate = invDate || today();
    try {
      const sys = await api.getSysdata();
      const days = sys.termsDays || 7;
      const d = new Date(inv.salesDate);
      d.setDate(d.getDate() + days);
      inv.salesDue = d.toISOString().slice(0, 10);
      inv.salesTerm = `Net  ${days} Days`;
    } catch {
      const d = new Date(inv.salesDate);
      d.setDate(d.getDate() + 7);
      inv.salesDue = d.toISOString().slice(0, 10);
      inv.salesTerm = "Net  7 Days";
    }
    setEditing({
      invoice: inv,
      lines: [emptyInvoiceLine(inv, 1)],
    });
    setMode("edit");
    setMsg("Enter Invoice Information (Esc=Exit) !");
  }

  async function tryFromOrder() {
    const no = parseInt(orderNo, 10);
    if (!no) {
      setMsg("--> does not exist ! Do you want Manual Invoice (Y/N) ?");
      setMsgKind("error");
      setConfirmData(true);
      return;
    }
    const [emps, wts, full] = await Promise.all([
      api.listEmployees({}),
      api.listWorkTypes({}),
      api.findWorkOrder(company.companyNo, property.proNo, no),
    ]);
    setEmployees(emps);
    setWorkTypes(wts);

    if (!full) {
      setMsg("--> does not exist ! Do you want Manual Invoice (Y/N) ?");
      setMsgKind("error");
      setConfirmData(true);
      return;
    }
    if (full.order.voided || full.order.status === "V") {
      setMsg("--> Void Work Order ! Retry (Y/N) ?");
      setMsgKind("error");
      setVoidWoRetry(true);
      return;
    }
    if (full.order.proNo !== property.proNo) {
      setMsg("--> Differnt Work Order No ! Retry (Y/N) ?");
      setMsgKind("error");
      setVoidWoRetry(true);
      return;
    }

    const inv = emptyInvoice();
    inv.companyNo = company.companyNo;
    inv.proNo = property.proNo;
    inv.salesDate = invDate || today();
    inv.orderNo = full.order.orderNo;
    inv.orderDate = full.order.orderDate;
    inv.orderMan = full.order.orderMan;
    inv.salesUnit = full.order.orderUnit;
    inv.salesSize = full.order.orderSize;
    inv.custPoNo = full.order.custPoNo;
    inv.remark1 = full.order.remark1;
    inv.remark2 = full.order.remark2;
    try {
      const sys = await api.getSysdata();
      const days = sys.termsDays || 7;
      const d = new Date(inv.salesDate);
      d.setDate(d.getDate() + days);
      inv.salesDue = d.toISOString().slice(0, 10);
      inv.salesTerm = `Net  ${days} Days`;
    } catch {
      const d = new Date(inv.salesDate);
      d.setDate(d.getDate() + 7);
      inv.salesDue = d.toISOString().slice(0, 10);
      inv.salesTerm = "Net  7 Days";
    }

    // Copy work-order lines into invoice lines (original build-invoice path)
    const lines =
      full.lines.length > 0
        ? full.lines.map((l, i) => ({
            ...emptyInvoiceLine(inv, i + 1),
            codeNo: l.codeNo,
            description: l.description,
            workType: l.workType,
            price: l.price,
            workDate: full.order.workDate || inv.salesDate,
          }))
        : [emptyInvoiceLine(inv, 1)];

    setEditing({ invoice: inv, lines });
    setMode("edit");
    setMsg("Enter Invoice Information (Esc=Exit) !");
    setMsgKind("default");
  }

  async function openEdit(inv: Invoice) {
    const [full, emps, wts] = await Promise.all([
      api.getInvoice(inv.companyNo, inv.proNo, inv.salesDate, inv.invoice),
      api.listEmployees({}),
      api.listWorkTypes({}),
    ]);
    setEmployees(emps);
    setWorkTypes(wts);
    if (full) {
      setEditing(full);
      setMode("edit");
      setMsg(
        full.invoice.voided
          ? "*** V O I D  I N V O I C E ***"
          : `Invoice #${full.invoice.invoice}  Ctrl-W=Save  Esc=Exit`
      );
    }
  }

  async function save() {
    if (!editing) return;
    const inv = editing.invoice;
    if (!inv.salesDate) {
      setMsg("--> Invoice Date required !!");
      setMsgKind("error");
      return;
    }
    setConfirmSave(true);
    setMsg("Is This Data Correct ? (Y/N)");
  }

  async function doSave() {
    if (!editing) return;
    const inv = editing.invoice;
    try {
      const no = await api.saveInvoice({
        invoice: {
          ...inv,
          companyNo: company.companyNo,
          proNo: property.proNo,
        },
        lines: editing.lines.map((l, i) => ({
          ...l,
          companyNo: company.companyNo,
          proNo: property.proNo,
          salesDate: inv.salesDate,
          lineNo: i + 1,
          empPrice:
            l.empPrice || (l.price * (l.commission || 65)) / 100,
        })),
      });
      setEditing(null);
      setConfirmSave(false);
      setMode("browse");
      setMsg(`Invoice #${no} saved.`);
      setMsgKind("info");
      await load();
    } catch (e) {
      setConfirmSave(false);
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

  /** End = Print on the official invoice_template.pdf form */
  async function printCurrent() {
    try {
      let inv = editing?.invoice ?? current;
      let lines = editing?.lines ?? [];
      if (!inv) {
        setMsg("--> Select or open an invoice to print !!");
        setMsgKind("error");
        return;
      }
      if (!editing && current) {
        const full = await api.getInvoice(
          current.companyNo,
          current.proNo,
          current.salesDate,
          current.invoice
        );
        if (!full) {
          setMsg("--> does not exist in Invoice File !!!");
          setMsgKind("error");
          return;
        }
        inv = full.invoice;
        lines = full.lines;
      }
      setMsg(`Printing Invoice #${inv.invoice} on form template...`);
      setMsgKind("info");
      await printInvoiceOnTemplate({
        company,
        property,
        invoice: inv,
        lines,
      });
      setMsg(`Invoice #${inv.invoice} sent to printer form.`);
      setMsgKind("info");
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
      // Fallback download if popup blocked
      try {
        if (current || editing) {
          const inv = editing?.invoice ?? current!;
          const full =
            editing ??
            (await api.getInvoice(
              inv.companyNo,
              inv.proNo,
              inv.salesDate,
              inv.invoice
            ));
          if (full && "lines" in full) {
            await downloadInvoicePdf({
              company,
              property,
              invoice: full.invoice ?? inv,
              lines: full.lines,
            });
            setMsg("Print window blocked — PDF downloaded instead.");
          }
        }
      } catch {
        /* already reported */
      }
    }
  }

  useDosKeys({
    forceNav: mode === "browse",
    onEscape: () => {
      if (help) setHelp(false);
      else if (voidAsk) setVoidAsk(false);
      else if (confirmData) setConfirmData(false);
      else if (confirmSave) setConfirmSave(false);
      else if (voidWoRetry) setVoidWoRetry(false);
      else if (addWtAsk) {
        setAddWtAsk(null);
        setPendingWtLine(null);
      } else if (mode === "edit") {
        setEditing(null);
        setMode("browse");
        setMsg("Ins=Add  Enter=Edit  Del=Void  Esc=Back");
      } else if (mode === "new-prompt") {
        setMode("browse");
        setMsg("Ins=Add  Enter=Edit  Del=Void  Esc=Back");
      } else onBack();
    },
    onF1: () => setHelp(true),
    onInsert: () => {
      if (mode === "browse") startNew();
    },
    onEnter: () => {
      if (mode === "browse" && current) openEdit(current);
    },
    onCtrlHome: () => {
      if (mode === "browse" && current) openEdit(current);
    },
    onDelete: () => {
      if (mode === "browse" && current && !current.voided) setVoidAsk(true);
    },
    onArrowUp: mode === "browse" ? up : undefined,
    onArrowDown: mode === "browse" ? down : undefined,
    onPageUp: mode === "browse" ? pageUp : undefined,
    onPageDown: mode === "browse" ? pageDown : undefined,
    onHome: mode === "browse" ? home : undefined,
    onEnd: () => {
      printCurrent();
    },
    onCtrlW: () => {
      if (mode === "edit") save();
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
      if (confirmSave) {
        if (ch === "y" || ch === "Y") {
          doSave();
          return true;
        }
        if (ch === "n" || ch === "N") {
          setConfirmSave(false);
          return true;
        }
      }
      if (confirmData) {
        if (ch === "y" || ch === "Y") {
          setConfirmData(false);
          openManual();
          return true;
        }
        if (ch === "n" || ch === "N") {
          setConfirmData(false);
          setMsgKind("default");
          return true;
        }
      }
      if (voidWoRetry) {
        if (ch === "y" || ch === "Y") {
          setVoidWoRetry(false);
          setOrderNo("");
          setMsg("Enter Work Order No (Esc=Exit) !");
          setMsgKind("default");
          return true;
        }
        if (ch === "n" || ch === "N") {
          setVoidWoRetry(false);
          setMode("browse");
          return true;
        }
      }
      if (addWtAsk) {
        if (ch === "y" || ch === "Y") {
          (async () => {
            const wt = emptyWorkType();
            wt.codeNo = addWtAsk;
            wt.workType = "P";
            await api.saveWorkType(wt);
            setWorkTypes(await api.listWorkTypes({}));
            if (editing && pendingWtLine != null) {
              const lines = [...editing.lines];
              lines[pendingWtLine] = {
                ...lines[pendingWtLine],
                codeNo: addWtAsk,
              };
              setEditing({ ...editing, lines });
            }
            setAddWtAsk(null);
            setPendingWtLine(null);
            setMsgKind("default");
            setMsg("Worktype added — enter description");
          })();
          return true;
        }
        if (ch === "n" || ch === "N") {
          setAddWtAsk(null);
          setPendingWtLine(null);
          return true;
        }
      }
      return false;
    },
  });

  const lineTotal =
    editing?.lines.reduce((s, l) => s + (l.price || 0), 0) ?? 0;

  return (
    <Screen
      statusKeys={
        mode === "edit" || mode === "new-prompt"
          ? [
              { key: "Esc", label: "Cancel" },
              { key: "Ctrl-W", label: "Save" },
              { key: "End", label: "Print Form" },
              { key: "F1", label: "Help" },
            ]
          : [
              { key: "Esc", label: "Exit" },
              { key: "Ins", label: "Add" },
              { key: "Ctrl-Home", label: "Edit" },
              { key: "Del", label: "Void" },
              { key: "End", label: "Print Form" },
              { key: "PgUp", label: "Prev" },
              { key: "PgDn", label: "Next" },
              { key: "F1", label: "Help" },
            ]
      }
      title=" Invoice Process "
      message={msg}
      messageKind={msgKind}
      left={`${company.companyNo}/${property.proNo}`}
      right={property.name.slice(0, 24)}
    >
      {mode === "browse" && (
        <div className="dos-browse">
          <div
            style={{
              color: "var(--dos-cyan-bright)",
              padding: "0.2em 0.5ch",
              whiteSpace: "pre",
            }}
          >
            {padR(company.name, 30)} {padR(property.street, 30)}
            {"\n"}
            {padR(property.name, 30)} Unit keys: {property.keyInfo}{" "}
            {property.paintTime}
          </div>
          <div className="dos-browse-header">
            {"Inv#  Inv_Date  Unit/Size          Total      Paid     Balance St"}
          </div>
          <div className="dos-browse-body">
            {rows.map((inv, i) => (
              <button
                key={`${inv.invoice}-${inv.salesDate}`}
                className={`dos-row ${i === index ? "selected" : ""} ${inv.voided ? "voided" : ""}`}
                onMouseEnter={() => setIndex(i)}
                onClick={() => {
                  setIndex(i);
                  openEdit(inv);
                }}
              >
                {padL(inv.invoice, 5)}{" "}
                {padR(fmtDate(inv.salesDate), 10)}{" "}
                {padR(
                  `${inv.salesUnit}${inv.salesSize ? "/" + inv.salesSize : ""}`,
                  16
                )}{" "}
                {padL(money(inv.salesTotal), 10)}{" "}
                {padL(money(inv.payTotal), 9)}{" "}
                {padL(money(inv.balance), 10)}{" "}
                {inv.voided ? "V" : inv.balance <= 0 ? "*" : " "}
              </button>
            ))}
            {rows.length === 0 && (
              <div className="dos-row" style={{ color: "var(--dos-yellow)" }}>
                {"  (no invoices — press Ins)"}
              </div>
            )}
          </div>
        </div>
      )}

      {mode === "new-prompt" && (
        <div className="dos-main-wrap">
          <div className="dos-menu-frame" style={{ minWidth: "44ch" }}>
            <div className="menu-header"> New Invoice </div>
            <div className="menu-body" style={{ padding: "1em 2ch" }}>
              <div className="dos-form">
                <DotField label="Invoice Date" width={18}>
                  <input
                    className="dos-input w12"
                    type="date"
                    value={invDate}
                    onChange={(e) => setInvDate(e.target.value)}
                    autoFocus
                  />
                </DotField>
                <DotField label="Work Order No" width={18}>
                  <input
                    className="dos-input w8"
                    value={orderNo}
                    onChange={(e) => setOrderNo(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        tryFromOrder();
                      }
                    }}
                    placeholder="blank=manual"
                  />
                </DotField>
              </div>
              <div style={{ marginTop: "1em", color: "var(--dos-yellow)" }}>
                Enter Work Order No, or leave blank + Enter for Manual Invoice
              </div>
              <div style={{ marginTop: "0.8em" }}>
                <button className="dos-btn" onClick={tryFromOrder}>
                  Continue
                </button>{" "}
                <button className="dos-btn" onClick={openManual}>
                  Manual Invoice
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {mode === "edit" && editing && (
        <Dialog
          title={
            editing.invoice.voided
              ? "*** V O I D  I N V O I C E ***"
              : editing.invoice.invoice
                ? `Invoice No........ ${editing.invoice.invoice}`
                : "Enter Invoice Information"
          }
          wide
          red={editing.invoice.voided}
          foot="Esc=Cancel, Ctrl-W=Save & Exit, End=Print on Form"
        >
          <div className="dos-form">
            <div style={{ color: "var(--dos-cyan-bright)", marginBottom: "0.4em" }}>
              Company No.: {company.companyNo} {company.name}
              <br />
              {property.proNo} {property.name} — {property.street}
            </div>
            <div className="dos-form-row">
              <DotField label="Invoice Date" width={14}>
                <input
                  className="dos-input w12"
                  type="date"
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
                <input
                  className="dos-input w12"
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
              <DotField label="Order No" width={14}>
                <input
                  className="dos-input w8"
                  type="number"
                  value={editing.invoice.orderNo || ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      invoice: {
                        ...editing.invoice,
                        orderNo: parseInt(e.target.value, 10) || 0,
                      },
                    })
                  }
                />
              </DotField>
              <DotField label="Order Date" width={12}>
                <input
                  className="dos-input w12"
                  type="date"
                  value={editing.invoice.orderDate || ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      invoice: {
                        ...editing.invoice,
                        orderDate: e.target.value || null,
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
            <div className="dos-form-row">
              <DotField label="Deposit" width={14}>
                <input
                  className="dos-input w10 num"
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
              </DotField>
              <DotField label="Deposit Ref" width={12}>
                <input
                  className="dos-input w12"
                  value={editing.invoice.depositRef}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      invoice: {
                        ...editing.invoice,
                        depositRef: e.target.value,
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
                  gap: "0.4ch",
                  marginBottom: "0.12em",
                  alignItems: "center",
                }}
              >
                <input
                  className="dos-input"
                  style={{ width: "7ch" }}
                  value={line.codeNo}
                  title="Enter Job Code No (Esc=Exit, * = Command Input) !"
                  list="job-codes"
                  onChange={(e) => {
                    const lines = [...editing.lines];
                    lines[idx] = { ...line, codeNo: e.target.value };
                    setEditing({ ...editing, lines });
                  }}
                  onBlur={(e) => {
                    const code = e.target.value.trim();
                    if (!code || code === "*") return;
                    const wt = workTypes.find(
                      (w) => w.codeNo.toUpperCase() === code.toUpperCase()
                    );
                    if (!wt) {
                      setPendingWtLine(idx);
                      setAddWtAsk(code.toUpperCase());
                      setMsg(
                        `${code} --> does not exist !! Do you want Add Worktype(Y/N)?`
                      );
                      setMsgKind("error");
                      return;
                    }
                    const lines = [...editing.lines];
                    lines[idx] = {
                      ...line,
                      codeNo: wt.codeNo,
                      description: wt.description || line.description,
                      workType: wt.workType || line.workType,
                      price: line.price || wt.price,
                    };
                    setEditing({ ...editing, lines });
                  }}
                />
                <datalist id="job-codes">
                  <option value="*" />
                  {workTypes.map((w) => (
                    <option key={w.codeNo} value={w.codeNo} />
                  ))}
                </datalist>
                <input
                  className="dos-input"
                  style={{ flex: 1 }}
                  value={line.description}
                  onChange={(e) => {
                    const lines = [...editing.lines];
                    lines[idx] = { ...line, description: e.target.value };
                    setEditing({ ...editing, lines });
                  }}
                  placeholder="* = free description"
                />
                <input
                  className="dos-input w12"
                  type="date"
                  value={line.workDate || invDate}
                  onChange={(e) => {
                    const lines = [...editing.lines];
                    lines[idx] = { ...line, workDate: e.target.value };
                    setEditing({ ...editing, lines });
                  }}
                />
                <select
                  className="dos-select"
                  style={{ width: "6ch" }}
                  title="Work Person"
                  value={line.empNo}
                  onChange={(e) => {
                    const emp = employees.find(
                      (x) => x.empNo === e.target.value
                    );
                    const lines = [...editing.lines];
                    lines[idx] = {
                      ...line,
                      empNo: e.target.value,
                      commission: emp?.commission ?? line.commission,
                      empPrice:
                        (line.price * (emp?.commission ?? line.commission)) /
                        100,
                    };
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
                    const price = parseFloat(e.target.value) || 0;
                    const lines = [...editing.lines];
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
                + Line
              </button>
              <span
                style={{
                  float: "right",
                  color: "var(--dos-yellow)",
                  fontWeight: "bold",
                }}
              >
                Invoice Total : {money(lineTotal)}
                {"  "}Balance:{" "}
                {money(
                  lineTotal -
                    editing.invoice.salesPay -
                    editing.invoice.payTotal
                )}
                {"  "}
                <button
                  type="button"
                  className="dos-btn"
                  onClick={() => printCurrent()}
                  title="Print on invoice_template.pdf (End)"
                >
                  Print Form (End)
                </button>
              </span>
            </div>
            <div
              style={{
                marginTop: "0.6em",
                color: "var(--dos-cyan)",
                fontSize: "0.85em",
              }}
            >
              1.5% interest charged on past due accounts over 30 days.
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
      {confirmData && (
        <Prompt
          question="--> does not exist ! Do you want Manual Invoice (Y/N) ?"
          onYes={() => {
            setConfirmData(false);
            openManual();
          }}
          onNo={() => setConfirmData(false)}
        />
      )}
      {confirmSave && (
        <Prompt
          question="Is This Data Correct ? (Y/N)"
          onYes={doSave}
          onNo={() => setConfirmSave(false)}
        />
      )}
      {voidWoRetry && (
        <Prompt
          question={msg.includes("Differnt") ? "--> Differnt Work Order No ! Retry (Y/N) ?" : "--> Void Work Order ! Retry (Y/N) ?"}
          onYes={() => {
            setVoidWoRetry(false);
            setOrderNo("");
            setMsg("Enter Work Order No (Esc=Exit) !");
            setMsgKind("default");
          }}
          onNo={() => {
            setVoidWoRetry(false);
            setMode("browse");
          }}
        />
      )}
      {addWtAsk && (
        <Prompt
          question={`${addWtAsk} --> does not exist !! Do you want Add Worktype(Y/N)?`}
          onYes={async () => {
            const wt = emptyWorkType();
            wt.codeNo = addWtAsk;
            wt.workType = "P";
            await api.saveWorkType(wt);
            setWorkTypes(await api.listWorkTypes({}));
            if (editing && pendingWtLine != null) {
              const lines = [...editing.lines];
              lines[pendingWtLine] = {
                ...lines[pendingWtLine],
                codeNo: addWtAsk,
              };
              setEditing({ ...editing, lines });
            }
            setAddWtAsk(null);
            setPendingWtLine(null);
            setMsgKind("default");
            setMsg("Worktype added — enter description");
          }}
          onNo={() => {
            setAddWtAsk(null);
            setPendingWtLine(null);
          }}
        />
      )}
      {help && <HelpOverlay onClose={() => setHelp(false)} />}
    </Screen>
  );
}
