/** Parse "1.2.3", "v1.2.3", or "1.2" into [major, minor, patch]. */
export function parseSemver(version: string): [number, number, number] | null {
  let v = version.trim();
  if (v.startsWith("v") || v.startsWith("V")) v = v.slice(1);
  const plus = v.indexOf("+");
  if (plus >= 0) v = v.slice(0, plus);
  const dash = v.indexOf("-");
  if (dash >= 0) v = v.slice(0, dash);
  const parts = v.split(".");
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0)) return null;
  return [nums[0], nums[1], nums[2] ?? 0];
}

/** True when candidate is strictly greater than installed (major → minor → patch). */
export function isVersionNewer(candidate: string, installed: string): boolean {
  const a = parseSemver(candidate);
  const b = parseSemver(installed);
  if (!a || !b) return false;
  if (a[0] !== b[0]) return a[0] > b[0];
  if (a[1] !== b[1]) return a[1] > b[1];
  return a[2] > b[2];
}
