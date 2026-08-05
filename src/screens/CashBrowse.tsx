import { useCallback, useEffect, useState } from "react";
import { api, CashReceipt, emptyCashReceipt, Invoice } from "../api";
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

export function CashBrowse({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<CashReceipt[]>([]);
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [editing, setEditing] = useState<CashReceipt | null>(null);
  const [openInvs, setOpenInvs] = useState<Invoice[]>([]);
  const [msg, setMsg] = useState("Ins=Add Receipt  Del=Void  Esc=Exit");
  const [msgKind, setMsgKind] = useState<"default" | "error" | "info">("default");
  const [voidAsk, setVoidAsk] = useState(false);
  const [help, setHelp] = useState(false);
  const { index, setIndex, up, down, pageUp, pageDown, home, end } =
    useBrowseIndex(rows.length);

  const load = useCallback(async () => {
    try {
      const data = await api.listCashReceipts({
        search,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        limit: 400,
      });
      setRows(data);
      const tot = data.reduce((s, r) => s + r.payment, 0);
      setMsg(
        `${data.length} receipts  Total: ${money(tot)}  —  Ins=Add  Del=Void  Esc=Exit`
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
    const invs = await api.listInvoices({ limit: 500 });
    setOpenInvs(invs.filter((i) => !i.voided && i.balance > 0.005));
    setEditing(emptyCashReceipt());
    setMsg("Enter Your Payment Data(Esc=Cancel) !");
  }

  useDosKeys({
    forceNav: !editing,
    onEscape: () => {
      if (help) setHelp(false);
      else if (voidAsk) setVoidAsk(false);
      else if (editing) {
        setEditing(null);
        setMsg("Ins=Add Receipt  Del=Void  Esc=Exit");
      } else onBack();
    },
    onF1: () => setHelp(true),
    onInsert: () => {
      if (!editing) openNew();
    },
    onDelete: () => {
      if (!editing && current) setVoidAsk(true);
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
    onEnter: () => {
      if (editing) save();
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
    if (!editing.companyNo || !editing.invoice || !editing.payment) {
      setMsg("Payment is zero !  Retry !!");
      setMsgKind("error");
      return;
    }
    try {
      await api.saveCashReceipt(editing);
      setEditing(null);
      setMsg("Receipt posted.");
      setMsgKind("info");
      await load();
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    }
  }

  async function doVoid() {
    if (!current?.id) return;
    await api.deleteCashReceipt(current.id);
    setVoidAsk(false);
    await load();
  }

  function pickInv(invNo: number) {
    if (!editing) return;
    const inv = openInvs.find((i) => i.invoice === invNo);
    if (!inv) {
      setEditing({ ...editing, invoice: invNo });
      return;
    }
    setEditing({
      ...editing,
      invoice: inv.invoice,
      companyNo: inv.companyNo,
      salesDate: inv.salesDate,
      payment: inv.balance,
    });
  }

  return (
    <Screen
      statusKeys={editing ? FORM_KEYS : BROWSE_KEYS}
      title=" Cash Receipts Process "
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
              {"Inv#  Inv_Date  Com# Company                       PayDate  PayRefno      Payment"}
            </div>
            <div className="dos-browse-body">
              {rows.map((r, i) => (
                <button
                  key={r.id}
                  className={`dos-row ${i === index ? "selected" : ""}`}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => setIndex(i)}
                >
                  {padL(r.invoice, 5)}{" "}
                  {padR(fmtDate(r.salesDate), 10)}{" "}
                  {padR(r.companyNo, 4)}{" "}
                  {padR(r.companyName || "", 28)}{" "}
                  {padR(fmtDate(r.payDate), 8)}{" "}
                  {padR(r.payRefNo, 10)}{" "}
                  {padL(money(r.payment), 10)}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {editing && (
        <Dialog
          title="Enter Your Payment Data"
          foot="Esc=Cancel  Ctrl-W / Enter=Post Receipt"
        >
          <div className="dos-form">
            <DotField label="Open Invoice" width={16}>
              <select
                className="dos-select"
                value={editing.invoice || ""}
                onChange={(e) => pickInv(parseInt(e.target.value, 10) || 0)}
                autoFocus
              >
                <option value="">Select open invoice...</option>
                {openInvs.map((i) => (
                  <option key={`${i.companyNo}-${i.invoice}`} value={i.invoice}>
                    #{i.invoice} {i.companyName || i.companyNo} bal{" "}
                    {money(i.balance)}
                  </option>
                ))}
              </select>
            </DotField>
            <DotField label="Invoice_No" width={16}>
              <input
                className="dos-input w8"
                type="number"
                value={editing.invoice || ""}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    invoice: parseInt(e.target.value, 10) || 0,
                  })
                }
              />
            </DotField>
            <DotField label="Company No" width={16}>
              <input
                className="dos-input w5"
                value={editing.companyNo}
                onChange={(e) =>
                  setEditing({ ...editing, companyNo: e.target.value })
                }
              />
            </DotField>
            <DotField label="Pay Date" width={16}>
              <DateInput
                value={editing.payDate || today()}
                onChange={(e) =>
                  setEditing({ ...editing, payDate: e.target.value })
                }
              />
            </DotField>
            <DotField label="Check/Ref" width={16}>
              <input
                className="dos-input w12"
                value={editing.payRefNo}
                onChange={(e) =>
                  setEditing({ ...editing, payRefNo: e.target.value })
                }
              />
            </DotField>
            <DotField label="Amount Paid" width={16}>
              <input
                className="dos-input w12 num"
                type="number"
                step="0.01"
                value={editing.payment}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    payment: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </DotField>
          </div>
        </Dialog>
      )}

      {voidAsk && (
        <Prompt
          question="Do you want Void (Y/N) ?"
          onYes={doVoid}
          onNo={() => setVoidAsk(false)}
        />
      )}
      {help && <HelpOverlay onClose={() => setHelp(false)} />}
    </Screen>
  );
}
