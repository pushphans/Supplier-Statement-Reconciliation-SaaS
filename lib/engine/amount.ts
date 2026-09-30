import Decimal from "decimal.js";

// Fixed precision decimal arithmetic for financial values.
// Authoritative amounts are always decimal strings — never JS floats.
Decimal.set({ precision: 40, toExpNeg: -30, toExpPos: 30 });

export { Decimal };

export type AmountParseOptions = {
  /** Explicit decimal separator from a mapping profile, when known. */
  decimalSeparator?: "." | ",";
  /** Explicit thousands separator from a mapping profile, when known. */
  thousandsSeparator?: "," | "." | " " | "";
};

export type AmountParseResult =
  | { ok: true; value: Decimal }
  | { ok: false; reason: string };

const CURRENCY_TOKEN =
  /^\s*(?:USD|EUR|GBP|INR|AUD|CAD|CHF|JPY|CNY|NZD|SEK|NOK|DKK|ZAR|SGD|HKD|AED|SAR|PLN|BRL|MXN|IDR|MYR|PHP|THB|VND|KRW|RUB|TRY)\s*|\s*(?:USD|EUR|GBP|INR|AUD|CAD|CHF|JPY|CNY)\s*$/gi;
const CURRENCY_SYMBOLS = /[$€£₹¥￥₩\u20AC\u00A3\u20B9\u00A5]/g;

function stripKnownDecorations(input: string): string {
  let s = input.trim();
  s = s.replace(CURRENCY_SYMBOLS, "");
  s = s.replace(CURRENCY_TOKEN, (m) => (m.trim() === "" ? " " : ""));
  s = s.replace(/\b(?:CR|DR|cr|dr)\b/g, "");
  return s.trim();
}

/**
 * Parse a monetary amount from raw spreadsheet/text input into a Decimal.
 * Handles thousands/decimal separators, parentheses negatives, trailing minus,
 * and profile-specified separators. Never uses float math for the value.
 */
export function parseAmount(
  raw: string | number | null | undefined,
  opts: AmountParseOptions = {},
): AmountParseResult {
  if (raw === null || raw === undefined) return { ok: false, reason: "Amount is empty" };
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return { ok: false, reason: "Amount is not a finite number" };
    return { ok: true, value: new Decimal(raw) };
  }

  let s = stripKnownDecorations(String(raw));
  if (s === "") return { ok: false, reason: "Amount is empty" };

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1).trim();
  }
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1).trim();
  }

  s = s.replace(/\s/g, "");

  if (s === "" || !/[0-9]/.test(s)) {
    return { ok: false, reason: "Amount has no digits" };
  }
  if (!/^[0-9.,]+$/.test(s)) {
    return { ok: false, reason: `Unrecognized amount format: ${String(raw).slice(0, 40)}` };
  }

  const hasDot = s.includes(".");
  const hasComma = s.includes(",");

  if (hasDot && hasComma) {
    // Rightmost separator is the decimal separator.
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    if (lastDot > lastComma) {
      s = s.replace(/,/g, "");
    } else {
      s = s.replace(/\./g, "").replace(/,/g, ".");
    }
  } else if (hasComma) {
    s = normalizeSingleSeparator(s, ",", opts);
  } else if (hasDot) {
    s = normalizeSingleSeparator(s, ".", opts);
  }

  if (!/^\d+(\.\d+)?$/.test(s)) {
    return { ok: false, reason: `Unrecognized amount format: ${String(raw).slice(0, 40)}` };
  }

  let value = new Decimal(s);
  if (negative) value = value.negated();
  return { ok: true, value };
}

function normalizeSingleSeparator(
  s: string,
  sep: "," | ".",
  opts: AmountParseOptions,
): string {
  const parts = s.split(sep);
  const decimals = opts.decimalSeparator;
  const thousands = opts.thousandsSeparator;

  // Profile-specified separators take precedence when unambiguous.
  if (decimals && thousands && decimals !== thousands) {
    if (sep === decimals && parts.length === 2) {
      return `${parts[0]}.${parts[1]}`;
    }
    if (sep === thousands) {
      return parts.join("");
    }
  }

  if (sep === ",") {
    // "1,250" → 1250 (thousands). "1,25" → 1.25 (decimal comma).
    if (parts.length === 2 && parts[1].length === 3 && /^\d{1,3}$/.test(parts[0])) {
      return parts[0] + parts[1];
    }
    if (parts.length > 2) {
      const head = parts.slice(0, -1);
      const last = parts[parts.length - 1];
      if (head.every((p) => /^\d{3}$/.test(p)) && last.length !== 3) {
        return head.join("") + "." + last;
      }
      if (head.every((p) => /^\d{3}$/.test(p)) && last.length === 3) {
        return parts.join("");
      }
      return head.join("") + "." + last;
    }
    return `${parts[0]}.${parts[1]}`;
  }

  // sep === "." — a single dot defaults to a decimal point (US convention).
  // Multiple dots (1.250.500) are treated as thousands grouping when regular.
  if (parts.length > 2 && parts.slice(0, -1).every((p) => /^\d{3}$/.test(p))) {
    return parts.join("");
  }
  return s;
}

export function amountToString(d: Decimal): string {
  return d.toFixed();
}

export function amountsEqual(a: string | Decimal, b: string | Decimal, tolerance = "0"): boolean {
  const da = a instanceof Decimal ? a : new Decimal(a);
  const db = b instanceof Decimal ? b : new Decimal(b);
  return da.minus(db).abs().lte(new Decimal(tolerance));
}

export function sumAmounts(values: string[]): string {
  return values
    .reduce((acc, v) => acc.plus(new Decimal(v)), new Decimal(0))
    .toFixed();
}

export function difference(a: string, b: string): string {
  return new Decimal(a).minus(new Decimal(b)).toFixed();
}
