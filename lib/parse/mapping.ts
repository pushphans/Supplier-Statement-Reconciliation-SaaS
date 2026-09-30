import type { RawTable } from "./index";
import { normalizeReference } from "@/lib/engine/normalize";
import { parseAmount, type AmountParseOptions } from "@/lib/engine/amount";
import { parseDate, type DateFormatOption } from "@/lib/engine/date";
import type { ColumnMapping, NormalizationOptions } from "@/lib/validation";

export const REQUIRED_FIELDS = [
  { key: "reference", label: "Invoice / Reference Number", required: true },
  { key: "amount", label: "Amount", required: "amount_or_debit_credit" as const },
] as const;

export const OPTIONAL_FIELDS = [
  { key: "transaction_date", label: "Transaction / Invoice Date", recommended: true },
  { key: "due_date", label: "Due Date" },
  { key: "debit", label: "Debit Amount" },
  { key: "credit", label: "Credit Amount" },
  { key: "balance", label: "Balance" },
  { key: "currency", label: "Currency" },
  { key: "transaction_type", label: "Transaction Type" },
  { key: "description", label: "Description" },
] as const;

export type FieldKey = "reference" | "amount" | "transaction_date" | (typeof OPTIONAL_FIELDS)[number]["key"];

const REF_PATTERNS = /invoice|doc(ument)?\s*(no|num|number|#)?|reference|ref\s*(no|number)?|bill\s*no|voucher|po\s*no/i;
const AMOUNT_PATTERNS = /amount|value|total|debit|credit|price|sum|balance|due/i;
const DATE_PATTERNS = /date|dt\b|period/i;
const CURRENCY_PATTERNS = /curr|currency|ccy/i;
const DESC_PATTERNS = /desc|narration|details|particulars|memo/i;
const TYPE_PATTERNS = /type|nature|kind/i;
const DUE_PATTERNS = /due/i;

/** Heuristic auto-mapping from headers — user can always override. */
export function suggestMapping(headers: string[]): Partial<ColumnMapping> {
  const mapping: Partial<ColumnMapping> = {};
  const used = new Set<string>();

  const take = (key: keyof ColumnMapping, pred: (h: string) => boolean) => {
    if (mapping[key]) return;
    const idx = headers.findIndex((h, i) => !used.has(String(i)) && pred(h));
    if (idx >= 0) {
      mapping[key] = String(idx);
      used.add(String(idx));
    }
  };

  take("reference", (h) => REF_PATTERNS.test(h));
  take("transaction_date", (h) => DATE_PATTERNS.test(h) && !DUE_PATTERNS.test(h));
  take("due_date", (h) => DUE_PATTERNS.test(h));
  take("debit", (h) => /^\s*debit|debit\b/i.test(h));
  take("credit", (h) => /^\s*credit|credit\b/i.test(h));
  take("amount", (h) => AMOUNT_PATTERNS.test(h) && !/debit|credit|balance/i.test(h));
  if (!mapping.amount && (mapping.debit || mapping.credit)) {
    // amount covered by debit/credit columns
  }
  take("balance", (h) => /balance/i.test(h));
  take("currency", (h) => CURRENCY_PATTERNS.test(h));
  take("transaction_type", (h) => TYPE_PATTERNS.test(h));
  take("description", (h) => DESC_PATTERNS.test(h));

  return mapping;
}

export type NormalizedRow = {
  rowNumber: number;
  rawReference: string;
  normalizedReference: string;
  transactionDate: string | null;
  amount: string;
  currency: string | null;
  transactionType: "invoice" | "credit" | "unknown";
  rawData: Record<string, string>;
  warnings: string[];
  errors: string[];
};

export type ValidationReport = {
  rows: NormalizedRow[];
  preview: NormalizedRow[];
  blocking: string[];
  warnings: string[];
  stats: {
    total: number;
    valid: number;
    missingReference: number;
    invalidAmounts: number;
    ambiguousDates: number;
    missingDates: number;
    duplicateReferences: number;
    creditCount: number;
  };
  detectedCurrencies: string[];
};

function cell(row: string[], headers: string[], mapping: ColumnMapping, key: string): string {
  const idx = mapping[key as keyof ColumnMapping];
  if (idx === undefined || idx === "") return "";
  const i = Number(idx);
  if (Number.isNaN(i) || i < 0) return "";
  return row[i] ?? "";
}

function inferTransactionType(rawType: string, amount: string): "invoice" | "credit" | "unknown" {
  const t = rawType.trim().toLowerCase();
  if (t) {
    if (/credit|cr|cn|note/.test(t)) return "credit";
    if (/invoice|inv|bill|dr|purchase/.test(t)) return "invoice";
  }
  if (amount.startsWith("-")) return "credit";
  return "invoice";
}

/**
 * Normalize + validate a raw table against a column mapping.
 * Blocking errors prevent continuing; non-blocking warnings are surfaced.
 */
export function normalizeTable(
  table: RawTable,
  mapping: ColumnMapping,
  options: NormalizationOptions,
): ValidationReport {
  const blocking: string[] = [];
  const warnings: string[] = [];

  const hasRef = mapping.reference !== undefined && mapping.reference !== "";
  const hasAmount = mapping.amount !== undefined && mapping.amount !== "";
  const hasDebit = mapping.debit !== undefined && mapping.debit !== "";
  const hasCredit = mapping.credit !== undefined && mapping.credit !== "";

  if (!hasRef) blocking.push("No invoice reference column is mapped.");
  if (!hasAmount && !(hasDebit || hasCredit)) {
    blocking.push("No amount column is mapped (map Amount, or Debit and Credit).");
  }
  if (table.rows.length === 0) blocking.push("File contains zero valid transactions.");

  const amountOpts: AmountParseOptions = {
    decimalSeparator: options.decimalSeparator,
    thousandsSeparator: options.thousandsSeparator,
  };
  const dateFormat = (options.dateFormat ?? "auto") as DateFormatOption;

  const rows: NormalizedRow[] = [];
  const refCounts = new Map<string, number>();
  const currencies = new Set<string>();
  let missingReference = 0;
  let invalidAmounts = 0;
  let ambiguousDates = 0;
  let missingDates = 0;
  let creditCount = 0;

  table.rows.forEach((row, idx) => {
    const rowNumber = idx + 1;
    const warningsRow: string[] = [];
    const errorsRow: string[] = [];

    const rawReference = hasRef ? cell(row, table.headers, mapping, "reference") : "";
    const normalizedReference = normalizeReference(rawReference);
    if (!normalizedReference) {
      missingReference += 1;
      warningsRow.push("Missing invoice reference");
    }

    let amountStr = "0";
    if (hasAmount) {
      const parsed = parseAmount(cell(row, table.headers, mapping, "amount"), amountOpts);
      if (!parsed.ok) {
        invalidAmounts += 1;
        errorsRow.push(parsed.reason);
        amountStr = "";
      } else {
        amountStr = parsed.value.toFixed();
      }
    } else {
      const d = parseAmount(cell(row, table.headers, mapping, "debit") || "0", amountOpts);
      const c = parseAmount(cell(row, table.headers, mapping, "credit") || "0", amountOpts);
      if (!d.ok || !c.ok) {
        invalidAmounts += 1;
        if (!d.ok) errorsRow.push(`Debit: ${d.reason}`);
        if (!c.ok) errorsRow.push(`Credit: ${c.reason}`);
        amountStr = "";
      } else {
        amountStr = d.value.minus(c.value).toFixed();
      }
    }

    let transactionDate: string | null = null;
    const rawDate = cell(row, table.headers, mapping, "transaction_date");
    if (rawDate.trim() === "") {
      missingDates += 1;
      warningsRow.push("Missing date");
    } else {
      const parsed = parseDate(rawDate, dateFormat);
      if (parsed.ok) {
        transactionDate = parsed.iso;
      } else if (parsed.ambiguous) {
        ambiguousDates += 1;
        warningsRow.push(`Ambiguous date format: ${rawDate}`);
      } else {
        warningsRow.push(parsed.reason);
      }
    }

    const rawCurrency = cell(row, table.headers, mapping, "currency").trim();
    let currency: string | null = null;
    if (rawCurrency) {
      const code = rawCurrency.toUpperCase().slice(0, 3);
      if (/^[A-Z]{3}$/.test(code)) {
        currency = code;
        currencies.add(code);
      }
    } else if (options.defaultCurrency) {
      currency = options.defaultCurrency;
    }

    const rawType = cell(row, table.headers, mapping, "transaction_type");
    const transactionType = inferTransactionType(rawType, amountStr);
    if (transactionType === "credit") creditCount += 1;

    const rawData: Record<string, string> = {};
    table.headers.forEach((h, i) => {
      rawData[h || `Column ${i + 1}`] = row[i] ?? "";
    });

    if (normalizedReference) {
      refCounts.set(normalizedReference, (refCounts.get(normalizedReference) ?? 0) + 1);
    }

    rows.push({
      rowNumber,
      rawReference,
      normalizedReference,
      transactionDate,
      amount: amountStr,
      currency,
      transactionType,
      rawData,
      warnings: warningsRow,
      errors: errorsRow,
    });
  });

  const duplicateReferences = [...refCounts.values()].filter((n) => n > 1).length;

  if (missingReference > 0) {
    warnings.push(`${missingReference} row${missingReference === 1 ? "" : "s"} missing invoice reference`);
  }
  if (invalidAmounts > 0) {
    blocking.push(`${invalidAmounts} row${invalidAmounts === 1 ? "" : "s"} have invalid amounts`);
  }
  if (ambiguousDates > 0) {
    warnings.push(`${ambiguousDates} ambiguous date format${ambiguousDates === 1 ? "" : "s"} — set the date format in normalization options`);
  }
  if (duplicateReferences > 0) {
    warnings.push(`${duplicateReferences} duplicate reference${duplicateReferences === 1 ? "" : "s"} detected (non-blocking)`);
  }
  if (currencies.size > 1) {
    blocking.push(`Inconsistent currencies detected (${[...currencies].join(", ")}). Select a single reconciliation currency or fix the file.`);
  }
  if (rows.length > 0 && rows.every((r) => r.amount === "")) {
    blocking.push("Zero valid transactions.");
  }

  const valid = rows.filter((r) => r.amount !== "" && r.normalizedReference !== "").length;

  return {
    rows,
    preview: rows.slice(0, 20),
    blocking,
    warnings,
    stats: {
      total: rows.length,
      valid,
      missingReference,
      invalidAmounts,
      ambiguousDates,
      missingDates,
      duplicateReferences,
      creditCount,
    },
    detectedCurrencies: [...currencies],
  };
}
