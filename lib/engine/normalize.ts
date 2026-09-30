/**
 * Invoice/reference normalization.
 * Raw values are never mutated by callers — always store raw + normalized.
 *
 * Rules (PRD §19):
 * - Unicode NFKC normalize
 * - trim whitespace
 * - uppercase
 * - remove common separators: whitespace (incl. NBSP), hyphen, slash, underscore, period
 * - do NOT strip arbitrary alphanumeric characters
 */
export function normalizeReference(raw: string): string {
  if (raw == null) return "";
  return raw
    .normalize("NFKC")
    .replace(/ /g, " ")
    .trim()
    .toUpperCase()
    .replace(/[\s\-/_\.]+/g, "");
}

export function isBlankReference(raw: string | null | undefined): boolean {
  return normalizeReference(raw ?? "") === "";
}
