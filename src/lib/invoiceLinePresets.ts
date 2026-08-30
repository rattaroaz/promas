import { Invoice, InvoiceLine } from "../api";

/** Exactly the sizes given for invoice line pricing. Blank in the UI allows custom. */
export const UNIT_SIZE_OPTIONS = [
  "single",
  "1+1",
  "2+1",
  "2+2",
  "3+2",
  "4+2",
] as const;

export type UnitSizeOption = (typeof UNIT_SIZE_OPTIONS)[number];

function prices(
  single: number,
  oneOne: number,
  twoOne: number,
  twoTwo: number,
  threeTwo: number,
  fourTwo: number
): Record<UnitSizeOption, number> {
  return {
    single,
    "1+1": oneOne,
    "2+1": twoOne,
    "2+2": twoTwo,
    "3+2": threeTwo,
    "4+2": fourTwo,
  };
}

export const INTERIOR_PAINT_WALL_CLOSET =
  "Interior Painting of Wall/Closet Inside";
export const COLOR_CHANGE_WALLS_NAVAJO_WHITE =
  "Color Change of Walls and Closet to Navajo White";
export const PAINTING_OF_CEILING = "Painting of Ceiling";
export const COLOR_CHANGE_CEILING_SWISS_COFFEE =
  "Color Change of Ceiling to Swiss Coffee";
export const PAINT_BASE_BOARD = "Paint Baseboard";
export const PLASTIC_COVERING_OF_FLOOR = "Plastic Covering of Floor";
export const PAINT_ALL_ENAMEL_SURFACES =
  "Paint All Enamel Surfaces with Hybrid Based Paint";
export const TWO_TONE_COLORS = "2 Tone Colors: N/W + S/C";
export const TWO_TONE_HASHED_HUE = "2 Tone Color: Hashed Hue + S/C";
export const PAINT_KITCHEN_CABINET_INSIDE = "Paint Kitchen Cabinet Inside";
export const PAINT_KITCHEN_CABINET_OUTSIDE = "Paint Kitchen Cabinet Outside";
export const PAINT_KITCHEN_CABINET_BOTH =
  "Paint Kitchen Cabinet Inside+Outside";
export const VARNISH_KITCHEN_CABINET = "Varnish Kitchen Cabinet";
export const PAINT_OVER_CABINETS_PRIMER_INSIDE =
  "Paint Over Kitchen Cabinets Inside with Primer";
export const PAINT_OVER_CABINETS_PRIMER_OUTSIDE =
  "Paint Over Kitchen Cabinets Outside with Primer";

const INTERIOR_PAINT_PRICES = prices(220, 245, 280, 295, 450, 545);
const CEILING_PAINT_PRICES = prices(75, 115, 125, 150, 175, 195);
const COLOR_CHANGE_FACTOR = 0.8;

function scalePrices(
  source: Record<UnitSizeOption, number>,
  factor: number
): Record<UnitSizeOption, number> {
  return prices(
    source.single * factor,
    source["1+1"] * factor,
    source["2+1"] * factor,
    source["2+2"] * factor,
    source["3+2"] * factor,
    source["4+2"] * factor
  );
}

export const INVOICE_LINE_PRESETS = [
  {
    id: "interior-paint-wall-closet",
    description: INTERIOR_PAINT_WALL_CLOSET,
    prices: INTERIOR_PAINT_PRICES,
  },
  {
    id: "color-change-walls-navajo-white",
    description: COLOR_CHANGE_WALLS_NAVAJO_WHITE,
    prices: scalePrices(INTERIOR_PAINT_PRICES, COLOR_CHANGE_FACTOR),
  },
  {
    id: "painting-of-ceiling",
    description: PAINTING_OF_CEILING,
    prices: CEILING_PAINT_PRICES,
  },
  {
    id: "color-change-ceiling-swiss-coffee",
    description: COLOR_CHANGE_CEILING_SWISS_COFFEE,
    prices: scalePrices(CEILING_PAINT_PRICES, COLOR_CHANGE_FACTOR),
  },
  {
    id: "paint-base-board",
    description: PAINT_BASE_BOARD,
    prices: prices(95, 105, 125, 125, 155, 250),
  },
  {
    id: "plastic-covering-of-floor",
    description: PLASTIC_COVERING_OF_FLOOR,
    prices: prices(95, 105, 125, 135, 165, 170),
  },
  {
    id: "paint-all-enamel-surfaces",
    description: PAINT_ALL_ENAMEL_SURFACES,
    prices: prices(145, 180, 190, 195, 225, 255),
  },
  {
    id: "two-tone-colors",
    description: TWO_TONE_COLORS,
    prices: prices(70, 75, 80, 90, 95, 100),
  },
  {
    id: "two-tone-hashed-hue",
    description: TWO_TONE_HASHED_HUE,
    prices: prices(70, 75, 80, 90, 95, 100),
  },
  {
    id: "paint-kitchen-cabinet-inside",
    description: PAINT_KITCHEN_CABINET_INSIDE,
    fixed: 130,
  },
  {
    id: "paint-kitchen-cabinet-outside",
    description: PAINT_KITCHEN_CABINET_OUTSIDE,
    fixed: 165,
  },
  {
    id: "paint-kitchen-cabinet-both",
    description: PAINT_KITCHEN_CABINET_BOTH,
    fixed: 295,
  },
  {
    id: "varnish-kitchen-cabinet",
    description: VARNISH_KITCHEN_CABINET,
    fixed: 350,
  },
  {
    id: "paint-over-cabinets-primer-inside",
    description: PAINT_OVER_CABINETS_PRIMER_INSIDE,
    fixed: 190,
  },
  {
    id: "paint-over-cabinets-primer-outside",
    description: PAINT_OVER_CABINETS_PRIMER_OUTSIDE,
    fixed: 280,
  },
] as const;

/** Normalize "1 + 1", "1+1", "Single" → "1+1" / "single". */
export function normalizeUnitSize(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  if (s === "single") return "single";
  const m = s.match(/^(\d+)\+(\d+)$/);
  if (m) return `${m[1]}+${m[2]}`;
  return null;
}

export function isListedUnitSize(size: string): boolean {
  const key = normalizeUnitSize(size);
  return key != null && (UNIT_SIZE_OPTIONS as readonly string[]).includes(key);
}

export function isPresetDescription(description: string): boolean {
  return INVOICE_LINE_PRESETS.some((p) => p.description === description);
}

function fixedPriceOf(
  preset: (typeof INVOICE_LINE_PRESETS)[number]
): number | null {
  return "fixed" in preset ? preset.fixed : null;
}

/** Price for a preset. Size is used only for size-based items. */
export function priceForPreset(
  description: string,
  size: string
): number | null {
  const preset = INVOICE_LINE_PRESETS.find((p) => p.description === description);
  if (!preset) return null;
  const fixed = fixedPriceOf(preset);
  if (fixed != null) return fixed;
  const key = normalizeUnitSize(size);
  if (!key) return null;
  return "prices" in preset
    ? ((preset.prices as Record<string, number>)[key] ?? null)
    : null;
}

export function applyPresetPriceToLine(
  line: InvoiceLine,
  size: string
): InvoiceLine {
  if (!isPresetDescription(line.description)) return line;
  const priced = priceForPreset(line.description, size);
  const price = priced ?? 0;
  return {
    ...line,
    price,
    empPrice: (price * (line.commission || 0)) / 100,
  };
}

export function applyPresetPrices(
  size: string,
  lines: InvoiceLine[]
): InvoiceLine[] {
  return lines.map((line) => applyPresetPriceToLine(line, size));
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
