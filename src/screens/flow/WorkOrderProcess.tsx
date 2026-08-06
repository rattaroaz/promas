/**
 * Work Order Process — browse/edit/void with full line items.
 */
import { useCallback, useEffect, useState } from "react";
import {
  api,
  Company,
  Property,
  WorkOrder,
  WorkOrderWithLines,
  WorkType,
  emptyWorkOrder,
  emptyWorkType,
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
import { padR, padL, money, fmtDate, today } from "../../dos/utils";

export function WorkOrderProcess({
  company,
  property,
  onBack,
}: {
  company: Company;
  property: Property;
  onBack: () => void;
}) {
  const [rows, setRows] = useState<WorkOrder[]>([]);
  const [editing, setEditing] = useState<WorkOrderWithLines | null>(null);
  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
  const [msg, setMsg] = useState(
    "Ins=Add  Ctrl-Home=Edit  Del=Void  Esc=Exit"
  );
  const [msgKind, setMsgKind] = useState<"default" | "error" | "info">(
    "default"
  );
  const [voidAsk, setVoidAsk] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [addWtAsk, setAddWtAsk] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const { index, setIndex, up, down, pageUp, pageDown, home, end } =
    useBrowseIndex(rows.length);

  const load = useCallback(async () => {
    const data = await api.listWorkOrders({
      companyNo: company.companyNo,
      limit: 500,
    });
    setRows(data.filter((o) => o.proNo === property.proNo));
    setMsg("Ins=Add  Enter/Ctrl-Home=Edit  Del=Void  Esc=Back");
  }, [company.companyNo, property.proNo]);

  useEffect(() => {
    load();
  }, [load]);

  const current = rows[index] ?? null;

  async function openNew() {
    const wts = await api.listWorkTypes({});
    setWorkTypes(wts);
    const order = emptyWorkOrder();
    order.companyNo = company.companyNo;
    order.proNo = property.proNo;
    order.orderDate = today();
    setEditing({
      order,
      lines: [
        {
          companyNo: company.companyNo,
          proNo: property.proNo,
          orderDate: order.orderDate,
          orderNo: 0,
          lineNo: 1,
          codeNo: "*",
          description: "",
          workType: "P",
          price: 0,
        },
      ],
    });
    setMsg("Enter Job Order Information (Esc=Exit) !");
  }

  async function openEdit(w: WorkOrder) {
    const [full, wts] = await Promise.all([
      api.getWorkOrder(w.companyNo, w.proNo, w.orderDate, w.orderNo),
      api.listWorkTypes({}),
    ]);
    setWorkTypes(wts);
    if (full) {
      setEditing(full);
      setMsg(
        full.order.voided
          ? "***  V O I D  W O R K  O R D E R ***"
          : `Order #${full.order.orderNo}  Ctrl-W=Save  Esc=Exit`
      );
    }
  }

  async function doSave() {
    if (!editing) return;
    try {
      const no = await api.saveWorkOrder({
        order: {
          ...editing.order,
          companyNo: company.companyNo,
          proNo: property.proNo,
        },
        lines: editing.lines.map((l, i) => ({
          ...l,
          companyNo: company.companyNo,
          proNo: property.proNo,
          orderDate: editing.order.orderDate,
          lineNo: i + 1,
        })),
      });
      setEditing(null);
      setConfirmSave(false);
      setMsg(`Work Order #${no} saved.`);
      setMsgKind("info");
      await load();
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    }
  }

  async function doVoid() {
    if (!current) return;
    await api.voidWorkOrder(
      current.companyNo,
      current.proNo,
      current.orderDate,
      current.orderNo
    );
    setVoidAsk(false);
    setMsg(" Void Work Order ");
    await load();
  }

  async function applyCode(idx: number, code: string) {
    if (!editing) return;
    if (code === "*" || code === "") {
      const lines = [...editing.lines];
      lines[idx] = { ...lines[idx], codeNo: code || "*" };
      setEditing({ ...editing, lines });
      return;
    }
    const wt = workTypes.find(
      (w) => w.codeNo.toUpperCase() === code.toUpperCase()
    );
    if (!wt) {
      setAddWtAsk(code.toUpperCase());
      setMsg(
        `${code} --> does not exist !! Do you want Add Worktype(Y/N)?`
      );
      setMsgKind("error");
      return;
    }
    const lines = [...editing.lines];
    lines[idx] = {
      ...lines[idx],
      codeNo: wt.codeNo,
      description: wt.description || lines[idx].description,
      workType: wt.workType || lines[idx].workType,
      price: wt.price || lines[idx].price,
    };
    setEditing({ ...editing, lines });
  }

  async function addWorktype(code: string) {
    const wt = emptyWorkType();
    wt.codeNo = code;
    wt.workType = "P";
    wt.description = "";
    await api.saveWorkType(wt);
    setWorkTypes(await api.listWorkTypes({}));
    setAddWtAsk(null);
    setMsgKind("default");
    setMsg("Worktype added — enter description on line");
  }

  useDosKeys({
    forceNav: !editing,
    onEscape: () => {
      if (help) setHelp(false);
      else if (voidAsk) setVoidAsk(false);
      else if (confirmSave) setConfirmSave(false);
      else if (addWtAsk) setAddWtAsk(null);
      else if (editing) {
        setEditing(null);
        setMsg("Ins=Add  Enter=Edit  Del=Void  Esc=Back");
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
    onEnd: !editing ? end : undefined,
    onCtrlW: () => {
      if (editing) {
        setConfirmSave(true);
        setMsg("Is This Data Correct ? (Y/N)");
      }
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
      if (addWtAsk) {
        if (ch === "y" || ch === "Y") {
          addWorktype(addWtAsk);
          return true;
        }
        if (ch === "n" || ch === "N") {
          setAddWtAsk(null);
          return true;
        }
      }
      return false;
    },
  });

  return (
    <Screen
      statusKeys={editing ? FORM_KEYS : BROWSE_KEYS}
      title=" Work Order Process "
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
            {company.name} — {property.name} {property.street}
          </div>
          <div className="dos-browse-header">
            {"Ord#  OrdDate    Unit/Size          Order By        Status"}
          </div>
          <div className="dos-browse-body">
            {rows.map((w, i) => (
              <button
                key={`${w.orderNo}-${w.orderDate}`}
                className={`dos-row ${i === index ? "selected" : ""} ${w.voided ? "voided" : ""}`}
                onMouseEnter={() => setIndex(i)}
                onClick={() => openEdit(w)}
              >
                {padL(w.orderNo, 5)}{" "}
                {padR(fmtDate(w.orderDate), 10)}{" "}
                {padR(
                  `${w.orderUnit}${w.orderSize ? "/" + w.orderSize : ""}`,
                  16
                )}{" "}
                {padR(w.orderBy || w.orderMan, 14)}{" "}
                {w.voided ? "VOID" : w.status || "OK"}
              </button>
            ))}
            {rows.length === 0 && (
              <div className="dos-row" style={{ color: "var(--dos-yellow)" }}>
                {"  (no work orders — press Ins)"}
              </div>
            )}
          </div>
        </div>
      )}

      {editing && (
        <Dialog
          title={
            editing.order.voided
              ? "***  V O I D  W O R K  O R D E R ***"
              : editing.order.orderNo
                ? `Order No.......... ${editing.order.orderNo}`
                : "Enter Job Order Information"
          }
          wide
          red={editing.order.voided}
          foot="Esc=Cancel, Ctrl-W=Save & Exit"
        >
          <div className="dos-form">
            <DotField label="Order Date" width={16}>
              <input
                className="dos-input w12"
                type="date"
                value={editing.order.orderDate || today()}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    order: { ...editing.order, orderDate: e.target.value },
                  })
                }
              />
            </DotField>
            <DotField label="Service Date" width={16}>
              <input
                className="dos-input w12"
                type="date"
                value={editing.order.workDate || ""}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    order: {
                      ...editing.order,
                      workDate: e.target.value || null,
                    },
                  })
                }
              />
            </DotField>
            <DotField label="Order Person" width={16}>
              <input
                className="dos-input w12"
                value={editing.order.orderMan}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    order: { ...editing.order, orderMan: e.target.value },
                  })
                }
              />
            </DotField>
            <DotField label="Unit #" width={16}>
              <input
                className="dos-input w12"
                value={editing.order.orderUnit}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    order: { ...editing.order, orderUnit: e.target.value },
                  })
                }
              />
            </DotField>
            <DotField label="Size" width={16}>
              <input
                className="dos-input w12"
                value={editing.order.orderSize}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    order: { ...editing.order, orderSize: e.target.value },
                  })
                }
              />
            </DotField>
            <DotField label="Order By" width={16}>
              <input
                className="dos-input w12"
                value={editing.order.orderBy}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    order: { ...editing.order, orderBy: e.target.value },
                  })
                }
              />
            </DotField>
            <DotField label="Customer P.O" width={16}>
              <input
                className="dos-input w12"
                value={editing.order.custPoNo}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    order: { ...editing.order, custPoNo: e.target.value },
                  })
                }
              />
            </DotField>
            <DotField label="Remarks" width={16}>
              <input
                className="dos-input w40"
                value={editing.order.remark1}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    order: { ...editing.order, remark1: e.target.value },
                  })
                }
              />
            </DotField>

            <div
              style={{
                color: "var(--dos-yellow)",
                margin: "0.5em 0 0.2em",
                whiteSpace: "pre",
              }}
            >
              {
                "Code# Description                                          W/T        Price"
              }
            </div>
            {editing.lines.map((line, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  gap: "0.4ch",
                  marginBottom: "0.12em",
                }}
              >
                <input
                  className="dos-input"
                  style={{ width: "7ch" }}
                  value={line.codeNo}
                  title="Enter Job Code No (Esc=Exit, * = Command Input) !"
                  onChange={(e) => {
                    const lines = [...editing.lines];
                    lines[idx] = { ...line, codeNo: e.target.value };
                    setEditing({ ...editing, lines });
                  }}
                  onBlur={(e) => applyCode(idx, e.target.value.trim())}
                />
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
                <select
                  className="dos-select"
                  style={{ width: "5ch" }}
                  value={line.workType}
                  onChange={(e) => {
                    const lines = [...editing.lines];
                    lines[idx] = { ...line, workType: e.target.value };
                    setEditing({ ...editing, lines });
                  }}
                >
                  <option value="P">P</option>
                  <option value="C">C</option>
                  <option value="F">F</option>
                  <option value="O">O</option>
                  <option value="S">S</option>
                </select>
                <input
                  className="dos-input w10 num"
                  type="number"
                  step="0.01"
                  value={line.price}
                  onChange={(e) => {
                    const lines = [...editing.lines];
                    lines[idx] = {
                      ...line,
                      price: parseFloat(e.target.value) || 0,
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
                      {
                        companyNo: company.companyNo,
                        proNo: property.proNo,
                        orderDate: editing.order.orderDate,
                        orderNo: editing.order.orderNo,
                        lineNo: editing.lines.length + 1,
                        codeNo: "*",
                        description: "",
                        workType: "P",
                        price: 0,
                      },
                    ],
                  })
                }
              >
                + Line (* = free text)
              </button>
              <span style={{ float: "right", color: "var(--dos-yellow)" }}>
                Total:{" "}
                {money(editing.lines.reduce((s, l) => s + l.price, 0))}
              </span>
            </div>
          </div>
        </Dialog>
      )}

      {voidAsk && (
        <Prompt
          question={`Do you want Void (Y/N) ?  Order #${current?.orderNo}`}
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
      {addWtAsk && (
        <Prompt
          question={`${addWtAsk} --> does not exist !! Do you want Add Worktype(Y/N)?`}
          onYes={() => addWorktype(addWtAsk)}
          onNo={() => setAddWtAsk(null)}
        />
      )}
      {help && <HelpOverlay onClose={() => setHelp(false)} />}
    </Screen>
  );
}
