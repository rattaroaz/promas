import { describe, expect, it } from "vitest";
import { recordMatchesQuery, searchTokens, textMatchesTokens } from "./tokenSearch";

const STREET = "11334 W. Secco Canyon Hwy";

describe("token search", () => {
  it("splits on whitespace and keeps each word", () => {
    expect(searchTokens("  11334   Canyon ")).toEqual(["11334", "Canyon"]);
    expect(searchTokens("")).toEqual([]);
    expect(searchTokens("   ")).toEqual([]);
  });

  it("matches every word in any order, ignoring case", () => {
    expect(textMatchesTokens(STREET, "11334 Canyon")).toBe(true);
    expect(textMatchesTokens(STREET, "11334 Secco")).toBe(true);
    expect(textMatchesTokens(STREET, "canyon SECCO")).toBe(true);
    expect(recordMatchesQuery("11334 Canyon", STREET, "LOS ANGELES")).toBe(true);
  });

  it("rejects a query when any word is missing", () => {
    expect(textMatchesTokens(STREET, "11334 Missing")).toBe(false);
    expect(textMatchesTokens(STREET, "Canyon Road")).toBe(false);
  });

  it("matches every record when the query is blank", () => {
    expect(textMatchesTokens(STREET, "")).toBe(true);
    expect(textMatchesTokens(STREET, "   ")).toBe(true);
  });

  it("does not require the words to be a contiguous phrase", () => {
    expect(STREET.toLowerCase().includes("11334 canyon")).toBe(false);
    expect(textMatchesTokens(STREET, "11334 Canyon")).toBe(true);
  });
});
