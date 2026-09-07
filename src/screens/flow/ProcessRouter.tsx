/**
 * Wraps the original process path:
 *   Main menu item → Company/Property gate → process screen
 *
 * The gate stays mounted after a company (cash) or company+property is chosen
 * so Esc from the process list returns to that list instead of a fresh search.
 */
import { useEffect, useState } from "react";
import { Company, Property } from "../../api";
import { setCurrentScreen } from "../../lib/observability";
import {
  CompanyPropertyGate,
  ProcessKind,
} from "./CompanyPropertyGate";
import { InvoiceProcess } from "./InvoiceProcess";
import { WorkOrderProcess } from "./WorkOrderProcess";
import { CashProcess } from "./CashProcess";
import { EstimateProcess } from "./EstimateProcess";

export function ProcessRouter({
  process,
  onBack,
}: {
  process: ProcessKind;
  onBack: () => void;
}) {
  const [ctx, setCtx] = useState<{
    company: Company;
    property?: Property;
    focusInvoice?: number;
  } | null>(null);

  useEffect(() => {
    setCurrentScreen(ctx ? `${process}/process` : `${process}/gate`);
  }, [process, ctx]);

  const backToGate = () => setCtx(null);

  let processScreen = null;
  if (ctx) {
    switch (process) {
      case "invoice":
        if (ctx.property) {
          processScreen = (
            <InvoiceProcess
              company={ctx.company}
              property={ctx.property}
              onBack={backToGate}
              focusInvoice={ctx.focusInvoice}
            />
          );
        }
        break;
      case "workorder":
        if (ctx.property) {
          processScreen = (
            <WorkOrderProcess
              company={ctx.company}
              property={ctx.property}
              onBack={backToGate}
            />
          );
        }
        break;
      case "cash":
        processScreen = (
          <CashProcess company={ctx.company} onBack={backToGate} />
        );
        break;
      case "estimate":
        if (ctx.property) {
          processScreen = (
            <EstimateProcess
              company={ctx.company}
              property={ctx.property}
              onBack={backToGate}
            />
          );
        }
        break;
    }
  }

  return (
    <>
      <CompanyPropertyGate
        process={process}
        onBack={onBack}
        onReady={(company, property, extras) =>
          setCtx({ company, property, focusInvoice: extras?.focusInvoice })
        }
        active={!ctx}
      />
      {processScreen}
    </>
  );
}
