/**
 * Original PROMAS gateway shared by Estimate / Work Order / Invoice / Cash:
 *   Company NO / Name / Phone / Contact / Property Street / Property Contact
 *   then Property NO / Name / Phone / Contact → select or add
 * Cash skips property and hands off the company only.
 */
import { useLayoutEffect, useRef, useState } from "react";
import {
  api,
  Company,
  Invoice,
  Property,
  emptyCompany,
  emptyProperty,
} from "../../api";
import { pointerHoverMuted, useBrowseIndex, useDosKeys } from "../../dos/hooks";
import { pushUndoDelete } from "../../lib/undoDelete";
import {
  Screen,
  Dialog,
  Prompt,
  HelpOverlay,
  FORM_KEYS,
  SEARCH_BROWSE_KEYS,
} from "../../dos/Shell";
import { DotField } from "../../dos/Field";
import { ContentGrid } from "../../dos/contentGrid";
import { fmtDate, naturalCompare, today } from "../../dos/utils";

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

/**
 * Next property number in one company's list. Non-numeric numbers are skipped.
 * The result is zero-padded to the width of the existing numeric numbers
 * ("01","02" → "03"). A longer next value is not truncated.
 */
export function nextPropertyNo(proNos: string[]): string {
  let max = 0;
  let width = 0;
  let any = false;
  for (const raw of proNos) {
    const t = (raw ?? "").trim();
    if (!/^\d+$/.test(t)) continue;
    any = true;
    const n = Number.parseInt(t, 10);
    if (n > max) max = n;
    if (t.length > width) width = t.length;
  }
  const next = String(max + 1);
  return any ? next.padStart(width, "0") : next;
}

/**
 * Company number defaults to "?". The first keystroke replaces that mark
 * whether the browser appended it or the field was selected.
 */
export function typedOverQuestion(previous: string, next: string): string {
  const prev = previous === "" ? "?" : previous;
  if (prev !== "?") return next;
  if (next === "" || next === "?") return "?";
  if (next.startsWith("?")) {
    const rest = next.slice(1);
    return rest === "" ? "?" : rest;
  }
  if (next.endsWith("?")) {
    const rest = next.slice(0, -1);
    return rest === "" ? "?" : rest;
  }
  return next;
}

function draftProperty(
  companyNo: string,
  existing: Property[],
  seed?: Partial<Property>
): Property {
  const rest: Partial<Property> = { ...(seed ?? {}) };
  delete rest.proNo;
  return {
    ...emptyProperty(companyNo),
    ...rest,
    companyNo,
    proNo: nextPropertyNo(existing.map((p) => p.proNo)),
  };
}

type Phase =
  | "co-search"
  | "co-browse"
  | "co-edit"
  | "pr-search"
  | "pr-browse"
  | "pr-edit"
  | "inv-browse";

type CoField = "no" | "name" | "phone" | "contact";
type PrField = "no" | "name" | "phone" | "street" | "contact";
type FirstKind = "company" | "property" | "invoice";

function matchesPropertyContact(p: Property, q: string): boolean {
  const needle = q.trim().toUpperCase();
  if (!needle) return false;
  return (
    p.contact.toUpperCase().includes(needle) ||
    p.manager.toUpperCase().includes(needle)
  );
}

function matchesPropertyAddress(p: Property, q: string): boolean {
  const needle = q.trim().toUpperCase();
  if (!needle) return false;
  const hay = [p.street, p.city, p.state, p.zip]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
  return (
    p.street.toUpperCase().includes(needle) ||
    p.city.toUpperCase().includes(needle) ||
    p.zip.toUpperCase().includes(needle) ||
    hay.includes(needle)
  );
}

/** Street shown in property lists. Falls back to the name only when no address parts exist. */
export function propertyStreetText(p: Property): string {
  const street = (p.street ?? "").trim();
  if (street) return street;
  const hasRest = [p.city, p.state, p.zip].some((s) => (s ?? "").trim());
  return hasRest ? "" : (p.name ?? "").trim();
}

export type PropertySortKey = "company" | "street";
export type PropertySortDir = "asc" | "desc";
export type PropertySort = { key: PropertySortKey; dir: PropertySortDir };

/** Default street-picker order: company number, highest first. */
export const DEFAULT_PROPERTY_SORT: PropertySort = {
  key: "company",
  dir: "desc",
};

