// Some env var UIs don't preserve real newlines on paste, or the value
// passes through a step that escapes them - PEM parsing requires real
// newlines between the header, body, and footer, so a literal `\n` with no
// real newlines anywhere fails to parse. A real multi-line paste already
// has actual newlines and this is a no-op for it.
export function normalizePemKey(key: string): string {
  return key.includes("\\n") && !key.includes("\n") ? key.replace(/\\n/g, "\n") : key;
}
