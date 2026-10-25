/**
 * Invoice Process after Company+Property selected.
 * Browse invoices for the site; Ins or New Invoice opens the entry form
 * with date and next invoice number already filled.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useMemo } from "react";
import {
  api,
  Company,
  Property,
  Invoice,
  InvoiceLine,
  InvoiceWithLines,
  WorkPerson,
  JobDescription,
  emptyInvoice,
  emptyInvoiceLine,
} from "../../api";
import { pointerHoverMuted, useBrowseIndex, useDosKeys } from "../../dos/hooks";
import {
  Screen,
  Dialog,
  Prompt,
  HelpOverlay,
} from "../../dos/Shell";
import { DotField } from "../../dos/Field";
import { MoneyInput } from "../../dos/MoneyInput";
import { ContentGrid } from "../../dos/contentGrid";
import { addDays, money, fmtDate, today, naturalCompare } from "../../dos/utils";
import { clearUndoScope, pushUndoDelete } from "../../lib/undoDelete";
import {
  printInvoiceOnTemplate,
  downloadInvoicePdf,
} from "../../lib/invoicePrint";
import {
  UNIT_SIZE_OPTIONS,
  applyPresetPriceToLine,
  applyPresetPrices,
  blankNewInvoiceLine,
  isListedUnitSize,
  isPresetDescription,
  normalizeUnitSize,
} from "../../lib/invoiceLinePresets";
type Mode = "browse" | "edit";

/** How many textarea rows `text` needs when one row holds `charsPerLine`. */
export function descriptionRowCount(text: string, charsPerLine: number): number {
  const width = Math.max(1, Math.floor(charsPerLine));
  if (!text) return 1;
  return text.split("\n").reduce((rows, line) => {
    return rows + Math.max(1, Math.ceil(line.length / width));
  }, 0);
}

