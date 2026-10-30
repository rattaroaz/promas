/** A worker row the duplicate check can see. `originalName` is the stored name. */
export type WorkerIdRow = {
  name: string;
  workerNo: string;
  originalName?: string;
};

export type DuplicateWorkerGroup = {
  id: string;
  names: string[];
};

/**
 * Worker IDs that already belong to more than one person. Blank IDs are
 * allowed more than once and are not listed. The id text is the first
 * spelling stored.
 */
export function duplicateWorkerGroups(rows: WorkerIdRow[]): DuplicateWorkerGroup[] {
  const groups: DuplicateWorkerGroup[] = [];
  for (const row of rows) {
    const id = row.workerNo.trim();
    if (!id) continue;
    const found = groups.find((group) => group.id.toLowerCase() === id.toLowerCase());
    const name = row.name.trim() || "worker";
    if (found) found.names.push(name);
    else groups.push({ id, names: [name] });
  }
  return groups.filter((group) => group.names.length > 1);
}

/** Message for a catalog that already contains duplicated IDs. Empty when it does not. */
export function duplicateWorkerWarning(rows: WorkerIdRow[]): string {
  const groups = duplicateWorkerGroups(rows);
  if (groups.length === 0) return "";
  const parts = groups.map((group) => `${group.id} (${group.names.join(", ")})`);
  return `Duplicate Worker ID ${parts.join("; ")}. You can still save. Change one ID.`;
}

function storedName(row: WorkerIdRow): string {
  return (row.originalName ?? row.name).trim().toLowerCase();
}

/**
 * True when saving `workerNo` for `originalName` would give that ID to
 * someone who does not already have it. A person who already shares an ID
 * may keep it, so an existing database can still be edited.
 */
export function workerIdBlocksSave(
  rows: WorkerIdRow[],
  workerNo: string,
  originalName: string
): boolean {
  const id = workerNo.trim().toLowerCase();
  if (!id) return false;
  const keep = originalName.trim().toLowerCase();
  const self = rows.find((row) => storedName(row) === keep);
  if (self && self.workerNo.trim().toLowerCase() === id) return false;
  return rows.some(
    (row) => storedName(row) !== keep && row.workerNo.trim().toLowerCase() === id
  );
}

/** This person already shares their current ID with someone else. */
export function workerIdAlreadyShared(
  rows: WorkerIdRow[],
  workerNo: string,
  originalName: string
): boolean {
  const id = workerNo.trim().toLowerCase();
  const keep = originalName.trim().toLowerCase();
  if (!id || !keep) return false;
  const self = rows.find((row) => storedName(row) === keep);
  if (!self || self.workerNo.trim().toLowerCase() !== id) return false;
  return rows.some(
    (row) => storedName(row) !== keep && row.workerNo.trim().toLowerCase() === id
  );
}
