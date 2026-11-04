/** Words in a search box. Empty input has no words and matches everything. */
export function searchTokens(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean);
}

/**
 * Every word in `query` must appear in `haystack`, in any order.
 * Matching is case-insensitive. A blank query matches.
 */
export function textMatchesTokens(haystack: string, query: string): boolean {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return true;
  const hay = haystack.toLowerCase();
  return tokens.every((token) => hay.includes(token.toLowerCase()));
}

/** Join the parts of one record, then require every search word. */
export function recordMatchesQuery(
  query: string,
  ...parts: Array<string | number | null | undefined>
): boolean {
  return textMatchesTokens(
    parts
      .filter((part) => part != null && String(part) !== "")
      .join(" "),
    query
  );
}
