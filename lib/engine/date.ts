export type DateParseResult =
  | { ok: true; iso: string; ambiguous: boolean }
  | { ok: false; ambiguous: boolean; reason: string };

export type DateFormatOption =
  | "auto"
  | "YYYY-MM-DD"
  | "DD/MM/YYYY"
  | "MM/DD/YYYY"
  | "DD-MM-YYYY"
  | "MM-DD-YYYY"
  | "DD-Mon-YYYY";

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DEC: 12,
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toIso(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${dt.getUTCFullYear()}-${pad(m)}-${pad(d)}`;
}

function fromExcelSerial(n: number): string | null {
  // Excel serial date (1900 system)
  if (n < 1 || n > 80000) return null;
  const epoch = Date.UTC(1899, 11, 30);
  const dt = new Date(epoch + Math.round(n) * 86400000);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/**
 * Parse a date only when the format can be identified confidently.
 * Ambiguous day/month orders return ambiguous=true instead of silently guessing.
 */
export function parseDate(
  raw: string | number | Date | null | undefined,
  format: DateFormatOption | string = "auto",
): DateParseResult {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: false, ambiguous: false, reason: "Date is empty" };
  }

  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return {
      ok: true,
      iso: `${raw.getUTCFullYear()}-${pad(raw.getUTCMonth() + 1)}-${pad(raw.getUTCDate())}`,
      ambiguous: false,
    };
  }

  if (typeof raw === "number") {
    const iso = fromExcelSerial(raw);
    if (iso) return { ok: true, iso, ambiguous: false };
    return { ok: false, ambiguous: false, reason: "Unrecognized numeric date" };
  }

  const s = String(raw).trim();
  if (s === "") return { ok: false, ambiguous: false, reason: "Date is empty" };

  // ISO
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const iso = toIso(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
    if (iso) return { ok: true, iso, ambiguous: false };
    return { ok: false, ambiguous: false, reason: `Invalid date: ${s}` };
  }

  // dd-Mon-yyyy / dd Mon yyyy
  const monMatch = s.match(/^(\d{1,2})[\s\-/]([A-Za-z]{3,9})[\s,\-/](\d{2,4})$/);
  if (monMatch) {
    const mon = MONTHS[monMatch[2].slice(0, 3).toUpperCase()] ?? MONTHS[monMatch[2].toUpperCase()];
    let year = Number(monMatch[3]);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    if (mon) {
      const iso = toIso(year, mon, Number(monMatch[1]));
      if (iso) return { ok: true, iso, ambiguous: false };
    }
    return { ok: false, ambiguous: false, reason: `Invalid date: ${s}` };
  }

  // Numeric d/m/y or m/d/y
  const numMatch = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (numMatch) {
    const a = Number(numMatch[1]);
    const b = Number(numMatch[2]);
    let year = Number(numMatch[3]);
    if (year < 100) year += year < 70 ? 2000 : 2000;

    const fmt = (format || "auto").toUpperCase();
    if (fmt === "YYYY-MM-DD") {
      // not this shape
    }

    const dayFirstFormats = ["DD/MM/YYYY", "DD-MM-YYYY", "DD/MM/YY"];
    const monthFirstFormats = ["MM/DD/YYYY", "MM-DD-YYYY", "MM/DD/YY"];

    if (dayFirstFormats.includes(fmt)) {
      const iso = toIso(year, b, a);
      if (iso) return { ok: true, iso, ambiguous: false };
      return { ok: false, ambiguous: false, reason: `Invalid date: ${s}` };
    }
    if (monthFirstFormats.includes(fmt)) {
      const iso = toIso(year, a, b);
      if (iso) return { ok: true, iso, ambiguous: false };
      return { ok: false, ambiguous: false, reason: `Invalid date: ${s}` };
    }

    // auto: infer only when unambiguous
    if (a > 12 && b <= 12) {
      const iso = toIso(year, b, a);
      if (iso) return { ok: true, iso, ambiguous: false };
    } else if (b > 12 && a <= 12) {
      const iso = toIso(year, a, b);
      if (iso) return { ok: true, iso, ambiguous: false };
    } else if (a <= 12 && b <= 12) {
      // Both valid as day and month — cannot decide.
      return { ok: false, ambiguous: true, reason: `Ambiguous date format: ${s}` };
    }

    const iso = toIso(year, b, a) ?? toIso(year, a, b);
    if (iso) return { ok: true, iso, ambiguous: true };
    return { ok: false, ambiguous: false, reason: `Invalid date: ${s}` };
  }

  return { ok: false, ambiguous: false, reason: `Unrecognized date format: ${s}` };
}

export function daysBetween(isoA: string, isoB: string): number {
  const a = Date.parse(`${isoA}T00:00:00Z`);
  const b = Date.parse(`${isoB}T00:00:00Z`);
  return Math.round(Math.abs(a - b) / 86400000);
}
