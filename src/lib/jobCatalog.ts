/** Job descriptions used on invoice lines, and their prices. */

export interface JobDescription {
  description: string;
  /** Previous description when renaming. Empty when adding. Not stored on invoices. */
  originalDescription?: string;
  /** Set together when the price depends on unit size. Null on a one-price job. */
  single: number | null;
  onePlusOne: number | null;
  twoPlusOne: number | null;
  twoPlusTwo: number | null;
  threePlusTwo: number | null;
  fourPlusTwo: number | null;
  /** Price when the unit is occupied. Null leaves that size blank. */
  occupied: number | null;
  /** One price for every unit size. Null when the size prices are used. */
  fixed: number | null;
  /** Prices for sizes that are not one of the original columns, such as lofts. */
  extraPrices?: Record<string, number>;
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

const SIZE_KEYS = ["single", "1+1", "2+1", "2+2", "3+2", "4+2"] as const;

/** Sizes on the job-description screen. Occupied is a unit that is lived in. */
export const JOB_SIZES = [...SIZE_KEYS, "Occupied"] as const;

function sized(
  description: string,
  single: number,
  onePlusOne: number,
  twoPlusOne: number,
  twoPlusTwo: number,
  threePlusTwo: number,
  fourPlusTwo: number
): JobDescription {
  return {
    description,
    single,
    onePlusOne,
    twoPlusOne,
    twoPlusTwo,
    threePlusTwo,
    fourPlusTwo,
    occupied: null,
    fixed: null,
  };
}

function scale(job: JobDescription, factor: number): JobDescription {
  return {
    ...job,
    single: (job.single ?? 0) * factor,
    onePlusOne: (job.onePlusOne ?? 0) * factor,
    twoPlusOne: (job.twoPlusOne ?? 0) * factor,
    twoPlusTwo: (job.twoPlusTwo ?? 0) * factor,
    threePlusTwo: (job.threePlusTwo ?? 0) * factor,
    fourPlusTwo: (job.fourPlusTwo ?? 0) * factor,
    occupied: job.occupied == null ? null : job.occupied * factor,
  };
}

function fixed(description: string, price: number): JobDescription {
  return {
    description,
    single: null,
    onePlusOne: null,
    twoPlusOne: null,
    twoPlusTwo: null,
    threePlusTwo: null,
    fourPlusTwo: null,
    occupied: null,
    fixed: price,
  };
}

const INTERIOR_PAINT = sized(
  INTERIOR_PAINT_WALL_CLOSET,
  220,
  245,
  280,
  295,
  450,
  545
);
const CEILING_PAINT = sized(PAINTING_OF_CEILING, 75, 115, 125, 150, 175, 195);

/** The descriptions and prices shipped with the app. An empty catalog is filled from this. */
export function presetJobDescriptions(): JobDescription[] {
  return [
    INTERIOR_PAINT,
    { ...scale(INTERIOR_PAINT, 0.8), description: COLOR_CHANGE_WALLS_NAVAJO_WHITE },
    CEILING_PAINT,
    {
      ...scale(CEILING_PAINT, 0.8),
      description: COLOR_CHANGE_CEILING_SWISS_COFFEE,
    },
    sized(PAINT_BASE_BOARD, 95, 105, 125, 125, 155, 250),
    sized(PLASTIC_COVERING_OF_FLOOR, 95, 105, 125, 135, 165, 170),
    sized(PAINT_ALL_ENAMEL_SURFACES, 145, 180, 190, 195, 225, 255),
    sized(TWO_TONE_COLORS, 70, 75, 80, 90, 95, 100),
    sized(TWO_TONE_HASHED_HUE, 70, 75, 80, 90, 95, 100),
    fixed(PAINT_KITCHEN_CABINET_INSIDE, 130),
    fixed(PAINT_KITCHEN_CABINET_OUTSIDE, 165),
    fixed(PAINT_KITCHEN_CABINET_BOTH, 295),
    fixed(VARNISH_KITCHEN_CABINET, 350),
    fixed(PAINT_OVER_CABINETS_PRIMER_INSIDE, 190),
    fixed(PAINT_OVER_CABINETS_PRIMER_OUTSIDE, 280),
  ];
}

/**
 * A description stores one price per size. Cabinet jobs still keep a single
 * `fixed` price until a size is edited on its own.
 */
export function jobHasSizePrices(job: JobDescription): boolean {
  return job.fixed == null;
}

const LEGACY_SIZE_FIELDS = {
  single: "single",
  "1+1": "onePlusOne",
  "2+1": "twoPlusOne",
  "2+2": "twoPlusTwo",
  "3+2": "threePlusTwo",
  "4+2": "fourPlusTwo",
  Occupied: "occupied",
} as const satisfies Record<string, keyof JobDescription>;

/** "Single" / "1 + 1" / "Occupied" → the stored column key. Other labels stay as typed. */
export function canonicalSizeKey(raw: string): string | null {
  const listed = normalizeListedSize(raw);
  if (listed) return listed;
  const trimmed = raw.trim();
  return trimmed || null;
}

/** Sizes that already have their own price. A one-price job counts every listed size. */
export function sizesEditedOnJob(
  job: JobDescription,
  catalog: readonly string[] = JOB_SIZES
): string[] {
  const filled = catalog.filter((size) => sizeAmount(job, size) != null);
  if (filled.length > 0) return [...filled];
  if (job.fixed != null) return [...catalog];
  return [];
}

function sizeAmount(job: JobDescription, size: string): number | null {
  const key = canonicalSizeKey(size);
  if (!key) return null;
  const field = LEGACY_SIZE_FIELDS[key as keyof typeof LEGACY_SIZE_FIELDS];
  if (field) {
    const value = job[field];
    return typeof value === "number" ? value : null;
  }
  const extra = job.extraPrices?.[key];
  return extra == null ? null : extra;
}

function sharedSizePrice(job: JobDescription): number | null {
  const values = JOB_SIZES.map((size) => sizeAmount(job, size)).filter(
    (amount): amount is number => amount != null
  );
  if (values.length === 0) return null;
  const first = values[0];
  return values.every((amount) => amount === first) ? first : null;
}

/** Price the job-description screen shows for the size chosen on that row. */
export function priceShownForSize(job: JobDescription, size: string): number | null {
  const direct = sizeAmount(job, size);
  if (direct != null) return direct;
  if (job.fixed != null) return job.fixed;
  return sharedSizePrice(job);
}

function withSizeAmount(job: JobDescription, size: string, price: number | null): JobDescription {
  const key = canonicalSizeKey(size);
  if (!key) return job;
  const field = LEGACY_SIZE_FIELDS[key as keyof typeof LEGACY_SIZE_FIELDS];
  if (field) return { ...job, [field]: price };
  const extra = { ...(job.extraPrices ?? {}) };
  if (price == null) delete extra[key];
  else extra[key] = price;
  return { ...job, extraPrices: extra };
}

/**
 * Store `price` for `size`. The first price typed for a description is copied
 * to every size. Editing another size changes only that size; the rest keep
 * the first price. `editedSizes` is the sizes the user has already priced.
 */
export function jobWithSizePrice(
  job: JobDescription,
  size: string,
  price: number,
  editedSizes: readonly string[] = sizesEditedOnJob(job),
  catalog: readonly string[] = JOB_SIZES
): JobDescription & { editedSizes: string[] } {
  const key = canonicalSizeKey(size);
  if (!key) return { ...job, editedSizes: [...editedSizes] };
  const sameSize = (edited: string) => canonicalSizeKey(edited) === key;
  const othersEdited = editedSizes.some((edited) => !sameSize(edited));
  const listed = catalog.length > 0 ? catalog : [size];
  if (!othersEdited) {
    let next: JobDescription = { ...job, fixed: null };
    for (const item of listed) next = withSizeAmount(next, item, price);
    return { ...next, editedSizes: [key] };
  }
  const fallback = job.fixed ?? sharedSizePrice(job);
  let next: JobDescription = { ...job, fixed: null };
  for (const item of listed) {
    const itemKey = canonicalSizeKey(item);
    const current = sizeAmount(job, item);
    next = withSizeAmount(next, item, itemKey === key ? price : (current ?? fallback));
  }
  const nextEdited = editedSizes.some(sameSize) ? [...editedSizes] : [...editedSizes, key];
  return { ...next, editedSizes: nextEdited };
}

export function findJobDescription(
  description: string,
  catalog: readonly JobDescription[]
): JobDescription | undefined {
  return catalog.find((job) => job.description === description);
}

export function isPresetDescription(
  description: string,
  catalog: readonly JobDescription[] = presetJobDescriptions()
): boolean {
  return findJobDescription(description, catalog) != null;
}

/** Price for a catalog description. Size is used only for size-based items. */
export function priceForPreset(
  description: string,
  size: string,
  catalog: readonly JobDescription[] = presetJobDescriptions()
): number | null {
  const job = findJobDescription(description, catalog);
  if (!job) return null;
  const key = canonicalSizeKey(size);
  if (key) return priceShownForSize(job, key);
  if (!size.trim()) {
    if (!jobHasSizePrices(job)) return job.fixed;
    return job.single;
  }
  return null;
}

/** "1 + 1" / "Single" → "1+1" / "single". Occupied stays Occupied. */
export function normalizeListedSize(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  if (s === "single") return "single";
  if (s === "occupied") return "Occupied";
  const m = s.match(/^(\d+)\+(\d+)$/);
  if (m && (SIZE_KEYS as readonly string[]).includes(`${m[1]}+${m[2]}`)) {
    return `${m[1]}+${m[2]}`;
  }
  return null;
}

export function blankJobDescription(): JobDescription {
  return {
    description: "",
    originalDescription: "",
    single: null,
    onePlusOne: null,
    twoPlusOne: null,
    twoPlusTwo: null,
    threePlusTwo: null,
    fourPlusTwo: null,
    occupied: null,
    fixed: null,
    extraPrices: {},
  };
}
