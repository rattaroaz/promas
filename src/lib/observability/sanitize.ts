/** Redact local filesystem paths before sharing diagnostics off-machine. */
export function sanitizeDiagnosticsText(text: string): string {
  return text
    .replace(/[A-Za-z]:\\[^\s"'`]+/g, "<redacted-path>")
    .replace(/\\\\[^\s"'`]+/g, "<redacted-path>")
    .replace(/\/(?:Users|home|var|tmp|private)\/[^\s"'`]+/g, "<redacted-path>")
    .replace(/file:\/\/\/[^\s"'`]+/gi, "<redacted-path>");
}
