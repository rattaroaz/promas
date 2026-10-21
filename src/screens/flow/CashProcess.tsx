/**
 * Cash Receipts Process — company ledger + payment + Auto Receipt.
 * Original keys: Ins / Home / PgUp / PgDn / Esc / (A)uto_Receipt
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  Company,
  Invoice,
  CashReceipt,
  emptyCashReceipt,
} from "../../api";
import { pointerHoverMuted, useBrowseIndex, useDosKeys } from "../../dos/hooks";
import {
  Screen,
  Dialog,
  HelpOverlay,
  FORM_KEYS,
  CASH_KEYS,
} from "../../dos/Shell";
import { DotField } from "../../dos/Field";
import { MoneyInput } from "../../dos/MoneyInput";
import { formatMoneyInput } from "../../dos/moneyFormat";
import { DateInput } from "../../dos/DateInput";
import { money, fmtDate, today } from "../../dos/utils";

interface InvoiceWithLatestReceipt extends Invoice {
  latestReceiptDate?: string;
  latestReceiptRef?: string;
}

export function CashProcess({
  company,
  onBack,
  focusInvoice,
}: {
  company: Company;
  onBack: () => void;
  focusInvoice?: number;
}) {
  const [invoices, setInvoices] = useState<InvoiceWithLatestReceipt[]>([]);
  const [editing, setEditing] = useState<CashReceipt | null>(null);
  const [autoMode, setAutoMode] = useState(false);
  const [autoAmount, setAutoAmount] = useState(0);
  const [autoRef, setAutoRef] = useState("");
  const [autoDate, setAutoDate] = useState(today());
  const [msg, setMsg] = useState(
    "Ins=Payment  A=Auto_Receipt  Esc=Exit"
  );
  const [msgKind, setMsgKind] = useState<"default" | "error" | "info">(
    "default"
  );
  const [help, setHelp] = useState(false);
  const [confirmPay, setConfirmPay] = useState(false);
  const { index, setIndex, up, down, pageUp, pageDown, end } =
    useBrowseIndex(invoices.length);

  const load = useCallback(async () => {
    const invs = await api.listInvoices({
      companyNo: company.companyNo,
      limit: 2000,
    });
    const mine = invs.filter(
      (i) => !i.voided && (focusInvoice == null || i.invoice === focusInvoice)
    );
    // Unpaid invoices stay above paid ones. Inside each group, newest first.
    mine.sort((a, b) => {
      const aOpen = a.balance > 0;
      const bOpen = b.balance > 0;
      if (aOpen !== bOpen) return aOpen ? -1 : 1;
      const byDate = b.salesDate.localeCompare(a.salesDate);
      if (byDate !== 0) return byDate;
      return b.invoice - a.invoice;
    });

    // Fetch receipts to populate latest receipt date and ref for each invoice
    const receipts = await api.listCashReceipts({
      companyNo: company.companyNo,
      limit: 10000,
    });
    
    const withReceipts: InvoiceWithLatestReceipt[] = mine.map((inv) => {
      const invReceipts = receipts
        .filter((r) => r.invoice === inv.invoice && r.salesDate === inv.salesDate && !r.voided)
        .sort((a, b) => b.payDate.localeCompare(a.payDate));
      
      const latest = invReceipts[0];
      return {
        ...inv,
        latestReceiptDate: latest?.payDate,
        latestReceiptRef: latest?.payRefNo,
      };
    });

    setInvoices(withReceipts);
    if (focusInvoice != null && withReceipts.length) setIndex(0);
    const open = withReceipts.reduce((s, i) => s + Math.max(0, i.balance), 0);
    setMsg(
      `*****   Customer Ledger   *****  Open ${money(open)}  Ins=Pay  A=Auto  Esc=Back`
    );
  }, [company.companyNo, focusInvoice, setIndex]);

  useEffect(() => {
    load();
  }, [load]);

  const current = invoices[index] ?? null;
  const unpaidTotal = invoices.reduce(
    (s, i) => s + Math.max(0, i.balance),
    0
  );

  function startPayment(inv?: Invoice) {
    const target = inv || current;
    if (!target) {
      setMsg("--> Select an invoice first !!");
      setMsgKind("error");
      return;
    }
    if (target.balance <= 0) {
      setMsg("Paid Invoice — no balance due.");
      setMsgKind("info");
      return;
    }
    const r = emptyCashReceipt();
    r.companyNo = company.companyNo;
    r.salesDate = target.salesDate;
    r.invoice = target.invoice;
    r.payment = target.balance;
    r.payDate = today();
    setAutoMode(false);
    setConfirmPay(false);
    setEditing(r);
    setMsg("Enter Your Payment Data(Esc=Cancel) !");
    setMsgKind("default");
  }

  function startAuto() {
    setAutoMode(true);
    setAutoAmount(unpaidTotal);
    setAutoRef("");
    setAutoDate(today());
    setEditing(null);
    setMsg("Enter Automatic Receipt Data(Esc=Exit) !");
  }

  async function saveOne() {
    if (!editing) return;
    if (!editing.payment || editing.payment <= 0) {
      setMsg("Payment is zero. Press any key ...");
      setMsgKind("error");
      return;
    }
    const inv = invoices.find((i) => i.invoice === editing.invoice);
    if (inv && editing.payment > inv.balance + 0.005) {
      setMsg("Payment may not exceed Balance Due. Press any key ...");
      setMsgKind("error");
      return;
    }
    try {
      await api.saveCashReceipt({
        ...editing,
        payDate: editing.payDate || today(),
      });
      setConfirmPay(false);
      setEditing(null);
      await load();
      setMsg("Receipt posted.");
      setMsgKind("info");
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    }
  }

  /** Auto-apply lump payment oldest-open-first (original Auto_Receipt). */
  async function saveAuto() {
    if (!autoAmount || autoAmount <= 0) {
      setMsg("Payment is zero !  Retry !!");
      setMsgKind("error");
      return;
    }
    if (autoAmount > unpaidTotal + 0.005) {
      setMsg("Payment may not exceed Balance Due !");
      setMsgKind("error");
      return;
    }
    let remaining = autoAmount;
    const open = invoices
      .filter((i) => i.balance > 0.005)
      .sort(
        (a, b) =>
          a.salesDate.localeCompare(b.salesDate) || a.invoice - b.invoice
      );
    if (open.length === 0) {
      setMsg(
        "--> does not exsit in Receivable File !! Press Enter to Exit ..."
      );
      setMsgKind("error");
      return;
    }
    try {
      for (const inv of open) {
        if (remaining <= 0.005) break;
        const pay = Math.min(remaining, inv.balance);
        await api.saveCashReceipt({
          companyNo: company.companyNo,
          salesDate: inv.salesDate,
          invoice: inv.invoice,
          payment: Math.round(pay * 100) / 100,
          payRefNo: autoRef,
          payDate: autoDate || today(),
          voided: false,
        });
        remaining = Math.round((remaining - pay) * 100) / 100;
      }
      setAutoMode(false);
      setMsg(
        remaining > 0.005
          ? `Auto Receipts Apply Finished. Remaining unapplied: ${money(remaining)}`
          : "Auto Receipts Apply Finished. Press any key to Exit ..."
      );
      setMsgKind("info");
      await load();
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    }
  }

  const saveOneRef = useRef(saveOne);
  saveOneRef.current = saveOne;

  function askToPost() {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setConfirmPay(true);
  }

  useEffect(() => {
    if (!editing || confirmPay) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      setConfirmPay(true);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [editing, confirmPay]);

  useEffect(() => {
    if (!confirmPay) return;
    let settled = false;
    const onKey = (e: KeyboardEvent) => {
      if (e.type !== "keydown") return;
      e.preventDefault();
      e.stopPropagation();
      if (settled) return;
      if (e.key === "y" || e.key === "Y") {
        settled = true;
        setConfirmPay(false);
        void saveOneRef.current();
        return;
      }
      if (e.key === "n" || e.key === "N" || e.key === "Escape") {
        settled = true;
        setConfirmPay(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [confirmPay]);

  useDosKeys({
    forceNav: !editing && !autoMode,
    onEscape: () => {
      if (help) setHelp(false);
      else if (confirmPay) setConfirmPay(false);
      else if (editing) {
        setEditing(null);
        setMsg("Ins=Payment  A=Auto_Receipt  Esc=Back");
      } else if (autoMode) {
        setAutoMode(false);
        setMsg("Ins=Payment  A=Auto_Receipt  Esc=Back");
      } else onBack();
    },
    onF1: () => setHelp(true),
    onInsert: () => {
      if (help) return;
      if (!editing && !autoMode) startPayment();
    },
    onEnter: () => {
      if (confirmPay) return;
      if (editing) askToPost();
      else if (autoMode) saveAuto();
      else if (current) startPayment(current);
    },
    onHome: () => {
      if (!editing && !autoMode) startAuto();
    },
    onArrowUp: !editing && !autoMode ? up : undefined,
    onArrowDown: !editing && !autoMode ? down : undefined,
    onPageUp: !editing && !autoMode ? pageUp : undefined,
    onPageDown: !editing && !autoMode ? pageDown : undefined,
    onEnd: !editing && !autoMode ? end : undefined,
    onCtrlS: () => {
      if (confirmPay) return;
      if (editing) saveOne();
      if (autoMode) saveAuto();
    },
    onChar: (ch) => {
      if (!editing && !autoMode && (ch === "a" || ch === "A")) {
        startAuto();
        return true;
      }
      return false;
    },
  });

  return (
    <Screen
      statusKeys={
        editing || autoMode
          ? FORM_KEYS
          : CASH_KEYS
      }
      title=" Cash Receipts Process "
      message={msg}
      messageKind={msgKind}
      left={company.companyNo}
      right={company.name.slice(0, 40)}
    >
      {!editing && !autoMode && (
        <>
          <div
            className="dos-info-banner"
            style={{
              padding: "0.3em 0.5ch",
              whiteSpace: "pre",
            }}
          >
            {`*****   Customer Ledger   *****
Company NO : ${company.companyNo}  ${company.name}`}
          </div>
          <div className="dos-browse">
            <div className="browse-grid browse-grid-header" style={{ gridTemplateColumns: "7ch 12ch 12ch 12ch 10ch 12ch 12ch 4ch" }}>
              <div>Inv_#</div>
              <div>Inv_Date</div>
              <div>Inv_amount</div>
              <div>PayDate</div>
              <div>Check/Ref</div>
              <div>Payamount</div>
              <div>Balance</div>
              <div>OK</div>
            </div>
            <div className="dos-browse-body">
              {invoices.map((inv, i) => (
                <button
                  key={`${inv.invoice}-${inv.salesDate}`}
                  className={`dos-row ${i === index ? "selected" : ""} browse-grid`}
                  style={{ gridTemplateColumns: "7ch 12ch 12ch 12ch 10ch 12ch 12ch 4ch" }}
                  onMouseEnter={() => {
                    if (pointerHoverMuted()) return;
                    setIndex(i);
                  }}
                  onClick={() => {
                    setIndex(i);
                    startPayment(inv);
                  }}
                >
                  <div>{inv.invoice}</div>
                  <div>{fmtDate(inv.salesDate)}</div>
                  <div>{money(inv.salesTotal)}</div>
                  <div>{inv.latestReceiptDate ? fmtDate(inv.latestReceiptDate) : ""}</div>
                  <div>{inv.latestReceiptRef || ""}</div>
                  <div>{money(inv.payTotal)}</div>
                  <div>{money(inv.balance)}</div>
                  <div>{inv.balance <= 0 ? "*" : ""}</div>
                </button>
              ))}
              {invoices.length === 0 && (
                <div
                  className="dos-row"
                  style={{ color: "var(--app-highlight)" }}
                >
                  {
                    "  --> does not exsit in Receivable File !! Press Enter to Exit ..."
                  }
                </div>
              )}
            </div>
            <div className="browse-grid" style={{ gridTemplateColumns: "7ch 12ch 12ch 12ch 10ch 12ch 12ch 4ch", color: "var(--app-highlight)", fontWeight: "bold", marginTop: "0.5em" }}>
              <div style={{ gridColumn: "1 / 7", textAlign: "right" }}>Unpaid Total</div>
              <div>{money(unpaidTotal)}</div>
              <div></div>
            </div>
          </div>
        </>
      )}

      {editing && (
        <Dialog
          title="Enter Your Payment Data(Esc=Cancel) !"
          foot="Esc=Cancel  Enter=Confirm  Ctrl-S=Post Receipt"
        >
          <div className="dos-form">
            <DotField label="Invoice_No" width={16}>
              <input
                className="dos-input w8"
                type="number"
                value={editing.invoice}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    invoice: parseInt(e.target.value, 10) || 0,
                  })
                }
              />
            </DotField>
            <DotField label="Invoice_Amount" width={16}>
              <input
                className="dos-input w12 num"
                aria-label="Invoice Amount"
                disabled
                value={formatMoneyInput(
                  invoices.find((i) => i.invoice === editing.invoice)?.salesTotal
                )}
              />
            </DotField>
            <DotField label="Paid Total" width={16}>
              <input
                className="dos-input w12 num"
                aria-label="Paid Total"
                disabled
                value={formatMoneyInput(
                  invoices.find((i) => i.invoice === editing.invoice)?.payTotal
                )}
              />
            </DotField>
            <DotField label="Balance" width={16}>
              <input
                className="dos-input w12 num"
                aria-label="Balance"
                disabled
                value={formatMoneyInput(
                  invoices.find((i) => i.invoice === editing.invoice)?.balance
                )}
              />
            </DotField>
            <DotField label="Pay Date" width={16}>
              <DateInput
                aria-label="Pay Date"
                value={editing.payDate || today()}
                onChange={(e) =>
                  setEditing({ ...editing, payDate: e.target.value })
                }
                autoFocus
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
              <MoneyInput
                className="dos-input w12 num"
                aria-label="Amount Paid"
                value={editing.payment}
                onValueChange={(payment) =>
                  setEditing({ ...editing, payment })
                }
              />
            </DotField>
          </div>
        </Dialog>
      )}

      {autoMode && (
        <Dialog
          title="Enter Automatic Receipt Data(Esc=Exit) !"
          foot="Esc=Cancel  Enter=Apply to open invoices (oldest first)"
        >
          <div className="dos-form">
            <div style={{ color: "var(--app-accent)", marginBottom: "0.5em" }}>
              Balance Due: {money(unpaidTotal)}
            </div>
            <DotField label="Pay Date" width={16}>
              <DateInput
                aria-label="Pay Date"
                value={autoDate || today()}
                onChange={(e) => setAutoDate(e.target.value)}
                autoFocus
              />
            </DotField>
            <DotField label="Check/Ref" width={16}>
              <input
                className="dos-input w12"
                value={autoRef}
                onChange={(e) => setAutoRef(e.target.value)}
              />
            </DotField>
            <DotField label="Amount Paid" width={16}>
              <MoneyInput
                className="dos-input w12 num"
                aria-label="Auto Amount Paid"
                value={autoAmount}
                onValueChange={setAutoAmount}
                blurOnEnter
              />
            </DotField>
            <div style={{ color: "var(--app-highlight)", marginTop: "0.5em" }}>
              Payment Remaining to Apply --&gt; will distribute oldest open
              invoices first.
            </div>
          </div>
        </Dialog>
      )}

      {confirmPay && (
        <div className="dos-overlay">
          <div
            className="dos-prompt"
            role="dialog"
            aria-label="Are you sure this is correct? Y/N"
          >
            <div className="q">Are you sure this is correct? Y/N</div>
          </div>
        </div>
      )}

      {help && <HelpOverlay onClose={() => setHelp(false)} />}
    </Screen>
  );
}
