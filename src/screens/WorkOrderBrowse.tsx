import { useCallback, useEffect, useState } from "react";
import {
  api,
  WorkOrder,
  WorkOrderWithLines,
  Company,
  Property,
  WorkType,
  emptyWorkOrder,
} from "../api";
import { useBrowseIndex, useDosKeys } from "../dos/hooks";
import {
  Screen,
  BROWSE_KEYS,
  Dialog,
  FORM_KEYS,
  HelpOverlay,
} from "../dos/Shell";
import { DotField } from "../dos/Field";
import { DateInput } from "../dos/DateInput";
import { cols, padR, padL, money, fmtDate, today } from "../dos/utils";

export function WorkOrderBrowse({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<WorkOrder[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<WorkOrderWithLines | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
  const [msg, setMsg] = useState(
    "Ins=Add Work Order  Esc=Exit"
  );
  const [msgKind, setMsgKind] = useState<"default" | "error" | "info">("default");
  const [help, setHelp] = useState(false);
  const { index, setIndex, up, down, pageUp, pageDown, home, end } =
    useBrowseIndex(rows.length);

  const load = useCallback(async () => {
    try {
      const data = await api.listWorkOrders({ search, limit: 300 });
      setRows(data);
      setMsg(
        data.length
          ? `${data.length} work orders  —  Ins=Add  Esc=Exit`
          : "No work orders. Press Ins to add. (Legacy ORDER files were empty.)"
      );
      setMsgKind("default");
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 150);
    return () => clearTimeout(t);
  }, [load]);

  async function openNew() {
    const [cos, wts] = await Promise.all([
      api.listCompanies({ limit: 2000 }),
      api.listWorkTypes({}),
    ]);
    setCompanies(cos);
    setWorkTypes(wts);
    setProperties([]);
    const order = emptyWorkOrder();
    setEditing({
      order,
      lines: [
        {
          companyNo: "",
          proNo: "",
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

  useDosKeys({
    forceNav: !editing,
    onEscape: () => {
      if (help) setHelp(false);
      else if (editing) {
        setEditing(null);
        setMsg("Ins=Add Work Order  Esc=Exit");
      } else onBack();
    },
    onF1: () => setHelp(true),
    onInsert: () => {
      if (!editing) openNew();
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
  });

  async function save() {
    if (!editing) return;
    if (!editing.order.companyNo || !editing.order.proNo) {
      setMsg("--> Company and Property required !!");
      setMsgKind("error");
      return;
    }
    try {
      const no = await api.saveWorkOrder({
        order: editing.order,
        lines: editing.lines.map((l, i) => ({
          ...l,
          companyNo: editing.order.companyNo,
          proNo: editing.order.proNo,
          orderDate: editing.order.orderDate,
          lineNo: i + 1,
        })),
      });
      setEditing(null);
      setMsg(`Work Order #${no} saved.`);
      setMsgKind("info");
      await load();
    } catch (e) {
      setMsg(String(e));
      setMsgKind("error");
    }
  }

  async function onCompanyChange(companyNo: string) {
    if (!editing) return;
    const props = await api.listProperties({ companyNo, limit: 500 });
    setProperties(props);
    setEditing({
      ...editing,
      order: {
        ...editing.order,
        companyNo,
        proNo: props[0]?.proNo || "",
      },
    });
  }

  return (
    <Screen
      statusKeys={editing ? FORM_KEYS : BROWSE_KEYS}
      title=" Work Order Process "
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
              placeholder="Order#, Company, Contact, Address, Unit"
            />
          </div>
          <div className="dos-browse">
            <div className="browse-grid browse-grid-7 browse-grid-header">
              <div>Ord#</div>
              <div>OrdDate</div>
              <div>Comp</div>
              <div>Pro</div>
              <div>Order By</div>
              <div>Unit/Size</div>
              <div>Property</div>
            </div>
            <div className="dos-browse-body">
              {rows.map((w, i) => (
                <button
                  key={`${w.companyNo}-${w.orderNo}-${w.orderDate}`}
                  className={`dos-row ${i === index ? "selected" : ""} ${w.voided ? "voided" : ""} browse-grid browse-grid-7`}
                  onMouseEnter={() => setIndex(i)}
                >
                  <div>{w.orderNo}</div>
                  <div>{fmtDate(w.orderDate)}</div>
                  <div>{w.companyNo}</div>
                  <div>{w.proNo}</div>
                  <div>{w.orderBy || w.orderMan}</div>
                  <div>{w.orderUnit}{w.orderSize ? "/" + w.orderSize : ""}</div>
                  <div>{w.propertyName || ""}</div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {editing && (
        <Dialog
          title="Enter Job Order Information"
          wide
          foot="Esc=Cancel, Ctrl-W=Save & Exit"
        >
          <div className="dos-form">
            <DotField label="Order Date" width={16}>
              <DateInput
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
              <DateInput
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
            <DotField label="Company NO" width={16}>
              <select
                className="dos-select"
                value={editing.order.companyNo}
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
            <DotField label="Property NO" width={16}>
              <select
                className="dos-select"
                value={editing.order.proNo}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    order: { ...editing.order, proNo: e.target.value },
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

            <div className="browse-grid browse-grid-4 browse-grid-header" style={{ margin: "0.5em 0 0.2em" }}>
              <div>Code#</div>
              <div>Description</div>
              <div>W/T</div>
              <div>Price</div>
            </div>
            {editing.lines.map((line, idx) => (
              <div key={idx} className="browse-grid browse-grid-4" style={{ marginBottom: "0.15em" }}>
                <div style={{ minWidth: 0 }}>
                  <select
                    className="dos-select"
                    style={{ width: "100%" }}
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
                        price: wt?.price || line.price,
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
                </div>
                <div style={{ minWidth: 0 }}>
                  <input
                    className="dos-input"
                    style={{ width: "100%" }}
                    value={line.description}
                    onChange={(e) => {
                      const lines = [...editing.lines];
                      lines[idx] = { ...line, description: e.target.value };
                      setEditing({ ...editing, lines });
                    }}
                  />
                </div>
                <div style={{ minWidth: 0 }}>
                  <select
                    className="dos-select"
                    style={{ width: "100%" }}
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
                  </select>
                </div>
                <div style={{ minWidth: 0 }}>
                  <input
                    className="dos-input"
                    style={{ width: "100%" }}
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
                </div>
              </div>
            ))}
            <div className="browse-grid browse-grid-4" style={{ marginTop: "0.4em" }}>
              <div style={{ gridColumn: "1 / 3" }}>
                <button
                  className="dos-btn"
                  onClick={() =>
                    setEditing({
                      ...editing,
                      lines: [
                        ...editing.lines,
                        {
                          companyNo: editing.order.companyNo,
                          proNo: editing.order.proNo,
                          orderDate: editing.order.orderDate,
                          orderNo: 0,
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
                  + Line
                </button>
              </div>
              <div></div>
              <div style={{ color: "var(--dos-yellow)", fontWeight: "bold" }}>
                Total: {money(editing.lines.reduce((s, l) => s + l.price, 0))}
              </div>
            </div>
          </div>
        </Dialog>
      )}
      {help && <HelpOverlay onClose={() => setHelp(false)} />}
    </Screen>
  );
}
