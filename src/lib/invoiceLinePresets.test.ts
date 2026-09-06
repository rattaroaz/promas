import { describe, expect, it } from "vitest";
import { emptyInvoice, emptyInvoiceLine } from "../api";
import {
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
  applyPresetPriceToLine,
  applyPresetPrices,
  normalizeUnitSize,
  priceForPreset,
} from "./invoiceLinePresets";

describe("normalizeUnitSize", () => {
  it("accepts single and n+m with optional spaces", () => {
    expect(normalizeUnitSize("single")).toBe("single");
    expect(normalizeUnitSize("Single")).toBe("single");
    expect(normalizeUnitSize("1+1")).toBe("1+1");
    expect(normalizeUnitSize(" 2 + 2 ")).toBe("2+2");
    expect(normalizeUnitSize("Occupied")).toBe("Occupied");
    expect(normalizeUnitSize("occupied")).toBe("Occupied");
    expect(normalizeUnitSize("")).toBeNull();
    expect(normalizeUnitSize("studio")).toBeNull();
  });
});

describe("priceForPreset", () => {
  it("prices Interior Painting of Wall/Closet Inside from unit size", () => {
    const d = INTERIOR_PAINT_WALL_CLOSET;
    expect(priceForPreset(d, "")).toBeNull();
    expect(priceForPreset(d, "single")).toBe(220);
    expect(priceForPreset(d, "1+1")).toBe(245);
    expect(priceForPreset(d, "2+1")).toBe(280);
    expect(priceForPreset(d, "2+2")).toBe(295);
    expect(priceForPreset(d, "3+2")).toBe(450);
    expect(priceForPreset(d, "4+2")).toBe(545);
    expect(priceForPreset(d, "3+1")).toBeNull();
    expect(priceForPreset("Other work", "1+1")).toBeNull();
  });

  it("prices the additional preset descriptions from unit size", () => {
    const sizes = ["single", "1+1", "2+1", "2+2", "3+2", "4+2"] as const;
    const table: [string, number[]][] = [
      [PAINTING_OF_CEILING, [75, 115, 125, 150, 175, 195]],
      [COLOR_CHANGE_CEILING_SWISS_COFFEE, [60, 92, 100, 120, 140, 156]],
      [COLOR_CHANGE_WALLS_NAVAJO_WHITE, [176, 196, 224, 236, 360, 436]],
      [PAINT_BASE_BOARD, [95, 105, 125, 125, 155, 250]],
      [PLASTIC_COVERING_OF_FLOOR, [95, 105, 125, 135, 165, 170]],
      [PAINT_ALL_ENAMEL_SURFACES, [145, 180, 190, 195, 225, 255]],
      [TWO_TONE_COLORS, [70, 75, 80, 90, 95, 100]],
      [TWO_TONE_HASHED_HUE, [70, 75, 80, 90, 95, 100]],
    ];
    for (const [desc, amounts] of table) {
      sizes.forEach((size, i) => {
        expect(priceForPreset(desc, size)).toBe(amounts[i]);
      });
    }
  });

  it("prices kitchen cabinet items at a fixed amount regardless of size", () => {
    const table: [string, number][] = [
      [PAINT_KITCHEN_CABINET_INSIDE, 130],
      [PAINT_KITCHEN_CABINET_OUTSIDE, 165],
      [PAINT_KITCHEN_CABINET_BOTH, 295],
      [VARNISH_KITCHEN_CABINET, 350],
      [PAINT_OVER_CABINETS_PRIMER_INSIDE, 190],
      [PAINT_OVER_CABINETS_PRIMER_OUTSIDE, 280],
    ];
    for (const [desc, amount] of table) {
      expect(priceForPreset(desc, "")).toBe(amount);
      expect(priceForPreset(desc, "1+1")).toBe(amount);
      expect(priceForPreset(desc, "4+2")).toBe(amount);
    }
  });
});

describe("applyPresetPriceToLine", () => {
  it("clears price when size is empty and leaves non-preset lines alone", () => {
    const inv = emptyInvoice();
    const preset = {
      ...emptyInvoiceLine(inv, 1),
      description: INTERIOR_PAINT_WALL_CLOSET,
      price: 245,
    };
    const custom = {
      ...emptyInvoiceLine(inv, 2),
      description: "Custom",
      price: 99,
    };
    expect(applyPresetPriceToLine(preset, "").price).toBe(0);
    expect(applyPresetPriceToLine(preset, "2+1").price).toBe(280);
    expect(applyPresetPrices("1+1", [preset, custom]).map((l) => l.price)).toEqual(
      [245, 99]
    );
    const cabinet = {
      ...emptyInvoiceLine(inv, 3),
      description: PAINT_KITCHEN_CABINET_INSIDE,
    };
    expect(applyPresetPriceToLine(cabinet, "").price).toBe(130);
    expect(applyPresetPriceToLine(cabinet, "3+2").price).toBe(130);
  });
});
