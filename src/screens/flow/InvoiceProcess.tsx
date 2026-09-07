/**
 * Invoice Process after Company+Property selected.
 * Browse invoices for the site; Ins or New Invoice opens the entry form
 * with date and next invoice number already filled.
 */
import { useCallback, useEffect, useState } from "react";
import {
  api,
  Company,
  Property,
  Invoice,
  InvoiceLine,
  InvoiceWithLines,
  emptyInvoice,
  emptyInvoiceLine,
} from "../../api";
import { useBrowseIndex, useDosKeys } from "../../dos/hooks";
import {
  Screen,
  Dialog,
  Prompt,
  HelpOverlay,
} from "../../dos/Shell";
import { DotField } from "../../dos/Field";
import { cols, padR, padL, money, fmtDate, today } from "../../dos/utils";
import {
  printInvoiceOnTemplate,
  downloadInvoicePdf,
} from "../../lib/invoicePrint";
import {
  INVOICE_LINE_PRESETS,
  UNIT_SIZE_OPTIONS,
  applyPresetPriceToLine,
  applyPresetPrices,
  blankNewInvoiceLine,
  isListedUnitSize,
  isPresetDescription,
  normalizeUnitSize,
} from "../../lib/invoiceLinePresets";

type Mode = "browse" | "edit";

