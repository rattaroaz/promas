/**
 * Cash Receipts Process — company ledger + payment + Auto Receipt.
 * Original keys: Ins / Home / PgUp / PgDn / Esc / (A)uto_Receipt
 */
import { useCallback, useEffect, useState } from "react";
import {
  api,
  Company,
  Property,
  Invoice,
  CashReceipt,
  emptyCashReceipt,
} from "../../api";
import { useBrowseIndex, useDosKeys } from "../../dos/hooks";
import {
  Screen,
  Dialog,
  HelpOverlay,
  FORM_KEYS,
} from "../../dos/Shell";
import { DotField } from "../../dos/Field";
import { padR, padL, money, fmtDate, today } from "../../dos/utils";

export function CashProcess({
  company,
  property,
  onBack,
}: {
  company: Company;
  property: Property;
  onBack: () => void;
}) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
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
  const { index, setIndex, up, down, pageUp, pageDown, end } =
    useBrowseIndex(invoices.length);

  const load = useCallback(async () => {
    const invs = await api.listInvoices({
      companyNo: company.companyNo,
      limit: 2000,
    });
    const mine = invs.filter((i) => !i.voided);
    // open first, then paid
    mine.sort((a, b) => {
      if (a.balance > 0 && b.balance <= 0) return -1;
      if (a.balance <= 0 && b.balance > 0) return 1;
      return a.salesDate.localeCompare(b.salesDate) || a.invoice - b.invoice;
    });
    setInvoices(mine);
    const open = mine.reduce((s, i) => s + Math.max(0, i.balance), 0);
    setMsg(
      `*****   Customer Ledger   *****  Open ${money(open)}  Ins=Pay  A=Auto  Esc=Back`
    );
  }, [company.companyNo]);

  useEffect(() => {
    load();
  }, [load]);

  const current = invoices[index] ?? null;
  const endingBalance = invoices.reduce(
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
    setEditing(r);
    setMsg("Enter Your Payment Data(Esc=Cancel) !");
    setMsgKind("default");
  }

  function startAuto() {
    setAutoMode(true);
    setAutoAmount(endingBalance);
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

  /** Auto-apply lump payment oldest-open-first (original Auto_Receipt). */
  async function saveAuto() {
    if (!autoAmount || autoAmount <= 0) {
      setMsg("Payment is zero !  Retry !!");
      setMsgKind("error");
      return;
    }
    if (autoAmount > endingBalance + 0.005) {
      setMsg("Payment may not exceed End Balance Due !");
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
          payDate: autoDate,
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

  useDosKeys({
    forceNav: !editing && !autoMode,
    onEscape: () => {
      if (help) setHelp(false);
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
      if (!editing && !autoMode) startPayment();
    },
    onEnter: () => {
      if (editing) saveOne();
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
    onCtrlW: () => {
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
          : [
              { key: "Esc", label: "Exit" },
              { key: "Ins", label: "Payment" },
              { key: "A", label: "Auto_Receipt" },
              { key: "Home", label: "Auto" },
              { key: "PgUp", label: "Prev" },
              { key: "PgDn", label: "Next" },
            ]
      }
      title=" Cash Receipts Process "
      message={msg}
      messageKind={msgKind}
      left={`${company.companyNo}`}
      right={company.name.slice(0, 28)}
    >
      {!editing && !autoMode && (
        <>
          <div
            style={{
              color: "var(--dos-yellow)",
              padding: "0.3em 0.5ch",
              whiteSpace: "pre",
            }}
          >
            {`*****   Customer Ledger   *****
Company NO : ${company.companyNo}  ${company.name}
Phone      : ${company.phone}
Property   : ${property.proNo}  ${property.name}  (context)
Ending Balance... ${money(endingBalance)}`}
          </div>
          <div className="dos-browse">
            <div className="dos-browse-header">
              {
                "Inv#  Inv_Date  Pro Unit     Inv_amount   PayTotal    Balance"
              }
            </div>
            <div className="dos-browse-body">
              {invoices.map((inv, i) => (
                <button
                  key={`${inv.invoice}-${inv.salesDate}`}
                  className={`dos-row ${i === index ? "selected" : ""}`}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => {
                    setIndex(i);
                    startPayment(inv);
                  }}
                >
                  {padL(inv.invoice, 5)}{" "}
                  {padR(fmtDate(inv.salesDate), 10)}{" "}
                  {padR(inv.proNo, 3)} {padR(inv.salesUnit, 8)}{" "}
                  {padL(money(inv.salesTotal), 11)}{" "}
                  {padL(money(inv.payTotal), 10)}{" "}
                  {padL(money(inv.balance), 10)}
                  {inv.balance <= 0 ? " *" : "  "}
                </button>
              ))}
              {invoices.length === 0 && (
                <div
                  className="dos-row"
                  style={{ color: "var(--dos-yellow)" }}
                >
                  {
                    "  --> does not exsit in Receivable File !! Press Enter to Exit ..."
                  }
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {editing && (
        <Dialog
          title="Enter Your Payment Data"
          foot="Esc=Cancel  Ctrl-W/Enter=Post Receipt"
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
                disabled
                value={
                  invoices.find((i) => i.invoice === editing.invoice)
                    ?.salesTotal ?? ""
                }
              />
            </DotField>
            <DotField label="Balance" width={16}>
              <input
                className="dos-input w12 num"
                disabled
                value={
                  invoices.find((i) => i.invoice === editing.invoice)
                    ?.balance ?? ""
                }
              />
            </DotField>
            <DotField label="Pay Date" width={16}>
              <input
                className="dos-input w12"
                type="date"
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

      {autoMode && (
        <Dialog
          title="Enter Automatic Receipt Data"
          foot="Esc=Cancel  Enter=Apply to open invoices (oldest first)"
        >
          <div className="dos-form">
            <div style={{ color: "var(--dos-cyan-bright)", marginBottom: "0.5em" }}>
              Ending Balance Due: {money(endingBalance)}
            </div>
            <DotField label="Pay Date" width={16}>
              <input
                className="dos-input w12"
                type="date"
                value={autoDate}
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
              <input
                className="dos-input w12 num"
                type="number"
                step="0.01"
                value={autoAmount}
                onChange={(e) =>
                  setAutoAmount(parseFloat(e.target.value) || 0)
                }
              />
            </DotField>
            <div style={{ color: "var(--dos-yellow)", marginTop: "0.5em" }}>
              Payment Remaining to Apply --&gt; will distribute oldest open
              invoices first.
            </div>
          </div>
        </Dialog>
      )}

      {help && <HelpOverlay onClose={() => setHelp(false)} />}
    </Screen>
  );
}
