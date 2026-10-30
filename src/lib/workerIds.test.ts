import { describe, expect, it } from "vitest";
import {
  duplicateWorkerGroups,
  duplicateWorkerWarning,
  workerIdAlreadyShared,
  workerIdBlocksSave,
} from "./workerIds";

const shared = [
  { name: "Jose Ramirez", workerNo: "400", originalName: "Jose Ramirez" },
  { name: "Ana Cruz", workerNo: " 400 ", originalName: "Ana Cruz" },
  { name: "Pat Lee", workerNo: "", originalName: "Pat Lee" },
];

describe("duplicate worker IDs", () => {
  it("groups IDs that are already shared and ignores blanks", () => {
    expect(duplicateWorkerGroups(shared)).toEqual([
      { id: "400", names: ["Jose Ramirez", "Ana Cruz"] },
    ]);
    expect(duplicateWorkerWarning(shared)).toContain("400");
    expect(duplicateWorkerWarning(shared)).toContain("Jose Ramirez");
    expect(duplicateWorkerWarning(shared)).toContain("Ana Cruz");
    expect(duplicateWorkerWarning(shared)).toMatch(/still edit and save/i);
    expect(duplicateWorkerWarning([{ name: "Jose", workerNo: "400" }])).toBe("");
  });

  it("lets a person keep an ID they already share, and blocks a new collision", () => {
    expect(workerIdBlocksSave(shared, "400", "Jose Ramirez")).toBe(false);
    expect(workerIdBlocksSave(shared, " 400 ", "Ana Cruz")).toBe(false);
    expect(workerIdAlreadyShared(shared, "400", "Jose Ramirez")).toBe(true);
    expect(workerIdBlocksSave(shared, "15", "Jose Ramirez")).toBe(false);
    expect(workerIdBlocksSave(shared, "400", "Pat Lee")).toBe(true);
    expect(workerIdBlocksSave(shared, "400", "")).toBe(true);
    expect(workerIdBlocksSave(shared, "", "Pat Lee")).toBe(false);
    expect(workerIdAlreadyShared(shared, "15", "Jose Ramirez")).toBe(false);
  });
});
