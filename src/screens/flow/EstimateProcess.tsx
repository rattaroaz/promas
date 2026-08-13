/**
 * Estimate / Proposal Process — original: browse proposals for company,
 * Ins=add, Ctrl-Home=edit, Del=void, fields Proposal#/Date/Form#.
 */
import { useCallback, useEffect, useState } from "react";
import {
  api,
  Company,
  Property,
  Estimate,
  emptyEstimate,
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
import { padR, padL, fmtDate, today } from "../../dos/utils";

export function EstimateProcess({
  company,
  property,
  onBack,
}: {
  company: Company;
  property: Property;
  onBack: () => void;
}) {
  const [rows, setRows] = useState<Estimate[]>([]);
  const [editing, setEditing] = useState<Estimate | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [msg, setMsg] = useState(
    "Ins=Add Proposal  Ctrl-Home=Edit  Del=Void  Esc=Exit"
  );
  const [msgKind, setMsgKind] = useState<"default" | "error" | "info">(
    "default"
  );
  const [voidAsk, setVoidAsk] = useState(false);
  const [help, setHelp] = useState(false);
  const { index, setIndex, up, down, pageUp, pageDown, home, end } =
    useBrowseIndex(rows.length);

  const load = useCallback(async () => {
    // Original EST is keyed by company; property is context only
    const data = await api.listEstimates({
      companyNo: company.companyNo,
    });
    setRows(data);
    setMsg(
      data.length
        ? `${data.length} proposals  —  Ins=Add  Enter=Edit  Del=Void  Esc=Back`
        : "No proposals. Press Ins — Enter Proposal Information (Esc=Exit) !"
    );
  }, [company.companyNo]);

  useEffect(() => {
    load();
  }, [load]);

  const current = rows[index] ?? null;

  function openNew() {
    const e = emptyEstimate(company.companyNo);
    e.estDate = today();
    e.formNo = "EST-1";
    setIsNew(true);
    setEditing(e);
    setMsg("Enter Proposal Information (Esc=Cancel, Cntr_W=Save & Exit) !");
  }

  async function save() {
    if (!editing) return;
    try {
      const no = await api.saveEstimate({
        ...editing,
        companyNo: company.companyNo,
      });
      setEditing(null);
      setMsg(`Proposal #${no} saved.`);
      setMsgKind("info");
      await load();
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    }
  }

  async function doVoid() {
    if (!current?.id) return;
    await api.voidEstimate(current.id);
    setVoidAsk(false);
    setMsg(" Void Proposal ");
    await load();
  }

  useDosKeys({
    forceNav: !editing,
    onEscape: () => {
      if (help) setHelp(false);
      else if (voidAsk) setVoidAsk(false);
      else if (editing) {
        setEditing(null);
        setMsg("Ins=Add Proposal  Esc=Back");
      } else onBack();
    },
    onF1: () => setHelp(true),
    onInsert: () => {
      if (!editing) openNew();
    },
    onEnter: () => {
      if (!editing && current) {
        setIsNew(false);
        setEditing({ ...current });
        setMsg("Enter Proposal Information (Esc=Cancel, Cntr_W=Save & Exit) !");
      }
    },
    onCtrlHome: () => {
      if (!editing && current) {
        setIsNew(false);
        setEditing({ ...current });
      }
    },
    onDelete: () => {
      if (!editing && current && !current.voided) setVoidAsk(true);
    },
    onArrowUp: !editing ? up : undefined,
    onArrowDown: !editing ? down : undefined,
    onPageUp: !editing ? pageUp : undefined,
    onPageDown: !editing ? pageDown : undefined,
    onHome: !editing ? home : undefined,
    onEnd: !editing ? end : undefined,
    onCtrlW: () => {
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

  return (
    <Screen
      statusKeys={editing ? FORM_KEYS : BROWSE_KEYS}
      title=" Estimate Process "
      message={msg}
      messageKind={msgKind}
      left={`${company.companyNo}/${property.proNo}`}
      right={property.name.slice(0, 24)}
    >
      {!editing && (
        <div className="dos-browse">
          <div
            style={{
              color: "var(--dos-cyan-bright)",
              padding: "0.2em 0.5ch",
            }}
          >
            {company.companyNo} {company.name} — {property.proNo}{" "}
            {property.name}
          </div>
          <div className="dos-browse-header">
            {"Proposal #........  Proposal Date.....  Form #............"}
          </div>
          <div className="dos-browse-body">
            {rows.map((e, i) => (
              <button
                key={e.id ?? `${e.estNo}-${e.estDate}`}
                className={`dos-row ${i === index ? "selected" : ""} ${e.voided ? "voided" : ""}`}
                onMouseEnter={() => setIndex(i)}
                onClick={() => {
                  setIsNew(false);
                  setEditing({ ...e });
                }}
              >
                {padL(e.estNo, 16)}{" "}
                {padR(fmtDate(e.estDate), 18)}{" "}
                {padR(e.formNo, 18)}{" "}
                {e.voided ? "VOID" : e.status || ""}
              </button>
            ))}
            {rows.length === 0 && (
              <div className="dos-row" style={{ color: "var(--dos-yellow)" }}>
                {"  (no proposals — press Ins)"}
              </div>
            )}
          </div>
        </div>
      )}

      {editing && (
        <Dialog
          title={
            editing.voided
              ? " Void Proposal "
              : isNew
                ? "Enter Proposal Information"
                : "Enter Proposal Information"
          }
          foot="Esc=Cancel, Cntr_W=Save & Exit"
          red={editing.voided}
        >
          <div className="dos-form">
            <div
              style={{
                color: "var(--dos-cyan-bright)",
                marginBottom: "0.5em",
              }}
            >
              {company.companyNo} {company.name}
              <br />
              {property.proNo} {property.name} {property.street}
            </div>
            <DotField label="Proposal #" width={16}>
              <input
                className="dos-input w8"
                type="number"
                value={editing.estNo || ""}
                disabled={!isNew && !!editing.id}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    estNo: parseInt(e.target.value, 10) || 0,
                  })
                }
                autoFocus
              />
            </DotField>
            <DotField label="Proposal Date" width={16}>
              <input
                className="dos-input w12"
                type="date"
                value={editing.estDate || today()}
                onChange={(e) =>
                  setEditing({ ...editing, estDate: e.target.value })
                }
              />
            </DotField>
            <DotField label="Form #" width={16}>
              <input
                className="dos-input w12"
                value={editing.formNo}
                onChange={(e) =>
                  setEditing({ ...editing, formNo: e.target.value })
                }
              />
            </DotField>
            <DotField label="Notes" width={16}>
              <textarea
                className="dos-textarea"
                value={editing.memo}
                onChange={(e) =>
                  setEditing({ ...editing, memo: e.target.value })
                }
              />
            </DotField>
          </div>
        </Dialog>
      )}

      {voidAsk && (
        <Prompt
          question={`Do you want Void (Y/N) ?  Proposal #${current?.estNo}`}
          onYes={doVoid}
          onNo={() => setVoidAsk(false)}
        />
      )}
      {help && <HelpOverlay onClose={() => setHelp(false)} />}
    </Screen>
  );
}
