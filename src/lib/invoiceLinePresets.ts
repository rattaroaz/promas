import { Invoice, InvoiceLine } from "../api";
import {
  findJobDescription,
  isPresetDescription,
  presetJobDescriptions,
  priceForPreset,
  type JobDescription,
} from "./jobCatalog";

export {
  COLOR_CHANGE_CEILING_SWISS_COFFEE,
  COLOR_CHANGE_WALLS_NAVAJO_WHITE,
  INTERIOR_PAINT_WALL_CLOSET,
  PAINT_ALL_ENAMEL_SURFACES,
  PAINT_BASE_BOARD,
  PAINTING_OF_CEILING,
  PAINT_KITCHEN_CABINET_BOTH,
  PAINT_KITCHEN_CABINET_INSIDE,
  PAINT_KITCHEN_CABINET_OUTSIDE,
  PAINT_OVER_CABINETS_PRIMER_INSIDE,
  PAINT_OVER_CABINETS_PRIMER_OUTSIDE,
  PLASTIC_COVERING_OF_FLOOR,
  TWO_TONE_COLORS,
  TWO_TONE_HASHED_HUE,
  VARNISH_KITCHEN_CABINET,
  isPresetDescription,
  presetJobDescriptions,
  priceForPreset,
} from "./jobCatalog";

/** Exactly the sizes given for invoice line pricing. Blank in the UI allows custom. */
export const UNIT_SIZE_OPTIONS = [
  "single",
  "1+1",
  "2+1",
  "2+2",
  "3+2",
  "4+2",
  "Occupied",
] as const;

export type UnitSizeOption = (typeof UNIT_SIZE_OPTIONS)[number];

/** Normalize "1 + 1", "1+1", "Single" → "1+1" / "single". */
export function normalizeUnitSize(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  if (s === "single") return "single";
  if (s === "occupied") return "Occupied";
  const m = s.match(/^(\d+)\+(\d+)$/);
  if (m) return `${m[1]}+${m[2]}`;
  return null;
}

export function isListedUnitSize(size: string): boolean {
  const key = normalizeUnitSize(size);
  return key != null && (UNIT_SIZE_OPTIONS as readonly string[]).includes(key);
}

export function applyPresetPriceToLine(
  line: InvoiceLine,
  size: string,
  catalog: readonly JobDescription[] = presetJobDescriptions()
): InvoiceLine {
  if (!isPresetDescription(line.description, catalog)) return line;
  // A description picked before Size stays blank. The price is filled when
  // the user chooses a size, and again whenever that size changes.
  if (!size.trim()) {
    return { ...line, price: 0, empPrice: 0 };
  }
  const priced = priceForPreset(line.description, size, catalog);
  const price = priced ?? 0;
  return {
    ...line,
    price,
    empPrice: (price * (line.commission || 0)) / 100,
  };
}

export function applyPresetPrices(
  size: string,
  lines: InvoiceLine[],
  catalog: readonly JobDescription[] = presetJobDescriptions()
): InvoiceLine[] {
  return lines.map((line) => applyPresetPriceToLine(line, size, catalog));
}

export function blankNewInvoiceLine(inv: Invoice, lineNo: number): InvoiceLine {
  return {
    companyNo: inv.companyNo,
    proNo: inv.proNo,
    salesDate: inv.salesDate,
    invoice: inv.invoice,
    lineNo,
    codeNo: "",
    description: "",
    workDate: inv.salesDate,
    workType: "P",
    price: 0,
    empNo: "",
    empPrice: 0,
    commission: 65,
    status: "",
  };
}

export function catalogDescription(
  description: string,
  catalog: readonly JobDescription[]
): string {
  return findJobDescription(description, catalog)?.description ?? "";
}
