/**
 * CSV export helpers with spreadsheet formula-injection protection (PRD §78).
 *
 * Text cells beginning with =, +, -, @, tab, or CR are prefixed with a single
 * quote so spreadsheet software treats them as text. Numeric columns are only
 * written when they match a strict decimal pattern — otherwise they fall back
 * to sanitized text handling.
 */

const FORMULA_PREFIX = /^[=+\-@\t\r]/;
const SAFE_NUMBER = /^-?\d+(\.\d+)?$/;

export function sanitizeCsvText(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  // Neutralize embedded quotes/newlines via standard CSV escaping later;
  // handle formula injection here.
  if (FORMULA_PREFIX.test(s)) {
    s = `'${s}`;
  }
  return s;
}

export function formatCsvAmount(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value).trim();
  if (SAFE_NUMBER.test(s)) return s;
  return sanitizeCsvText(s);
}

export function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export type CsvColumn<T> = {
  header: string;
  /** Return the raw cell value for a row. */
  value: (row: T) => string | number | null | undefined;
  /** "text" applies formula-injection sanitization; "amount" validates numeric form. */
  kind: "text" | "amount";
};

export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const lines: string[] = [];
  lines.push(columns.map((c) => csvEscape(c.header)).join(","));
  for (const row of rows) {
    const cells = columns.map((c) => {
      const raw = c.value(row);
      const formatted =
        c.kind === "amount" ? formatCsvAmount(raw) : sanitizeCsvText(raw === null || raw === undefined ? "" : String(raw));
      return csvEscape(formatted);
    });
    lines.push(cells.join(","));
  }
  // UTF-8 BOM so Excel opens non-ASCII characters correctly.
  return `﻿${lines.join("\r\n")}\r\n`;
}