function companyNoValue(companyNo: string): number | null {
  const digits = String(companyNo ?? "").trim();
  if (!/^\d+$/.test(digits)) return null;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

function compareCompanyNo(a: string, b: string): number {
  const na = companyNoValue(a);
  const nb = companyNoValue(b);
  if (na != null && nb != null && na !== nb) return na - nb;
  return String(a ?? "").localeCompare(String(b ?? ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

/**
 * Street picker order. Company number is numeric. Street order is the leading
 * street number, then the rest of the address, so 9 comes before 10.
 */
export function sortProperties(list: Property[], sort: PropertySort): Property[] {
  const dir = sort.dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    if (sort.key === "company") {
      const cmp = compareCompanyNo(a.companyNo, b.companyNo);
      if (cmp !== 0) return cmp * dir;
      const pro = naturalCompare(a.proNo, b.proNo);
      if (pro !== 0) return pro;
      return naturalCompare(a.street, b.street);
    }
    const street = naturalCompare(a.street, b.street);
    if (street !== 0) return street * dir;
    const cmp = compareCompanyNo(a.companyNo, b.companyNo);
    if (cmp !== 0) return cmp;
    return naturalCompare(a.proNo, b.proNo);
  });
}

export function propertySortMark(sort: PropertySort, key: PropertySortKey): string {
  if (sort.key !== key) return "";
  return sort.dir === "asc" ? " ^" : " v";
}

/** First click on a header selects it ascending. Another click toggles. */
export function nextPropertySort(cur: PropertySort, key: PropertySortKey): PropertySort {
  if (cur.key !== key) return { key, dir: "asc" };
  return { key, dir: cur.dir === "asc" ? "desc" : "asc" };
}

/** Property contact. Legacy PROCONTACT is manager; the property form writes both. */
export function propertyContactName(p: Property): string {
  return (p.manager || p.contact || "").trim();
}

function PropertyPlaceCells({ p }: { p: Property }) {
  const street = propertyStreetText(p);
  return (
    <>
      <div className="property-street" title={street}>
        {street}
      </div>
      <div>{(p.city ?? "").trim()}</div>
      <div>{(p.state ?? "").trim()}</div>
      <div>{(p.zip ?? "").trim()}</div>
    </>
  );
}

const STACK_PHASES: Phase[] = [
  "co-search",
  "co-browse",
  "pr-search",
  "pr-browse",
  "inv-browse",
];

export function CompanyPropertyGate({
  process,
  onBack,
  onReady,
  active = true,
}: {
  process: ProcessKind;
  onBack: () => void;
  onReady: (
    company: Company,
    property?: Property,
    extras?: { focusInvoice?: number }
  ) => void;
  /** When false, state is kept but the gate is hidden and keys are ignored. */
  active?: boolean;
}) {
  const title = PROCESS_TITLE[process];
  const [phase, setPhase] = useState<Phase>("co-search");
  const [coField, setCoField] = useState<CoField>("no");
  const [prField, setPrField] = useState<PrField>("no");
  const [firstKind, setFirstKind] = useState<FirstKind>("company");
  const [query, setQuery] = useState("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertySort, setPropertySort] = useState<PropertySort>(
    DEFAULT_PROPERTY_SORT
  );
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
  const [askDeleteCompany, setAskDeleteCompany] = useState(false);
  const [help, setHelp] = useState(false);
  const [invoiceHits, setInvoiceHits] = useState<Invoice[]>([]);

  const coBrowse = useBrowseIndex(companies.length);
  const prBrowse = useBrowseIndex(properties.length);
  const invBrowse = useBrowseIndex(invoiceHits.length);
  const trailRef = useRef<Phase[]>([]);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  /** Shown ahead of the search prompt until the user leaves the company search. */
  const noticeRef = useRef("");

  function pushPhase(next: Phase) {
    const cur = phaseRef.current;
    if (cur !== next && STACK_PHASES.includes(cur)) {
      const trail = trailRef.current;
      // Record the screen being left once. A repeated push of the same screen
      // would make the next Esc look like it did nothing.
      if (trail[trail.length - 1] !== cur) trail.push(cur);
    }
    phaseRef.current = next;
    setPhase(next);
  }

  function resetToCompanySearch(notice = "") {
    trailRef.current = [];
    noticeRef.current = notice;
    setCompany(null);
    setProperty(null);
    setProperties([]);
    setQuery("");
    setFirstKind("company");
    phaseRef.current = "co-search";
    setPhase("co-search");
    setMsgKind("default");
  }

  function goBackScreen() {
    let prev = trailRef.current.pop();
    // Skip a copy of the screen already showing, so one Esc leaves it.
    while (prev === phaseRef.current) prev = trailRef.current.pop();
    if (!prev) {
      onBack();
      return;
    }
    setEditCo(null);
    setEditPr(null);
    setAskAdd(false);
    setQuery("");
    setMsgKind("default");
    if (prev === "co-search") {
      setCompany(null);
      setProperty(null);
    } else if (prev === "co-browse") {
      setMsg("Enter=Select  Ins=Add  Ctrl-Home=Edit  Esc=Back");
    } else if (prev === "pr-browse") {
      setMsg("Enter=Select  Ins=Add  Esc=Back");
    }
    setPhase(prev);
    phaseRef.current = prev;
  }

  // Before paint, so the status line matches the field the arrow just focused.
  useLayoutEffect(() => {
    if (phase !== "co-search") noticeRef.current = "";
    if (phase === "co-search") {
      // The search box that takes focus re-runs this, so keep the notice in front.
      const lead = noticeRef.current ? `${noticeRef.current}  ` : "";
      if (firstKind === "property") {
        setMsg(
          lead +
            (prField === "contact"
              ? "Enter Search Property Contact (Esc=Exit, ?=First)"
              : "Enter Search Property Street (Esc=Exit) !")
        );
      } else {
        setMsg(
          lead +
          (firstKind === "invoice"
            ? "Enter Search Invoice NO (Esc=Exit)"
            : coField === "no"
              ? "Enter Search Company NO (Esc=Exit, ?=First)"
              : coField === "name"
                ? "Enter Search Company Name (Esc=Exit, ?=First)"
                : coField === "phone"
                  ? "Enter Search Company Phone (Esc=Exit, ?=First)"
                  : "Enter Search Company Contact (Esc=Exit, ?=First)")
        );
      }
    } else if (phase === "pr-search") {
      setMsg(
        prField === "no"
          ? "Enter Property NO(Esc=Exit,?=First)"
          : prField === "name"
            ? "Enter Property Name(Esc=Exit,?=First)"
            : prField === "phone"
              ? "Enter Property Phone(Esc=Exit,?=First)"
              : "Enter Property Contact(Esc=Exit,?=First)"
      );
    }
  }, [phase, coField, prField, firstKind]);

  /** Lookups start from keys and clicks; a failed call shows its error on the status line. */
  function attempt(task: Promise<unknown>) {
    task.catch((e: unknown) => {
      setMsg(String(e));
      setMsgKind("error");
    });
  }

  async function searchCompanies(raw: string) {
    noticeRef.current = "";
    const q = raw.trim();
    if (q === "?") {
      const all = await api.listCompanies({ limit: 2000 });
      setCompanies(all);
      coBrowse.setIndex(0);
      pushPhase("co-browse");
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
    } else if (coField === "phone") {
      list = list.filter((c) => c.phone.includes(q) || c.phone2.includes(q));
    } else {
      list = list.filter((c) =>
        c.contact.toUpperCase().includes(q.toUpperCase())
      );
    }

    if (list.length === 0) {
      setMsg(`--> Does not exist !! Do you want Add Company (Y/N) ?`);
      setMsgKind("error");
      setAskAdd(true);
      await prepareNewCompany({
        name: coField === "name" ? q : "",
        phone: coField === "phone" ? q : "",
        contact: coField === "contact" ? q : "",
      });
      return;
    }
    if (list.length === 1 && (coField === "no" || coField === "contact")) {
      await selectCompany(list[0]);
      return;
    }
    setCompanies(list);
    coBrowse.setIndex(0);
    pushPhase("co-browse");
    setMsg("Enter=Select  Ins=Add  Ctrl-Home=Edit  Esc=Back");
    setMsgKind("default");
  }

  async function nextAssignedCompanyNo(): Promise<string> {
    try {
      return await api.nextCompanyNo();
    } catch {
      return "1000";
    }
  }

  async function prepareNewCompany(seed?: Partial<Company>) {
    const blank = { ...emptyCompany(), ...seed };
    blank.companyNo = await nextAssignedCompanyNo();
    setIsNew(true);
    setEditCo(blank);
    return blank;
  }

  async function beginNewCompany(seed?: Partial<Company>) {
    await prepareNewCompany(seed);
    pushPhase("co-edit");
    setMsg("Enter Company Information (Esc=exit) !");
  }

  async function selectCompany(c: Company) {
    setCompany(c);
    setProperty(null);
    setQuery("");
    setPrField("no");
    setMsgKind("default");
    if (process === "cash") {
      onReady(c);
      return;
    }
    const all = await api.listProperties({
      companyNo: c.companyNo,
      limit: 2000,
    });
    if (all.length === 0) {
      pushPhase("pr-search");
      setMsg(
        `Company ${c.companyNo} ${c.name}  —  Enter Property NO(Esc=Exit,?=First)`
      );
      return;
    }
    await showPropertyBrowse(
      all,
      `Company ${c.companyNo} ${c.name}  —  Enter=Select  Ins=Add  Esc=Back`
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
        setEditPr(draftProperty(company.companyNo, all));
        return;
      }
      await showPropertyBrowse(
        all,
        "Enter=Select  Ins=Add  Ctrl-Home=Edit  Esc=Back"
      );
      return;
    }
    if (!q) {
      setMsg("--> enter search value or ? for first !!");
      setMsgKind("error");
      return;
    }

    let list = filterProperties(all, q, prField);

    if (list.length === 0) {
      setMsg("--> does not exist !! Do you want Add Property(Y/N) ?");
      setMsgKind("error");
      setAskAdd(true);
      setIsNew(true);
      setEditPr(
        draftProperty(company.companyNo, all, {
          name: prField === "name" ? q : "",
          street: prField === "street" ? q : "",
          contact: prField === "contact" ? q : "",
          manager: prField === "contact" ? q : "",
        })
      );
      return;
    }
    if (list.length === 1 && (prField === "no" || prField === "street" || prField === "contact")) {
      await pickPropertyWithCompany(list[0]);
      return;
    }
    await showPropertyBrowse(
      list,
      "Enter=Select  Ins=Add  Ctrl-Home=Edit  Esc=Back"
    );
  }

  async function pickPropertyWithCompany(
    p: Property,
    extras?: { focusInvoice?: number }
  ) {
    let co = company;
    if (!co || co.companyNo !== p.companyNo) {
      co = (await api.getCompany(p.companyNo)) ?? null;
    }
    if (!co) {
      setMsg(`--> Company ${p.companyNo} for this property was not found !!`);
      setMsgKind("error");
      return;
    }
    setCompany(co);
    setProperty(p);
    if (extras) onReady(co, p, extras);
    else onReady(co, p);
  }

  async function pickInvoiceSite(inv: Invoice) {
    const props = await api.listProperties({
      companyNo: inv.companyNo,
      limit: 2000,
    });
    const pr =
      props.find((p) => p.proNo === inv.proNo) ??
      ({
        ...emptyProperty(inv.companyNo),
        proNo: inv.proNo,
        name: inv.propertyName ?? "",
        street: inv.propertyStreet ?? "",
      } satisfies Property);
    await pickPropertyWithCompany(pr, { focusInvoice: inv.invoice });
  }

  async function searchByInvoiceNumber(raw: string) {
    noticeRef.current = "";
    const q = raw.trim();
    if (!q) {
      setMsg("--> enter invoice number !!");
      setMsgKind("error");
      return;
    }
    const n = Number.parseInt(q, 10);
    if (!Number.isFinite(n) || n < 1) {
      setMsg("--> enter invoice number !!");
      setMsgKind("error");
      return;
    }
    const data = await api.listInvoices({
      search: String(n),
      includeVoided: true,
      limit: 2000,
    });
    const hits = data.filter((i) => i.invoice === n);
    if (hits.length === 0) {
      setMsg(`--> Invoice #${n} does not exist !!`);
      setMsgKind("error");
      return;
    }
    const sameSite = hits.every(
      (i) =>
        i.companyNo === hits[0].companyNo && i.proNo === hits[0].proNo
    );
    if (sameSite) {
      await pickInvoiceSite(hits[0]);
      return;
    }
    setInvoiceHits(hits);
    invBrowse.setIndex(0);
    pushPhase("inv-browse");
    setMsg("Enter=Select  Esc=Back  (matched invoices)");
    setMsgKind("default");
  }

  function selectProperty(p: Property) {
    attempt(pickPropertyWithCompany(p));
  }

  function filterProperties(all: Property[], q: string, field: PrField): Property[] {
    if (field === "no") {
      const exact = all.filter((p) => p.proNo.trim() === q);
      if (exact.length) return exact;
      return all.filter((p) => p.proNo.startsWith(q));
    }
    if (field === "name") {
      return all.filter((p) => p.name.toUpperCase().includes(q.toUpperCase()));
    }
    if (field === "phone") {
      return all.filter((p) => p.phone.includes(q) || p.phone2.includes(q));
    }
    if (field === "contact") {
      return all.filter((p) => matchesPropertyContact(p, q));
    }
    return all.filter((p) => matchesPropertyAddress(p, q));
  }

  /** First-screen search across all properties (any company). */
  async function searchPropertiesGlobal(raw: string) {
    noticeRef.current = "";
    const q = raw.trim();
    const all = await api.listProperties({
      search: q === "?" ? "" : q,
      limit: 2000,
    });

    if (q === "?") {
      if (all.length === 0) {
        setMsg("No properties on file. Search a company first, then Ins to add.");
        setMsgKind("error");
        return;
      }
      setCompany(null);
      await showPropertyBrowse(all, "Enter=Select  Esc=Back  (all properties)");
      return;
    }
    if (!q) {
      setMsg("--> enter search value or ? for first !!");
      setMsgKind("error");
      return;
    }

    let list = filterProperties(all, q, prField);
    if (list.length === 0 && q) {
      list = all.filter(
        (p) =>
          matchesPropertyAddress(p, q) ||
          matchesPropertyContact(p, q) ||
          p.name.toUpperCase().includes(q.toUpperCase()) ||
          p.proNo.includes(q)
      );
    }

    if (list.length === 0) {
      setMsg("--> property does not exist !! Search company, or Ins to add.");
      setMsgKind("error");
      return;
    }
    if (list.length === 1) {
      await pickPropertyWithCompany(list[0]);
      return;
    }
    setCompany(null);
    await showPropertyBrowse(list, "Enter=Select  Esc=Back  (matched properties)");
  }

  function showPropertyBrowse(list: Property[], browseMsg: string) {
    setPropertySort(DEFAULT_PROPERTY_SORT);
    setProperties(list);
    prBrowse.setIndex(0);
    pushPhase("pr-browse");
    setMsg(browseMsg);
    setMsgKind("default");
  }

  function editPropertyFromList(p: Property, index: number) {
    prBrowse.setIndex(index);
    setIsNew(false);
    setEditPr({ ...p });
    pushPhase("pr-edit");
    setMsg("Esc=Cancel, Cntr_S=Save & Exit, Edit=Arrow_Key");
  }

  async function saveCompany() {
    if (!editCo?.name.trim()) {
      setMsg("--> Company Name required !!");
      setMsgKind("error");
      return;
    }
    if (!editCo.companyNo.trim()) {
      editCo.companyNo = await nextAssignedCompanyNo();
    }
    try {
      if (!editCo.enterDate) editCo.enterDate = today();
      await api.saveCompany(editCo);
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
      const saved = editPr;
      await api.saveProperty(saved);
      setProperties((rows) => {
        const index = rows.findIndex(
          (row) =>
            row.companyNo === saved.companyNo && row.proNo === saved.proNo
        );
        if (index < 0) return [...rows, saved];
        return rows.map((row, i) => (i === index ? saved : row));
      });
      setEditPr(null);
      if (phaseRef.current === "pr-edit") {
        const back = trailRef.current.pop() ?? "pr-browse";
        phaseRef.current = back;
        setPhase(back);
      }
      selectProperty(saved);
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    }
  }

  async function confirmDeleteCompany() {
    if (!company) return;
    const snapshot = { ...company, voided: false };
    try {
      await api.deleteCompany(company.companyNo);
      setAskDeleteCompany(false);
      resetToCompanySearch(`Company ${company.companyNo} deleted.`);
      pushUndoDelete(async () => {
        await api.saveCompany(snapshot);
        setMsg(`Company ${snapshot.companyNo} restored.`);
        setMsgKind("info");
      });
    } catch (e) {
      setAskDeleteCompany(false);
      setMsg(String(e));
      setMsgKind("error");
    }
  }

  function deleteCompanyToolbar() {
    if (process !== "invoice" || !company) return null;
    if (phase !== "pr-browse" && phase !== "pr-search") return null;
    return (
      <div className="dos-company-toolbar">
        <span>
          {company.companyNo} {company.name}
        </span>
        <button
          type="button"
          className="dos-icon-btn danger"
          aria-label="Delete company"
          title="Delete company"
          onClick={() => setAskDeleteCompany(true)}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path
              fill="currentColor"
              d="M6 1h4l1 1.5H15v2H1v-2h4L6 1zm1 5h2v7H7V6zm4 0h2v7h-2V6zM3 6h2v7H3V6zm1 9h8l1-8H3l1 8z"
            />
          </svg>
        </button>
      </div>
    );
  }

  function editCompanyFromList(c: Company, index: number) {
    coBrowse.setIndex(index);
    setIsNew(false);
    setEditCo({ ...c });
    pushPhase("co-edit");
    setMsg("Esc=Cancel, Cntr_S=Save & Exit, Edit=Arrow_Key");
  }

  const listedProperties =
    company == null ? sortProperties(properties, propertySort) : properties;

  useDosKeys({
    forceNav:
      phase === "co-browse" ||
      phase === "pr-browse" ||
      phase === "inv-browse",
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
      if (askDeleteCompany) {
        setAskDeleteCompany(false);
        return;
      }
      goBackScreen();
    },
    onF1: () => setHelp(true),
    onInsert: () => {
      if (help || askAdd || askDeleteCompany) return;
      if (phase === "co-edit" || phase === "pr-edit") return;
      if (phase === "co-search" || phase === "co-browse") {
        void beginNewCompany();
        return;
      }
      if (phase === "pr-search" || phase === "pr-browse") {
        if (!company) {
          setMsg("Select a company first, then Ins to add a property.");
          setMsgKind("error");
          return;
        }
        const companyNo = company.companyNo;
        attempt(
          (async () => {
            const all = await api.listProperties({
              companyNo,
              limit: 5000,
            });
            setIsNew(true);
            setEditPr(draftProperty(companyNo, all));
            pushPhase("pr-edit");
            setMsg("Enter Property Information (Esc=Exit) !");
          })()
        );
      }
    },
    onCtrlHome: () => {
      if (phase === "co-browse" && companies[coBrowse.index]) {
        editCompanyFromList(companies[coBrowse.index], coBrowse.index);
      } else if (phase === "pr-browse" && listedProperties[prBrowse.index]) {
        editPropertyFromList(
          listedProperties[prBrowse.index],
          prBrowse.index
        );
      }
    },
    onEnter: () => {
      if (phase === "co-browse" && companies[coBrowse.index]) {
        attempt(selectCompany(companies[coBrowse.index]));
      } else if (phase === "pr-browse" && listedProperties[prBrowse.index]) {
        selectProperty(listedProperties[prBrowse.index]);
      } else if (phase === "inv-browse" && invoiceHits[invBrowse.index]) {
        attempt(pickInvoiceSite(invoiceHits[invBrowse.index]));
      } else if (phase === "co-search") {
        if (firstKind === "invoice") attempt(searchByInvoiceNumber(query));
        else if (firstKind === "property") attempt(searchPropertiesGlobal(query));
        else attempt(searchCompanies(query));
      } else if (phase === "pr-search") {
        attempt(searchProperties(query));
      }
    },
    onCtrlS: () => {
      if (phase === "co-edit") saveCompany();
      if (phase === "pr-edit") saveProperty();
    },
    onHome: () => {
      if (phase === "co-browse" && companies[coBrowse.index]) {
        setIsNew(false);
        setEditCo({ ...companies[coBrowse.index] });
        pushPhase("co-edit");
        setMsg("Detaill Company Information — Esc=Cancel, Ctrl-S=Save");
      } else if (phase === "pr-browse" && listedProperties[prBrowse.index]) {
        editPropertyFromList(
          listedProperties[prBrowse.index],
          prBrowse.index
        );
      } else if (phase === "co-browse") coBrowse.home();
      else if (phase === "pr-browse") prBrowse.home();
    },
    onArrowUp:
      phase === "co-browse"
        ? coBrowse.up
        : phase === "pr-browse"
          ? prBrowse.up
          : phase === "inv-browse"
            ? invBrowse.up
            : undefined,
    onArrowDown:
      phase === "co-browse"
        ? coBrowse.down
        : phase === "pr-browse"
          ? prBrowse.down
          : phase === "inv-browse"
            ? invBrowse.down
            : undefined,
    onPageUp:
      phase === "co-browse"
        ? coBrowse.pageUp
        : phase === "pr-browse"
          ? prBrowse.pageUp
          : phase === "inv-browse"
            ? invBrowse.pageUp
            : undefined,
    onPageDown:
      phase === "co-browse"
        ? coBrowse.pageDown
        : phase === "pr-browse"
          ? prBrowse.pageDown
          : phase === "inv-browse"
            ? invBrowse.pageDown
            : undefined,
    onEnd:
      phase === "co-browse"
        ? coBrowse.end
        : phase === "pr-browse"
          ? prBrowse.end
          : phase === "inv-browse"
            ? invBrowse.end
            : undefined,
    onChar: (ch) => {
      if (askDeleteCompany) {
        if (ch === "y" || ch === "Y") {
          void confirmDeleteCompany();
          return true;
        }
        if (ch === "n" || ch === "N") {
          setAskDeleteCompany(false);
          return true;
        }
        return true;
      }
      if (askAdd) {
        if (ch === "y" || ch === "Y") {
          setAskAdd(false);
          if (editCo && !editPr) pushPhase("co-edit");
          else if (editPr) pushPhase("pr-edit");
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
  }, active);

  if (!active) return null;

  const statusKeys =
    phase === "co-edit" || phase === "pr-edit"
      ? FORM_KEYS
      : phase === "co-browse" || phase === "pr-browse" || phase === "inv-browse"
        ? SEARCH_BROWSE_KEYS
        : [
            { key: "Esc", label: "Exit" },
            { key: "Ins", label: "Add" },
            { key: "Enter", label: "Search" },
            { key: "?", label: "First" },
            { key: "F1", label: "Help" },
          ];

  const invoiceNumberField = (
    <DotField label="Invoice Number" width={16}>
      <input
        className="dos-input w15"
        aria-label="Invoice Number"
        value={firstKind === "invoice" ? query : ""}
        autoFocus={process === "cash" || process === "invoice"}
        onFocus={() => {
          setFirstKind("invoice");
          setQuery("");
        }}
        onChange={(e) => {
          setFirstKind("invoice");
          setQuery(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            setFirstKind("invoice");
            attempt(searchByInvoiceNumber(e.currentTarget.value));
          }
        }}
      />
    </DotField>
  );

  const screenTitle =
    phase === "co-browse"
      ? coField === "name"
        ? " Company Name Order "
        : coField === "phone"
          ? " Company Phone Order "
          : coField === "contact"
            ? " Company Contact Order "
            : " Company NO Order "
      : phase === "pr-browse"
        ? !company
          ? prField === "contact"
            ? " Property Contact Order "
            : " Property Street Order "
          : prField === "name"
            ? " Property Name Order "
            : prField === "phone"
              ? " Property Phone Order "
              : prField === "contact"
                ? " Property Contact Order "
                : " Property NO Order "
        : phase === "inv-browse"
          ? " Invoice Number Order "
          : title;

  return (
    <Screen
      statusKeys={statusKeys}
      title={screenTitle}
      message={msg}
      messageKind={msgKind}
      left={company ? `Co:${company.companyNo}` : undefined}
      right={property ? `Pro:${property.proNo}` : undefined}
    >
      {/* ── Company search ─────────────────────────────── */}
      {phase === "co-search" && (
        <div className="dos-main-wrap">
          <div
            className="dos-menu-frame"
            style={{ width: "max-content", maxWidth: "none", minWidth: "min(72ch, 100%)" }}
          >
            <div className="menu-body" style={{ padding: "0.8em 2ch" }}>
              <div className="dos-form">
                {(process === "cash" || process === "invoice") &&
                  invoiceNumberField}
                <DotField label="Company NO" width={16}>
                  <input
                    className="dos-input w15"
                    aria-label="Company NO"
                    value={
                      firstKind === "company" && coField === "no"
                        ? query || "?"
                        : "?"
                    }
                    onFocus={(e) => {
                      if (!(firstKind === "company" && coField === "no")) {
                        setFirstKind("company");
                        setCoField("no");
                        setQuery("?");
                      }
                      const el = e.currentTarget;
                      requestAnimationFrame(() => el.select());
                    }}
                    onChange={(e) => {
                      const prev =
                        firstKind === "company" && coField === "no"
                          ? query || "?"
                          : "?";
                      setFirstKind("company");
                      setCoField("no");
                      setQuery(typedOverQuestion(prev, e.target.value));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        setCoField("no");
                        attempt(searchCompanies(e.currentTarget.value || "?"));
                      }
                    }}
                    autoFocus={
                      process !== "cash" &&
                      process !== "invoice" &&
                      coField === "no"
                    }
                    placeholder="? = first"
                  />
                </DotField>
                <DotField label="Company Name" width={16}>
                  <input
                    className="dos-input w30"
                    aria-label="Company Name"
                    value={firstKind === "company" && coField === "name" ? query : ""}
                    onFocus={() => {
                      setFirstKind("company");
                      setCoField("name");
                      setQuery("");
                    }}
                    onChange={(e) => {
                      setFirstKind("company");
                      setCoField("name");
                      setQuery(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        attempt(searchCompanies(e.currentTarget.value));
                      }
                    }}
                  />
                </DotField>
                <DotField label="Company Phone" width={16}>
                  <input
                    className="dos-input w15"
                    aria-label="Company Phone"
                    value={firstKind === "company" && coField === "phone" ? query : ""}
                    onFocus={() => {
                      setFirstKind("company");
                      setCoField("phone");
                      setQuery("");
                    }}
                    onChange={(e) => {
                      setFirstKind("company");
                      setCoField("phone");
                      setQuery(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        attempt(searchCompanies(e.currentTarget.value));
                      }
                    }}
                  />
                </DotField>
                <DotField label="Company Contact" width={16}>
                  <input
                    className="dos-input w30"
                    aria-label="Company Contact"
                    value={
                      firstKind === "company" && coField === "contact"
                        ? query
                        : ""
                    }
                    onFocus={() => {
                      setFirstKind("company");
                      setCoField("contact");
                      setQuery("");
                    }}
                    onChange={(e) => {
                      setFirstKind("company");
                      setCoField("contact");
                      setQuery(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        setFirstKind("company");
                        setCoField("contact");
                        attempt(searchCompanies(e.currentTarget.value));
                      }
                    }}
                  />
                </DotField>
                <DotField label="Property Street" width={16}>
                  <input
                    className="dos-input w45"
                    aria-label="Property Street"
                    value={
                      firstKind === "property" && prField === "street"
                        ? query
                        : ""
                    }
                    onFocus={() => {
                      setFirstKind("property");
                      setPrField("street");
                      setQuery("");
                    }}
                    onChange={(e) => {
                      setFirstKind("property");
                      setPrField("street");
                      setQuery(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        setFirstKind("property");
                        setPrField("street");
                        attempt(searchPropertiesGlobal(e.currentTarget.value));
                      }
                    }}
                  />
                </DotField>
                <DotField label="Property Contact" width={16}>
                  <input
                    className="dos-input w30"
                    aria-label="Property Contact"
                    value={
                      firstKind === "property" && prField === "contact"
                        ? query
                        : ""
                    }
                    onFocus={() => {
                      setFirstKind("property");
                      setPrField("contact");
                      setQuery("");
                    }}
                    onChange={(e) => {
                      setFirstKind("property");
                      setPrField("contact");
                      setQuery(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        setFirstKind("property");
                        setPrField("contact");
                        attempt(searchPropertiesGlobal(e.currentTarget.value));
                      }
                    }}
                  />
                </DotField>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Company browse ─────────────────────────────── */}
      {phase === "co-browse" && (
        <div className="dos-browse">
          <ContentGrid columns={4}>
            <div className="browse-grid browse-grid-header">
              <div>Company NO</div>
              <div>Company Name</div>
              <div>Phone</div>
              <div>Contact</div>
            </div>
            {companies.map((c, i) => (
              <button
                key={c.companyNo}
                className={`dos-row ${i === coBrowse.index ? "selected" : ""} browse-grid`}
                onMouseEnter={() => {
                  if (pointerHoverMuted()) return;
                  coBrowse.setIndex(i);
                }}
                onClick={() => attempt(selectCompany(c))}
                onDoubleClick={() => attempt(selectCompany(c))}
                onContextMenu={(e) => {
                  // Company NO Order only: same edit as Ctrl-Home, no browser menu.
                  if (coField !== "no") return;
                  e.preventDefault();
                  editCompanyFromList(c, i);
                }}
              >
                <div>{c.companyNo}</div>
                <div>{c.name}</div>
                <div>{c.phone}</div>
                <div>{c.contact}</div>
              </button>
            ))}
          </ContentGrid>
        </div>
      )}

      {/* ── Invoice number browse ──────────────────────── */}
      {phase === "inv-browse" && (
        <div className="dos-browse">
          <ContentGrid columns={5}>
            <div className="browse-grid browse-grid-header">
              <div>Inv#</div>
              <div>Inv_Date</div>
              <div>Co#</div>
              <div>Pro</div>
              <div>Street</div>
            </div>
            {invoiceHits.map((inv, i) => (
              <button
                key={`${inv.companyNo}-${inv.proNo}-${inv.salesDate}-${inv.invoice}`}
                className={`dos-row ${i === invBrowse.index ? "selected" : ""} browse-grid`}
                onMouseEnter={() => {
                  if (pointerHoverMuted()) return;
                  invBrowse.setIndex(i);
                }}
                onClick={() => attempt(pickInvoiceSite(inv))}
              >
                <div>{inv.invoice}</div>
                <div>{fmtDate(inv.salesDate)}</div>
                <div>{inv.companyNo}</div>
                <div>{inv.proNo}</div>
                <div
                  className="property-street"
                  title={(inv.propertyStreet || inv.propertyName || "").trim()}
                >
                  {(inv.propertyStreet || inv.propertyName || "").trim()}
                </div>
              </button>
            ))}
          </ContentGrid>
        </div>
      )}

      {/* ── Property search ────────────────────────────── */}
      {deleteCompanyToolbar()}
      {phase === "pr-search" && company && (
        <div className="dos-main-wrap">
          <div className="dos-menu-frame" style={{ minWidth: "min(48ch, 100%)" }}>
            <div className="menu-body" style={{ padding: "0.8em 2ch" }}>
              <div className="dos-form">
                <DotField label="Property NO" width={16}>
                  <input
                    className="dos-input w10"
                    aria-label="Property NO"
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
                        attempt(searchProperties(e.currentTarget.value));
                      }
                    }}
                    autoFocus
                    placeholder="? = first"
                  />
                </DotField>
                <DotField label="Property Name" width={16}>
                  <input
                    className="dos-input w30"
                    aria-label="Property Name"
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
                        attempt(searchProperties(e.currentTarget.value));
                      }
                    }}
                  />
                </DotField>
                <DotField label="Property Phone" width={16}>
                  <input
                    className="dos-input w15"
                    aria-label="Property Phone"
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
                        attempt(searchProperties(e.currentTarget.value));
                      }
                    }}
                  />
                </DotField>
                <DotField label="Property Contact" width={16}>
                  <input
                    className="dos-input w30"
                    aria-label="Property Contact"
                    value={prField === "contact" ? query : ""}
                    onFocus={() => {
                      setPrField("contact");
                      setQuery("");
                    }}
                    onChange={(e) => {
                      setPrField("contact");
                      setQuery(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        attempt(searchProperties(e.currentTarget.value));
                      }
                    }}
                  />
                </DotField>
              </div>
            </div>
          </div>
        </div>
      )}
      {phase === "pr-browse" && (
        <div className="dos-browse">
          {company ? (
            <ContentGrid columns={7}>
              <div className="browse-grid browse-grid-header">
                <div>ProNO</div>
                <div>Name</div>
                <div>Street</div>
                <div>City</div>
                <div>St</div>
                <div>Zip</div>
                <div>Contact</div>
              </div>
              {listedProperties.map((p, i) => (
                <button
                  key={`${p.companyNo}-${p.proNo}`}
                  className={`dos-row ${i === prBrowse.index ? "selected" : ""} browse-grid`}
                  onMouseEnter={() => {
                    if (pointerHoverMuted()) return;
                    prBrowse.setIndex(i);
                  }}
                  onClick={() => selectProperty(p)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    editPropertyFromList(p, i);
                  }}
                >
                  <div>{p.proNo}</div>
                  <div>{p.name}</div>
                  <PropertyPlaceCells p={p} />
                  <div>{propertyContactName(p)}</div>
                </button>
              ))}
            </ContentGrid>
          ) : (
            <ContentGrid columns={7}>
              <div className="browse-grid browse-grid-header">
                <button
                  type="button"
                  className="sort-btn"
                  onClick={() =>
                    setPropertySort((cur) => nextPropertySort(cur, "company"))
                  }
                >
                  CoNO{propertySortMark(propertySort, "company")}
                </button>
                <div>ProNO</div>
                <button
                  type="button"
                  className="sort-btn"
                  onClick={() =>
                    setPropertySort((cur) => nextPropertySort(cur, "street"))
                  }
                >
                  Street{propertySortMark(propertySort, "street")}
                </button>
                <div>City</div>
                <div>St</div>
                <div>Zip</div>
                <div>Contact</div>
              </div>
              {listedProperties.map((p, i) => (
                <button
                  key={`${p.companyNo}-${p.proNo}`}
                  className={`dos-row ${i === prBrowse.index ? "selected" : ""} browse-grid`}
                  onMouseEnter={() => {
                    if (pointerHoverMuted()) return;
                    prBrowse.setIndex(i);
                  }}
                  onClick={() => selectProperty(p)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    editPropertyFromList(p, i);
                  }}
                >
                  <div>{p.companyNo}</div>
                  <div>{p.proNo}</div>
                  <PropertyPlaceCells p={p} />
                  <div>{propertyContactName(p)}</div>
                </button>
              ))}
            </ContentGrid>
          )}
        </div>
      )}

      {/* ── Company edit form ──────────────────────────── */}
      {phase === "co-edit" && editCo && (
        <Dialog
          title={
            isNew ? "Company Information" : "Detaill Company Information"
          }
          foot="Esc=Cancel, Cntr_S=Save & Exit, Edit=Arrow_Key"
        >
          <div className="dos-form">
            <DotField label="Company NO" width={14}>
              <input
                className="dos-input w5"
                value={editCo.companyNo}
                disabled
                readOnly
              />
            </DotField>
            <DotField label="Company Name" width={14}>
              <input
                className="dos-input w30"
                value={editCo.name}
                onChange={(e) => setEditCo({ ...editCo, name: e.target.value })}
                autoFocus={isNew}
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
            <DotField label="Cell#" width={14}>
              <input
                className="dos-input w15"
                aria-label="Cell#"
                value={editCo.phone}
                onChange={(e) =>
                  setEditCo({ ...editCo, phone: e.target.value })
                }
              />
            </DotField>
            <DotField label="Office#" width={14}>
              <input
                className="dos-input w15"
                aria-label="Office#"
                value={editCo.phone2}
                onChange={(e) =>
                  setEditCo({ ...editCo, phone2: e.target.value })
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
          foot="Esc=Cancel, Cntr_S=Save & Exit, Edit=Arrow_Key"
        >
          <div className="dos-form">
            <DotField label="Property NO" width={14}>
              <input
                className="dos-input w5"
                aria-label="Property NO"
                value={editPr.proNo}
                readOnly
                disabled
                aria-readonly="true"
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
                className="dos-input w45"
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
            <DotField label="Gate Code" width={14}>
              <input
                className="dos-input w12"
                aria-label="Gate Code"
                value={editPr.keyInfo}
                onChange={(e) =>
                  setEditPr({ ...editPr, keyInfo: e.target.value })
                }
              />
            </DotField>
            <DotField label="Lock Box" width={14}>
              <input
                className="dos-input w15"
                aria-label="Lock Box"
                value={editPr.paintTime}
                onChange={(e) =>
                  setEditPr({ ...editPr, paintTime: e.target.value })
                }
              />
            </DotField>
            <DotField label="E-mail" width={14}>
              <input
                className="dos-input w12"
                aria-label="E-mail"
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

      {askDeleteCompany && company && (
        <Prompt
          question={`Are you sure you want to delete company ${company.companyNo} ${company.name} (Y/N) ?`}
          onYes={() => void confirmDeleteCompany()}
          onNo={() => setAskDeleteCompany(false)}
        />
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
            if (editPr) pushPhase("pr-edit");
            else pushPhase("co-edit");
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
