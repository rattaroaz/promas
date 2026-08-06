/**
 * Wraps the original process path:
 *   Main menu item → Company/Property gate → process screen
 */
import { useState } from "react";
import { Company, Property } from "../../api";
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
    property: Property;
  } | null>(null);

  if (!ctx) {
    return (
      <CompanyPropertyGate
        process={process}
        onBack={onBack}
        onReady={(company, property) => setCtx({ company, property })}
      />
    );
  }

  const backToGate = () => setCtx(null);

  switch (process) {
    case "invoice":
      return (
        <InvoiceProcess
          company={ctx.company}
          property={ctx.property}
          onBack={backToGate}
        />
      );
    case "workorder":
      return (
        <WorkOrderProcess
          company={ctx.company}
          property={ctx.property}
          onBack={backToGate}
        />
      );
    case "cash":
      return (
        <CashProcess
          company={ctx.company}
          property={ctx.property}
          onBack={backToGate}
        />
      );
    case "estimate":
      return (
        <EstimateProcess
          company={ctx.company}
          property={ctx.property}
          onBack={backToGate}
        />
      );
  }
}
