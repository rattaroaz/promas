import { describe, expect, it } from "vitest";
import { isVersionNewer, parseSemver } from "./semver";

describe("parseSemver", () => {
  it("parses major.minor.patch", () => {
    expect(parseSemver("1.2.3")).toEqual([1, 2, 3]);
  });

  it("strips v prefix", () => {
    expect(parseSemver("v1.2.0")).toEqual([1, 2, 0]);
  });

  it("defaults missing patch to 0", () => {
    expect(parseSemver("1.2")).toEqual([1, 2, 0]);
  });

  it("strips pre-release and build metadata", () => {
    expect(parseSemver("1.2.3-beta.1+build")).toEqual([1, 2, 3]);
  });

  it("returns null for invalid input", () => {
    expect(parseSemver("")).toBeNull();
    expect(parseSemver("abc")).toBeNull();
    expect(parseSemver("1")).toBeNull();
  });
});

describe("isVersionNewer", () => {
  it("detects newer patch/minor/major", () => {
    expect(isVersionNewer("1.2.0", "1.1.9")).toBe(true);
    expect(isVersionNewer("1.3.0", "1.2.9")).toBe(true);
    expect(isVersionNewer("2.0.0", "1.9.9")).toBe(true);
  });

  it("returns false for equal versions", () => {
    expect(isVersionNewer("1.1.0", "1.1.0")).toBe(false);
    expect(isVersionNewer("v2.0.0", "2.0.0")).toBe(false);
  });

  it("returns false when candidate is older", () => {
    expect(isVersionNewer("1.1.6", "1.2.0")).toBe(false);
  });

  it("handles v-prefixed candidate", () => {
    expect(isVersionNewer("v1.2.0", "1.1.0")).toBe(true);
  });

  it("returns false when either side fails to parse", () => {
    expect(isVersionNewer("nope", "1.0.0")).toBe(false);
    expect(isVersionNewer("1.0.0", "nope")).toBe(false);
  });
});