function charsAcross(el: HTMLTextAreaElement): number {
  const style = getComputedStyle(el);
  const probe = document.createElement("span");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${style.font};`;
  probe.textContent = "0000000000";
  document.body.appendChild(probe);
  const charW = probe.getBoundingClientRect().width / 10;
  probe.remove();
  if (!charW || !el.clientWidth) return 0;
  const pad = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  return Math.max(1, Math.floor((el.clientWidth - pad) / charW));
}

function str(value: string | null | undefined): string {
  return (value ?? "").trim();
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

/** True when the whole value is an email address, not a code that mentions one. */
function isWholeEmail(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  const match = text.match(EMAIL_RE);
  return match?.[0] === text;
}

/**
 * Lock box code for the invoice header.
 *
 * The property form writes Lock Box into paintTime and E-mail into pageMap.
 * The header used to prefer pageMap and ignore paintTime, so a code typed in
 * Lock Box never appeared, and an email in E-mail was shown as the lock box.
 * Gate code is keyInfo and is labeled Entry code; it is not scanned for a
 * lock box. Older files that still keep the code in a non-email page map, or
 * only in a comment, keep that value when Lock Box is blank.
 */
function lockBoxCode(property: Property): string {
  const fromLockBox = str(property.paintTime);
  if (fromLockBox) return fromLockBox;
  const fromPage = str(property.pageMap);
  if (fromPage && !isWholeEmail(fromPage)) return fromPage;
  const blob = [property.comment1, property.comment2]
    .map((part) => str(part))
    .filter(Boolean)
    .join(" ");
  const match = blob.match(
    /\b(?:lock\s*box|l\.?\s*box|lb)\s*#?\s*(#?\d[\d*#-]*)/i
  );
  return match?.[1] ?? "";
}

function propertyComments(property: Property): string {
  return [property.comment1, property.comment2]
    .map((part) => str(part))
    .filter(Boolean)
    .join(" ");
}

function firstEmail(...parts: Array<string | null | undefined>): string {
  for (const part of parts) {
    const match = (part ?? "").match(EMAIL_RE);
    if (match) return match[0];
  }
  return "";
}

function contactName(company: Company, property: Property): string {
  const site = str(property.manager) || str(property.contact);
  if (site) return site;
  const companyContact = str(company.contact);
  if (companyContact && !EMAIL_RE.test(companyContact)) return companyContact;
  return "";
}

/** One header row. `words` wraps inside the value; `values` wraps only between values. */
type HeaderRow = { parts: string[]; wrap: "values" | "words" };

function addressParts(property: Property): string[] {
  return [property.street, property.city, property.state, property.zip]
    .map((part) => str(part))
    .filter(Boolean);
}

function siteHeaderRows(company: Company, property: Property): HeaderRow[] {
  const companyLabel = str(company.name) || str(company.companyNo);
  const propertyName = str(property.name);
  const entry = str(property.keyInfo);
  const lockBox = lockBoxCode(property);
  const contact = contactName(company, property);
  const email = firstEmail(
    company.contact,
    company.memo,
    property.memo,
    property.comment1,
    property.comment2
  );
  const cell = str(property.phone2);
  const phone = str(property.phone);
  const fax = str(company.phone4);
  const comments = propertyComments(property);
  const rows: HeaderRow[] = [
    { wrap: "values", parts: [companyLabel, propertyName].filter(Boolean) },
    { wrap: "values", parts: addressParts(property) },
    {
      wrap: "values",
      parts: [
        entry ? `Entry code: ${entry}` : "",
        lockBox ? `Lock box code: ${lockBox}` : "",
      ].filter(Boolean),
    },
    {
      wrap: "values",
      parts: [
        contact ? `Contact: ${contact}` : "",
        email ? `Email: ${email}` : "",
      ].filter(Boolean),
    },
    {
      wrap: "values",
      parts: [
        cell ? `Cell phone: ${cell}` : "",
        phone ? `Phone: ${phone}` : "",
        fax ? `Fax: ${fax}` : "",
      ].filter(Boolean),
    },
    { wrap: "words", parts: comments ? [`Comments: ${comments}`] : [] },
  ];
  return rows.filter((row) => row.parts.length > 0);
}

function InvoiceLineDescription({
  idx,
  description,
  readOnly,
  onChange,
}: {
  idx: number;
  description: string;
  readOnly: boolean;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [rows, setRows] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const across = charsAcross(el);
      const fromChars = across > 0 ? descriptionRowCount(description, across) : 1;
      el.rows = 1;
      el.style.height = "auto";
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
      const measured =
        lineHeight > 0 ? Math.round(el.scrollHeight / lineHeight) : fromChars;
      const next = Math.max(fromChars, measured || 1);
      el.rows = next;
      el.style.height = "auto";
      const border = el.offsetHeight - el.clientHeight;
      el.style.height = `${el.scrollHeight + border}px`;
      setRows((prev) => (prev === next ? prev : next));
    };
    fit();
    const parent = el.parentElement;
    if (!parent || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fit);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [description]);
  return (
    <textarea
      ref={ref}
      className="dos-input invoice-line-desc"
      aria-label={`Line ${idx + 1} custom text`}
      readOnly={readOnly}
      rows={rows}
      value={description}
      onChange={(e) => {
        if (readOnly) return;
        onChange(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.preventDefault();
      }}
      placeholder="Type description"
    />
  );
}

function InvoiceSiteHeader({
  company,
  property,
}: {
  company: Company;
  property: Property;
}) {
  const rows = siteHeaderRows(company, property);
  return (
    <div className="invoice-site-header">
      {rows.map((row, i) =>
        row.wrap === "words" ? (
          <div key={i} className="invoice-comments">
            <span className="invoice-comment-text">{row.parts[0]}</span>
          </div>
        ) : (
          <div key={i} className="invoice-fact-line">
            {row.parts.map((part, j) => (
              <span key={j} className="invoice-fact">
                {part}
                {j < row.parts.length - 1 ? ", " : ""}
              </span>
            ))}
          </div>
        )
      )}
    </div>
  );
}

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
  const [originalRows, setOriginalRows] = useState<Invoice[]>([]);
  const [mode, setMode] = useState<Mode>("browse");
  const [editing, setEditing] = useState<InvoiceWithLines | null>(null);
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const [isNewInvoice, setIsNewInvoice] = useState(false);
  const [workPersons, setWorkPersons] = useState<WorkPerson[]>([]);
  const [jobDescriptions, setJobDescriptions] = useState<JobDescription[]>([]);
  const [paintSupplyCos, setPaintSupplyCos] = useState<string[]>([]);
  const [msg, setMsg] = useState(
    "Ins=Add  Ctrl-Home=Edit  Delete=Void  Esc=Exit"
  );
  const [msgKind, setMsgKind] = useState<"default" | "error" | "info">(
    "default"
  );
  const [voidAsk, setVoidAsk] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [help, setHelp] = useState(false);
  const [unitSortDirection, setUnitSortDirection] = useState<"asc" | "desc" | null>(null);
  const { index, setIndex, up, down, pageUp, pageDown, home } =
    useBrowseIndex(rows.length);

  const load = useCallback(async () => {
    const [data, jobs] = await Promise.all([
      api.listInvoices({
        companyNo: company.companyNo,
        proNo: property.proNo,
        includeVoided: true,
        limit: 100000,
      }),
      api.listJobDescriptions().catch(() => [] as JobDescription[]),
    ]);
    setJobDescriptions(jobs ?? []);
    const mine = data.filter(
      (i) =>
        i.proNo === property.proNo &&
        (focusInvoice == null || i.invoice === focusInvoice)
    );
    setRows(mine);
    setOriginalRows(mine);
    setUnitSortDirection(null);
    if (focusInvoice != null && mine.length) setIndex(0);
    setMsg(
      mine.length
        ? `${mine.length} invoices  Ins=Add  Enter=Edit  Delete=Void  Esc=Back`
        : "No invoices for this property. Press Ins or click New Invoice."
    );
    setMsgKind("default");
  }, [company.companyNo, property.proNo, focusInvoice, setIndex]);

  const toggleUnitSort = useCallback(() => {
    setUnitSortDirection((prev) => {
      if (prev === null) return "asc";
      if (prev === "asc") return "desc";
      return null;
    });
    setIndex(0);
  }, [setIndex]);

  const sortedRows = useMemo(() => {
    if (unitSortDirection === null) return originalRows;
    
    const sorted = [...originalRows].sort((a, b) => {
      const cmp = naturalCompare(a.salesUnit, b.salesUnit);
      return unitSortDirection === "asc" ? cmp : -cmp;
    });
    
    return sorted;
  }, [originalRows, unitSortDirection]);

  useEffect(() => {
    if (mode !== "browse") return;
    const count = originalRows.length;
    if (count === 0) {
      setMsg("No invoices for this property. Press Ins or click New Invoice.");
      return;
    }
    
    let sortMsg = "";
    if (unitSortDirection === "asc") {
      sortMsg = "Sorted by unit, ascending  ";
    } else if (unitSortDirection === "desc") {
      sortMsg = "Sorted by unit, descending  ";
    }
    
    setMsg(`${sortMsg}${count} invoices  Ins=Add  Enter=Edit  Delete=Void  Esc=Back`);
    // Not keyed on the row count: load() announces the count itself, and a
    // save or void then replaces that with its own notice.
  }, [mode, unitSortDirection]);

  useEffect(() => {
    load().catch((e: unknown) => {
      setMsg(String(e));
      setMsgKind("error");
    });
  }, [load]);

  useEffect(() => {
    document
      .querySelector(".dos-row.selected")
      ?.scrollIntoView?.({ block: "nearest" });
  }, [index]);

  const current = sortedRows[index] ?? null;

  async function loadWorkPersons() {
    try {
      setWorkPersons((await api.listWorkPersons()) ?? []);
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

  function listedWorkPerson(name: string) {
    const key = name.trim().toLowerCase();
    return (
      workPersons.find((p) => p.active && p.name.toLowerCase() === key)?.name ??
      ""
    );
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
    inv.orderDate = inv.salesDate;
    try {
      const sys = await api.getSysdata();
      inv.invoice = Math.max(1, sys.nextInvoice || 1);
      const days = sys.termsDays || 7;
      inv.salesDue = addDays(inv.salesDate, days);
      inv.salesTerm = `Net  ${days} Days`;
    } catch {
      inv.invoice = 1;
      inv.salesDue = addDays(inv.salesDate, 7);
      inv.salesTerm = "Net  7 Days";
    }
    setEditing({
      invoice: inv,
      lines: [1, 2, 3, 4].map((n) => blankNewInvoiceLine(inv, n)),
    });
    setIsNewInvoice(true);
    setMode("edit");
    setMsg("Enter Invoice Information (Esc=Exit) !");
    setMsgKind("default");
  }

  async function openEdit(inv: Invoice) {
    try {
      const [full] = await Promise.all([
        api.getInvoice(inv.companyNo, inv.proNo, inv.salesDate, inv.invoice),
        loadWorkPersons(),
        loadPaintSupplyCos(),
      ]);
      if (!full) {
        setMsg("--> does not exist in Invoice File !!!");
        setMsgKind("error");
        return;
      }
      setEditing(full);
      setIsNewInvoice(false);
      setMode("edit");
      setMsg(
        full.invoice.voided
          ? "*** V O I D  I N V O I C E ***"
          : `Invoice #${full.invoice.invoice}  Ctrl-S=Save  Esc=Exit`
      );
      setMsgKind("default");
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
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
    await rememberPaintSupplyCo(inv.paintSupplyCo);
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
      editingRef.current = null;
      setEditing(null);
      setIsNewInvoice(false);
      setConfirmSave(false);
      setMode("browse");
      await load();
      setMsg(`Invoice #${no} saved.`);
      setMsgKind("info");
    } catch (e) {
      setConfirmSave(false);
      setMsg(String(e));
      setMsgKind("error");
    }
  }

  useEffect(() => {
    return () => {
      if (editingRef.current) clearUndoScope("invoice-lines");
    };
  }, []);

  function deleteInvoiceLine(idx: number) {
    const cur = editingRef.current;
    const line = cur?.lines[idx];
    if (!cur || !line) return;
    const at = idx;
    const key = {
      companyNo: cur.invoice.companyNo || company.companyNo,
      proNo: cur.invoice.proNo || property.proNo,
      salesDate: cur.invoice.salesDate,
      invoice: cur.invoice.invoice,
    };
    const next = { ...cur, lines: cur.lines.filter((_, i) => i !== idx) };
    editingRef.current = next;
    setEditing(next);
    pushUndoDelete(async () => {
      const open = editingRef.current;
      if (
        open &&
        open.invoice.salesDate === key.salesDate &&
        open.invoice.invoice === key.invoice
      ) {
        const lines = [...open.lines];
        lines.splice(Math.min(at, lines.length), 0, line);
        const restored = { ...open, lines };
        editingRef.current = restored;
        setEditing(restored);
        return;
      }
      const full = await api.getInvoice(
        key.companyNo,
        key.proNo,
        key.salesDate,
        key.invoice
      );
      if (!full) {
        setMsg("That delete can no longer be undone.");
        setMsgKind("error");
        return;
      }
      const lines = [...full.lines];
      lines.splice(Math.min(at, lines.length), 0, {
        ...line,
        companyNo: key.companyNo,
        proNo: key.proNo,
        salesDate: key.salesDate,
        invoice: full.invoice.invoice,
      });
      await api.saveInvoice({
        invoice: full.invoice,
        lines: lines.map((l, i) => ({ ...l, lineNo: i + 1 })),
      });
      await load();
      setMsg("Delete undone.");
      setMsgKind("info");
    }, "invoice-lines");
  }

  async function doVoid() {
    if (!current) return;
    setVoidAsk(false);
    try {
      await api.voidInvoice(
        current.companyNo,
        current.proNo,
        current.salesDate,
        current.invoice
      );
      await load();
      setMsg(`*** Void Invoice ***  #${current.invoice}`);
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    }
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
      else if (confirmSave) setConfirmSave(false);
      else if (mode === "edit") {
        clearUndoScope("invoice-lines");
        editingRef.current = null;
        setEditing(null);
        setIsNewInvoice(false);
        setMode("browse");
        setMsg("Ins=Add  Enter=Edit  Delete=Void  Esc=Back");
        setMsgKind("default");
      } else onBack();
    },
    onF1: () => setHelp(true),
    onInsert: () => {
      if (help || voidAsk || confirmSave) return;
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
    onCtrlS: () => {
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
              { key: "Ctrl-S", label: "Save" },
              { key: "End", label: "Print Form" },
              { key: "F1", label: "Help" },
            ]
          : [
              { key: "Esc", label: "Exit" },
              { key: "Ins", label: "Add" },
              { key: "Ctrl-Home", label: "Edit" },
              { key: "Delete", label: "Void" },
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
          <InvoiceSiteHeader company={company} property={property} />
          <ContentGrid columns={9}>
            <div className="browse-grid browse-grid-header">
              <div>Inv_Date</div>
              <div>Inv#</div>
              <div>PO</div>
              <button
                type="button"
                className="sort-btn"
                onClick={toggleUnitSort}
                title="Click to sort by unit number"
              >
                Unit{unitSortDirection === "asc" ? " ^" : unitSortDirection === "desc" ? " v" : ""}
              </button>
              <div>Size</div>
              <div>Total</div>
              <div>Paid</div>
              <div>Balance</div>
              <div>Status</div>
            </div>
            {sortedRows.map((inv, i) => (
              <button
                key={`${inv.invoice}-${inv.salesDate}`}
                className={`dos-row ${i === index ? "selected" : ""} ${inv.voided ? "voided" : ""} ${
                  !inv.voided && inv.balance > 0.005
                    ? "invoice-open"
                    : "invoice-paid"
                } browse-grid`}
                onMouseEnter={() => {
                  if (pointerHoverMuted()) return;
                  setIndex(i);
                }}
                onClick={() => {
                  setIndex(i);
                  openEdit(inv);
                }}
              >
                <div>{fmtDate(inv.salesDate)}</div>
                <div>{inv.invoice}</div>
                <div>{inv.custPoNo ?? ""}</div>
                <div>{inv.salesUnit}</div>
                <div>{inv.salesSize}</div>
                <div>{money(inv.salesTotal)}</div>
                <div>{money(inv.payTotal)}</div>
                <div>{money(inv.balance)}</div>
                <div>{inv.voided ? "Void" : inv.balance <= 0 ? "Paid" : "Open"}</div>
              </button>
            ))}
            {originalRows.length === 0 && (
              <div className="dos-row content-grid-span" style={{ color: "var(--app-highlight)" }}>
                {"  (no invoices — press Ins or click New Invoice)"}
              </div>
            )}
          </ContentGrid>
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
          foot="Esc=Cancel, Ctrl-S=Save & Exit, End=Print on Form"
        >
          <div className="dos-form invoice-edit">
            <div className="dos-form-row">
              <DotField label="Invoice Date" width={14}>
                <input
                  className="dos-input"
                  type="date"
                  aria-label="Invoice Date"
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
            </div>
            <div className="invoice-terms-order">
            <div className="dos-form-row">
              <DotField label="Due Date" width={12}>
                <input
                  className="dos-input"
                  type="date"
                  aria-label="Due Date"
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
                  className="dos-input w12"
                  type="text"
                  readOnly
                  aria-label="Invoice Number"
                  aria-readonly="true"
                  value={editing.invoice.invoice || ""}
                />
              </DotField>
              <DotField label="Order Date" width={12}>
                <input
                  className="dos-input"
                  type="date"
                  aria-label="Order Date"
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
            </div>
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
                        lines: applyPresetPrices(salesSize, editing.lines, jobDescriptions),
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
                        lines: applyPresetPrices(salesSize, editing.lines, jobDescriptions),
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
                <MoneyInput
                  className="dos-input w10 num"
                  aria-label="Material Costs"
                  value={editing.invoice.materialCost ?? 0}
                  onValueChange={(materialCost) =>
                    setEditing({
                      ...editing,
                      invoice: {
                        ...editing.invoice,
                        materialCost,
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
                </div>
              </DotField>
            </div>
            <div className="dos-form-row">
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
                    {workPersons
                      .filter((person) => person.active)
                      .map((person) => (
                        <option key={person.name} value={person.name}>
                          {person.name}
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
                      const canon = listedWorkPerson(raw);
                      if (canon && canon !== raw) setInvoiceWorkPerson(canon);
                    }}
                  />
                </div>
              </DotField>
            </div>

            <div className="browse-grid browse-grid-header invoice-line-grid" style={{ margin: "0.5em 0 0.2em" }}>
              <div>Description</div>
              <div>WorkDate</div>
              <div>Price</div>
              <div>Delete</div>
            </div>
            {editing.lines.map((line, idx) => (
              <div key={idx} className="browse-grid invoice-line-grid" style={{ marginBottom: "0.12em" }}>
                <div className="invoice-line-type">
                  <select
                    className="dos-select dos-choice"
                    aria-label={`Line ${idx + 1} description`}
                    value={
                      isPresetDescription(line.description, jobDescriptions)
                        ? line.description
                        : ""
                    }
                    onChange={(e) => {
                      const description = e.target.value;
                      const lines = [...editing.lines];
                      const next = { ...line, description };
                      lines[idx] = description
                        ? applyPresetPriceToLine(next, editing.invoice.salesSize, jobDescriptions)
                        : { ...next, price: 0, empPrice: 0 };
                      setEditing({ ...editing, lines });
                    }}
                  >
                    <option value=""> </option>
                    {jobDescriptions.map((p) => (
                      <option key={p.description} value={p.description}>
                        {p.description}
                      </option>
                    ))}
                  </select>
                  <InvoiceLineDescription
                    idx={idx}
                    description={line.description}
                    readOnly={isPresetDescription(line.description, jobDescriptions)}
                    onChange={(description) => {
                      const lines = [...editing.lines];
                      lines[idx] = { ...line, description };
                      setEditing({ ...editing, lines });
                    }}
                  />
                </div>
                <div className="invoice-line-end" style={{ minWidth: 0 }}>
                  <input
                    className="dos-input"
                    type="date"
                    aria-label={`Line ${idx + 1} work date`}
                    value={line.workDate || editing.invoice.salesDate}
                    onChange={(e) => {
                      const lines = [...editing.lines];
                      lines[idx] = { ...line, workDate: e.target.value };
                      setEditing({ ...editing, lines });
                    }}
                  />
                </div>
                <div className="invoice-line-end" style={{ minWidth: 0 }}>
                  <MoneyInput
                    className="dos-input"
                    style={{ width: "100%" }}
                    aria-label={`Price ${idx + 1}`}
                    blankZero
                    value={line.price}
                    onValueChange={(price) => {
                      const lines = [...editing.lines];
                      lines[idx] = {
                        ...line,
                        price,
                        empPrice: (price * line.commission) / 100,
                      };
                      setEditing({ ...editing, lines });
                    }}
                  />
                </div>
                <div className="invoice-line-end" style={{ minWidth: "max-content", minHeight: "44px", display: "flex", alignItems: "center" }}>
                  <button
                    className="dos-btn danger"
                    style={{ width: "100%", minHeight: "44px", textAlign: "center", padding: "0 1ch" }}
                    onClick={() => deleteInvoiceLine(idx)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            <div className="browse-grid invoice-line-grid dos-total" style={{ marginTop: "0.4em" }}>
              <div style={{ gridColumn: "1 / 3" }}>
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
              </div>
              <div className="invoice-line-end">{money(lineTotal)}</div>
              <div className="invoice-line-end"></div>
            </div>
            <div className="dos-total" style={{ marginTop: "0.4em" }}>
              Balance: {money(lineTotal - editing.invoice.salesPay - editing.invoice.payTotal)}
              {"  "}
              <button
                type="button"
                className="dos-btn"
                onClick={() => printCurrent()}
                title="Print on invoice_template.pdf (End)"
              >
                Print Form (End)
              </button>
            </div>
            <div className="dos-note" style={{ marginTop: "0.6em" }}>
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
