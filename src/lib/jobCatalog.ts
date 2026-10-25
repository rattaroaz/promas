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

/** Sizes that already have their own price. A one-price job counts every size. */
export function sizesEditedOnJob(job: JobDescription): string[] {
  const filled = JOB_SIZES.filter((size) => sizeAmount(job, size) != null);
  if (filled.length > 0) return [...filled];
  if (job.fixed != null) return [...JOB_SIZES];
  return [];
}

function sizeAmount(job: JobDescription, size: string): number | null {
  switch (size) {
    case "single":
      return job.single;
    case "1+1":
      return job.onePlusOne;
    case "2+1":
      return job.twoPlusOne;
    case "2+2":
      return job.twoPlusTwo;
    case "3+2":
      return job.threePlusTwo;
    case "4+2":
      return job.fourPlusTwo;
    case "Occupied":
      return job.occupied;
    default:
      return null;
  }
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
  const key = normalizeListedSize(size);
  const direct = key ? sizeAmount(job, key) : null;
  if (direct != null) return direct;
  if (job.fixed != null) return job.fixed;
  return sharedSizePrice(job);
}

function withSizeAmount(job: JobDescription, size: string, price: number | null): JobDescription {
  switch (size) {
    case "single":
      return { ...job, single: price };
    case "1+1":
      return { ...job, onePlusOne: price };
    case "2+1":
      return { ...job, twoPlusOne: price };
    case "2+2":
      return { ...job, twoPlusTwo: price };
    case "3+2":
      return { ...job, threePlusTwo: price };
    case "4+2":
      return { ...job, fourPlusTwo: price };
    case "Occupied":
      return { ...job, occupied: price };
    default:
      return job;
  }
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
  editedSizes: readonly string[] = sizesEditedOnJob(job)
): JobDescription & { editedSizes: string[] } {
  const key = normalizeListedSize(size);
  if (!key) return { ...job, editedSizes: [...editedSizes] };
  const othersEdited = editedSizes.some((edited) => edited !== key);
  if (!othersEdited) {
    let next: JobDescription = { ...job, fixed: null };
    for (const listed of JOB_SIZES) next = withSizeAmount(next, listed, price);
    return { ...next, editedSizes: [key] };
  }
  const fallback = job.fixed ?? sharedSizePrice(job);
  let next: JobDescription = { ...job, fixed: null };
  for (const listed of JOB_SIZES) {
    const current = sizeAmount(job, listed);
    next = withSizeAmount(next, listed, listed === key ? price : (current ?? fallback));
  }
  const nextEdited = editedSizes.includes(key) ? [...editedSizes] : [...editedSizes, key];
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
  const key = normalizeListedSize(size);
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
  };
}
