export function formatMoney(
  value: string | number | null | undefined,
  currency?: string | null,
): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const [int, frac] = abs.toFixed(2).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = `${sign}${grouped}.${frac}`;
  if (currency) return `${body} ${currency}`;
  return body;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const MATCH_TYPE_LABELS: Record<string, string> = {
  exact_match: "Exact match",
  probable_match: "Probable match",
  manually_matched: "Manual match",
  amount_mismatch: "Amount mismatch",
  missing_in_ledger: "Missing in ledger",
  missing_on_statement: "Missing on statement",
  duplicate_statement: "Duplicate on statement",
  duplicate_ledger: "Duplicate in ledger",
};

export const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  processing: "Processing",
  review: "In review",
  completed: "Completed",
};

export const EXCEPTION_MATCH_TYPES = new Set([
  "amount_mismatch",
  "missing_in_ledger",
  "missing_on_statement",
  "duplicate_statement",
  "duplicate_ledger",
]);

export function matchTypeBadgeClass(matchType: string): string {
  switch (matchType) {
    case "exact_match":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "manually_matched":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "probable_match":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "amount_mismatch":
      return "bg-red-50 text-red-700 border-red-200";
    case "missing_in_ledger":
    case "missing_on_statement":
      return "bg-orange-50 text-orange-700 border-orange-200";
    case "duplicate_statement":
    case "duplicate_ledger":
      return "bg-purple-50 text-purple-700 border-purple-200";
    default:
      return "bg-zinc-100 text-zinc-700 border-zinc-200";
  }
}

export function statusBadgeClass(status: string): string {
  switch (status) {
    case "completed":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "review":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "processing":
      return "bg-amber-50 text-amber-700 border-amber-200";
    default:
      return "bg-zinc-100 text-zinc-700 border-zinc-200";
  }
}
