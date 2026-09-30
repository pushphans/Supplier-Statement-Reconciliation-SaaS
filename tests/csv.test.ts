import { describe, expect, it } from "vitest";
import { sanitizeCsvText, formatCsvAmount, csvEscape, toCsv } from "@/lib/csv";

describe("CSV formula injection protection", () => {
  it("prefixes = formula cells", () => {
    expect(sanitizeCsvText("=1+1")).toBe("'=1+1");
    expect(sanitizeCsvText("=HYPERLINK(\"http://evil\")")).toContain("'=");
  });

  it("prefixes +, -, @ starters on text", () => {
    expect(sanitizeCsvText("+SUM(A1)")).toBe("'+SUM(A1)");
    expect(sanitizeCsvText("-2+3+cmd")).toBe("'-2+3+cmd");
    expect(sanitizeCsvText("@cmd")).toBe("'@cmd");
  });

  it("keeps benign text untouched", () => {
    expect(sanitizeCsvText("INV-1001")).toBe("INV-1001");
    expect(sanitizeCsvText("hello")).toBe("hello");
  });

  it("keeps valid negative numeric amounts as numbers", () => {
    expect(formatCsvAmount("-100.00")).toBe("-100.00");
    expect(formatCsvAmount("1250.50")).toBe("1250.50");
    expect(formatCsvAmount(5)).toBe("5");
  });

  it("sanitizes amount-like formula strings and passes other text through", () => {
    expect(formatCsvAmount("=1+1")).toBe("'=1+1");
    expect(formatCsvAmount("12abc")).toBe("12abc");
  });

  it("escapes quotes, commas, newlines", () => {
    expect(csvEscape('a"b')).toBe('"a""b"');
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape("a\nb")).toBe('"a\nb"');
  });

  it("builds a full CSV with header and BOM", () => {
    const csv = toCsv(
      [
        { header: "ref", value: (r: { ref: string }) => r.ref, kind: "text" as const },
        { header: "amount", value: (r: { amount: string }) => r.amount, kind: "amount" as const },
      ],
      [{ ref: "=evil", amount: "-50.00" }],
    );
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("'=evil");
    expect(csv).toContain("-50.00");
  });
});