export function InvoiceProcess({
  company,
  property,
  onBack,
  focusInvoice,
}: {
  company: Company;
  property: Property;
  onBack: () => void;
  focusInvoice?: number;
}) {
  const [rows, setRows] = useState<Invoice[]>([]);
  const [mode, setMode] = useState<Mode>("browse");
  const [editing, setEditing] = useState<InvoiceWithLines | null>(null);
  const [isNewInvoice, setIsNewInvoice] = useState(false);
  const [workPersons, setWorkPersons] = useState<string[]>([]);
  const [paintSupplyCos, setPaintSupplyCos] = useState<string[]>([]);
  const [deleteNameAsk, setDeleteNameAsk] = useState<string | null>(null);
  const [deletePaintAsk, setDeletePaintAsk] = useState<string | null>(null);
  const [msg, setMsg] = useState(
    "Ins=Add  Ctrl-Home=Edit  Del=Void  Esc=Exit"
  );
  const [msgKind, setMsgKind] = useState<"default" | "error" | "info">(
    "default"
  );
  const [voidAsk, setVoidAsk] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [help, setHelp] = useState(false);
  const { index, setIndex, up, down, pageUp, pageDown, home } =
    useBrowseIndex(rows.length);

  const load = useCallback(async () => {
    const data = await api.listInvoices({
      companyNo: company.companyNo,
      proNo: property.proNo,
      includeVoided: true,
      limit: 100000,
    });
    const mine = data.filter((i) => i.proNo === property.proNo);
    setRows(mine);
    if (focusInvoice != null) {
      const i = mine.findIndex((inv) => inv.invoice === focusInvoice);
      if (i >= 0) setIndex(i);
    }
    setMsg(
      mine.length
        ? `${mine.length} invoices  Ins=Add  Enter=Edit  Del=Void  Esc=Back`
        : "No invoices for this property. Press Ins or click New Invoice."
    );
  }, [company.companyNo, property.proNo, focusInvoice, setIndex]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    document
      .querySelector(".dos-row.selected")
      ?.scrollIntoView?.({ block: "nearest" });
  }, [index]);

  const current = rows[index] ?? null;

  async function loadWorkPersons() {
    try {
      setWorkPersons(await api.listWorkPersons());
    } catch {
      setWorkPersons([]);
    }
  }

  async function loadPaintSupplyCos() {
    try {
      setPaintSupplyCos((await api.listPaintSupplyCos()) ?? []);
    } catch {
      setPaintSupplyCos([]);
    }
  }

  async function confirmDeleteWorkPerson() {
    const name = deleteNameAsk;
    if (!name) return;
    try {
      setWorkPersons(await api.deleteWorkPerson(name));
    } catch {
      setWorkPersons((prev) =>
        prev.filter((n) => n.toLowerCase() !== name.toLowerCase())
      );
    }
    if (editing) {
      setEditing({
        ...editing,
        lines: editing.lines.map((l) =>
          l.empNo.trim().toLowerCase() === name.toLowerCase()
            ? { ...l, empNo: "" }
            : l
        ),
      });
    }
    setDeleteNameAsk(null);
  }

  async function rememberWorkPerson(raw: string) {
    const name = raw.trim();
    if (!name) return;
    const listed = workPersons.some(
      (n) => n.toLowerCase() === name.toLowerCase()
    );
    if (listed) return;
    try {
      setWorkPersons(await api.saveWorkPerson(name));
    } catch {
      setWorkPersons((prev) =>
        prev.some((n) => n.toLowerCase() === name.toLowerCase())
          ? prev
          : [...prev, name].sort((a, b) => a.localeCompare(b))
      );
    }
  }

  function listedWorkPerson(name: string) {
    const key = name.trim().toLowerCase();
    return workPersons.find((n) => n.toLowerCase() === key) ?? "";
  }

  function invoiceWorkPerson(lines: InvoiceLine[]) {
    return lines.find((l) => l.empNo.trim())?.empNo ?? "";
  }

  function setInvoiceWorkPerson(name: string) {
    if (!editing) return;
    setEditing({
      ...editing,
      lines: editing.lines.map((l) => ({ ...l, empNo: name })),
    });
  }

  async function confirmDeletePaintSupplyCo() {
    const name = deletePaintAsk;
    if (!name) return;
    try {
      setPaintSupplyCos(await api.deletePaintSupplyCo(name));
    } catch {
      setPaintSupplyCos((prev) =>
        prev.filter((n) => n.toLowerCase() !== name.toLowerCase())
      );
    }
    if (editing?.invoice.paintSupplyCo.trim().toLowerCase() === name.toLowerCase()) {
      setEditing({
        ...editing,
        invoice: { ...editing.invoice, paintSupplyCo: "" },
      });
    }
    setDeletePaintAsk(null);
  }

  async function rememberPaintSupplyCo(raw: string) {
    const name = raw.trim();
    if (!name) return;
    const listed = paintSupplyCos.some(
      (n) => n.toLowerCase() === name.toLowerCase()
    );
    if (listed) return;
    try {
      setPaintSupplyCos(await api.savePaintSupplyCo(name));
    } catch {
      setPaintSupplyCos((prev) =>
        prev.some((n) => n.toLowerCase() === name.toLowerCase())
          ? prev
          : [...prev, name].sort((a, b) => a.localeCompare(b))
      );
    }
  }

  function listedPaintSupplyCo(name: string) {
    const key = name.trim().toLowerCase();
    return paintSupplyCos.find((n) => n.toLowerCase() === key) ?? "";
  }

  async function startNew() {
    await Promise.all([loadWorkPersons(), loadPaintSupplyCos()]);

    const inv = emptyInvoice();
    inv.companyNo = company.companyNo;
    inv.proNo = property.proNo;
    inv.salesDate = today();
    try {
      const sys = await api.getSysdata();
      inv.invoice = Math.max(1, sys.nextInvoice || 1);
      const days = sys.termsDays || 7;
      const d = new Date(inv.salesDate);
      d.setDate(d.getDate() + days);
      inv.salesDue = d.toISOString().slice(0, 10);
      inv.salesTerm = `Net  ${days} Days`;
    } catch {
      inv.invoice = 1;
      const d = new Date(inv.salesDate);
      d.setDate(d.getDate() + 7);
      inv.salesDue = d.toISOString().slice(0, 10);
      inv.salesTerm = "Net  7 Days";
    }
    setEditing({
      invoice: inv,
      lines: [blankNewInvoiceLine(inv, 1)],
    });
    setIsNewInvoice(true);
    setMode("edit");
    setMsg("Enter Invoice Information (Esc=Exit) !");
    setMsgKind("default");
  }

  async function openEdit(inv: Invoice) {
    const [full] = await Promise.all([
      api.getInvoice(inv.companyNo, inv.proNo, inv.salesDate, inv.invoice),
      loadWorkPersons(),
      loadPaintSupplyCos(),
    ]);
    if (full) {
      setEditing(full);
      setIsNewInvoice(false);
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
    await Promise.all([
      rememberWorkPerson(invoiceWorkPerson(editing.lines)),
      rememberPaintSupplyCo(inv.paintSupplyCo),
    ]);
    setConfirmSave(true);
    setMsg("Is This Data Correct ? (Y/N)");
  }

  async function doSave() {
    if (!editing) return;
    const inv = editing.invoice;
    try {
      const rawPerson = invoiceWorkPerson(editing.lines);
      const workPerson = listedWorkPerson(rawPerson) || rawPerson.trim();
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
          empNo: workPerson,
          empPrice:
            l.empPrice || (l.price * (l.commission || 65)) / 100,
        })),
      });
      setEditing(null);
      setIsNewInvoice(false);
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
      else if (deleteNameAsk) setDeleteNameAsk(null);
      else if (deletePaintAsk) setDeletePaintAsk(null);
      else if (confirmSave) setConfirmSave(false);
      else if (mode === "edit") {
        setEditing(null);
        setIsNewInvoice(false);
        setMode("browse");
        setMsg("Ins=Add  Enter=Edit  Del=Void  Esc=Back");
      } else onBack();
    },
    onF1: () => setHelp(true),
    onInsert: () => {
      if (help || voidAsk || confirmSave || deleteNameAsk || deletePaintAsk) return;
      if (mode === "browse") void startNew();
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
      if (deleteNameAsk) {
        if (ch === "y" || ch === "Y") {
          void confirmDeleteWorkPerson();
          return true;
        }
        if (ch === "n" || ch === "N") {
          setDeleteNameAsk(null);
          return true;
        }
      }
      if (deletePaintAsk) {
        if (ch === "y" || ch === "Y") {
          void confirmDeletePaintSupplyCo();
          return true;
        }
        if (ch === "n" || ch === "N") {
          setDeletePaintAsk(null);
          return true;
        }
      }
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
      return false;
    },
  });

  const lineTotal =
    editing?.lines.reduce((s, l) => s + (l.price || 0), 0) ?? 0;

  return (
    <Screen
      statusKeys={
        mode === "edit"
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
            {padR(company.name, 30)} {padR(property.street, 20)}
            {"\n"}
            {padR(property.name, 30)} Unit keys: {property.keyInfo}{" "}
            {property.paintTime}
          </div>
          <div className="dos-browse-header">
            {"Inv_Date   Inv#   PO           Unit     Size     Total      Paid     Balance   St"}
          </div>
          <div className="dos-browse-body">
            {rows.map((inv, i) => (
              <button
                key={`${inv.invoice}-${inv.salesDate}`}
                className={`dos-row ${i === index ? "selected" : ""} ${inv.voided ? "voided" : ""} ${
                  !inv.voided && inv.balance > 0.005
                    ? "invoice-open"
                    : "invoice-paid"
                }`}
                onMouseEnter={() => setIndex(i)}
                onClick={() => {
                  setIndex(i);
                  openEdit(inv);
                }}
              >
                {cols(
                  padR(fmtDate(inv.salesDate), 10),
                  padL(inv.invoice, 5),
                  padR(inv.custPoNo ?? "", 12),
                  padR(inv.salesUnit, 8),
                  padR(inv.salesSize, 8),
                  padL(money(inv.salesTotal), 10),
                  padL(money(inv.payTotal), 9),
                  padL(money(inv.balance), 10),
                  inv.voided ? "V" : inv.balance <= 0 ? "*" : " "
                )}
              </button>
            ))}
            {rows.length === 0 && (
              <div className="dos-row" style={{ color: "var(--dos-yellow)" }}>
                {"  (no invoices — press Ins or click New Invoice)"}
              </div>
            )}
          </div>
          <div className="dos-browse-footer">
            <button
              type="button"
              className="dos-btn"
              onClick={() => {
                void startNew();
              }}
            >
              New Invoice
            </button>
          </div>
        </div>
      )}

      {mode === "edit" && editing && (
        <Dialog
          title={
            editing.invoice.voided
              ? "*** V O I D  I N V O I C E ***"
              : editing.invoice.invoice
                ? `Invoice Number ${editing.invoice.invoice}${
                    (editing.invoice.custPoNo ?? "").trim()
                      ? `  ${editing.invoice.custPoNo.trim()}`
                      : ""
                  }`
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
              <DotField label="Invoice Number" width={16}>
                <input
                  className="dos-input w8"
                  type="number"
                  aria-label="Invoice Number"
                  value={editing.invoice.invoice || ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      invoice: {
                        ...editing.invoice,
                        invoice: parseInt(e.target.value, 10) || 0,
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
                <div className="dos-choice-pair">
                  <select
                    className="dos-select dos-choice"
                    aria-label="Size"
                    value={
                      isListedUnitSize(editing.invoice.salesSize)
                        ? normalizeUnitSize(editing.invoice.salesSize) ?? ""
                        : ""
                    }
                    onChange={(e) => {
                      const salesSize = e.target.value;
                      const invoice = { ...editing.invoice, salesSize };
                      setEditing({
                        invoice,
                        lines: isNewInvoice
                          ? applyPresetPrices(salesSize, editing.lines)
                          : editing.lines,
                      });
                    }}
                  >
                    <option value=""> </option>
                    {UNIT_SIZE_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <input
                    className="dos-input"
                    aria-label="Custom size"
                    readOnly={isListedUnitSize(editing.invoice.salesSize)}
                    value={editing.invoice.salesSize}
                    onChange={(e) => {
                      if (isListedUnitSize(editing.invoice.salesSize)) return;
                      const salesSize = e.target.value;
                      const invoice = { ...editing.invoice, salesSize };
                      setEditing({
                        invoice,
                        lines: isNewInvoice
                          ? applyPresetPrices(salesSize, editing.lines)
                          : editing.lines,
                      });
                    }}
                    placeholder="Type size"
                  />
                </div>
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
              <DotField label="Material Costs" width={14}>
                <input
                  className="dos-input w10 num"
                  type="number"
                  step="0.01"
                  aria-label="Material Costs"
                  value={editing.invoice.materialCost ?? 0}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      invoice: {
                        ...editing.invoice,
                        materialCost: parseFloat(e.target.value) || 0,
                      },
                    })
                  }
                />
              </DotField>
              <DotField label="Paint Supply Co." width={16}>
                <div className="invoice-work-person">
                  <select
                    className="dos-select dos-choice"
                    aria-label="Paint Supply Co. list"
                    title="Paint Supply Co."
                    value={listedPaintSupplyCo(editing.invoice.paintSupplyCo ?? "")}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        invoice: {
                          ...editing.invoice,
                          paintSupplyCo: e.target.value,
                        },
                      })
                    }
                  >
                    <option value=""> </option>
                    {paintSupplyCos.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="dos-input"
                    aria-label="Paint Supply Co."
                    placeholder="Type name"
                    value={editing.invoice.paintSupplyCo ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        invoice: {
                          ...editing.invoice,
                          paintSupplyCo: e.target.value,
                        },
                      })
                    }
                    onBlur={() => {
                      void rememberPaintSupplyCo(editing.invoice.paintSupplyCo);
                    }}
                  />
                  <button
                    type="button"
                    className="dos-btn danger"
                    aria-label={`Remove ${editing.invoice.paintSupplyCo || "paint supply company"} from list`}
                    disabled={!listedPaintSupplyCo(editing.invoice.paintSupplyCo ?? "")}
                    title="Remove name from list"
                    onClick={() => {
                      const name = listedPaintSupplyCo(
                        editing.invoice.paintSupplyCo ?? ""
                      );
                      if (name) setDeletePaintAsk(name);
                    }}
                  >
                    ×
                  </button>
                </div>
              </DotField>
              <DotField label="Work Person" width={14}>
                <div className="invoice-work-person">
                  <select
                    className="dos-select dos-choice"
                    aria-label="Work Person list"
                    title="Work Person"
                    value={listedWorkPerson(invoiceWorkPerson(editing.lines))}
                    onChange={(e) => setInvoiceWorkPerson(e.target.value)}
                  >
                    <option value=""> </option>
                    {workPersons.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="dos-input"
                    aria-label="Work Person"
                    placeholder="Type name"
                    value={invoiceWorkPerson(editing.lines)}
                    onChange={(e) => setInvoiceWorkPerson(e.target.value)}
                    onBlur={() => {
                      const raw = invoiceWorkPerson(editing.lines);
                      const canon = listedWorkPerson(raw) || raw.trim();
                      if (canon !== raw) setInvoiceWorkPerson(canon);
                      void rememberWorkPerson(canon);
                    }}
                  />
                  <button
                    type="button"
                    className="dos-btn danger"
                    aria-label={`Remove ${invoiceWorkPerson(editing.lines) || "work person"} from list`}
                    disabled={!listedWorkPerson(invoiceWorkPerson(editing.lines))}
                    title="Remove name from list"
                    onClick={() => {
                      const name = listedWorkPerson(
                        invoiceWorkPerson(editing.lines)
                      );
                      if (name) setDeleteNameAsk(name);
                    }}
                  >
                    ×
                  </button>
                </div>
              </DotField>
            </div>

            <div className="invoice-line-grid invoice-line-head">
              <span>Description</span>
              <span className="invoice-col-center">WorkDate</span>
              <span className="invoice-col-center">Price</span>
            </div>
            {editing.lines.map((line, idx) => (
              <div
                key={idx}
                className="invoice-line-grid"
                style={{ marginBottom: "0.12em" }}
              >
                <div className="dos-choice-pair">
                  <select
                    className="dos-select dos-choice"
                    aria-label={`Line ${idx + 1} description`}
                    value={
                      isPresetDescription(line.description)
                        ? line.description
                        : ""
                    }
                    onChange={(e) => {
                      const description = e.target.value;
                      const lines = [...editing.lines];
                      const next = { ...line, description };
                      lines[idx] = description
                        ? applyPresetPriceToLine(next, editing.invoice.salesSize)
                        : { ...next, price: 0, empPrice: 0 };
                      setEditing({ ...editing, lines });
                    }}
                  >
                    <option value=""> </option>
                    {INVOICE_LINE_PRESETS.map((p) => (
                      <option key={p.id} value={p.description}>
                        {p.description}
                      </option>
                    ))}
                  </select>
                  <input
                    className="dos-input"
                    aria-label={`Line ${idx + 1} custom text`}
                    readOnly={isPresetDescription(line.description)}
                    value={line.description}
                    onChange={(e) => {
                      if (isPresetDescription(line.description)) return;
                      const lines = [...editing.lines];
                      lines[idx] = { ...line, description: e.target.value };
                      setEditing({ ...editing, lines });
                    }}
                    placeholder="Type description"
                  />
                </div>
                <input
                  className="dos-input w12"
                  type="date"
                  aria-label={`Line ${idx + 1} work date`}
                  value={line.workDate || editing.invoice.salesDate}
                  onChange={(e) => {
                    const lines = [...editing.lines];
                    lines[idx] = { ...line, workDate: e.target.value };
                    setEditing({ ...editing, lines });
                  }}
                />
                <input
                  className="dos-input w10 num"
                  type="number"
                  step="0.01"
                  aria-label={`Price ${idx + 1}`}
                  value={line.price || ""}
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
                onClick={() => {
                  const person = invoiceWorkPerson(editing.lines);
                  const next = isNewInvoice
                    ? blankNewInvoiceLine(
                        editing.invoice,
                        editing.lines.length + 1
                      )
                    : emptyInvoiceLine(
                        editing.invoice,
                        editing.lines.length + 1
                      );
                  next.empNo = person;
                  setEditing({
                    ...editing,
                    lines: [...editing.lines, next],
                  });
                }}
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

      {deleteNameAsk && (
        <Prompt
          question={`Remove "${deleteNameAsk}" from Work Person list? (Y/N)`}
          onYes={() => {
            void confirmDeleteWorkPerson();
          }}
          onNo={() => setDeleteNameAsk(null)}
        />
      )}
      {deletePaintAsk && (
        <Prompt
          question={`Remove "${deletePaintAsk}" from Paint Supply Co. list? (Y/N)`}
          onYes={() => {
            void confirmDeletePaintSupplyCo();
          }}
          onNo={() => setDeletePaintAsk(null)}
        />
      )}
      {voidAsk && (
        <Prompt
          question={`Do you want Void (Y/N) ?  Invoice #${current?.invoice}`}
          onYes={doVoid}
          onNo={() => setVoidAsk(false)}
        />
      )}
      {confirmSave && (
        <Prompt
          question="Is This Data Correct ? (Y/N)"
          onYes={doSave}
          onNo={() => setConfirmSave(false)}
        />
      )}
      {help && <HelpOverlay onClose={() => setHelp(false)} />}
    </Screen>
  );
}
