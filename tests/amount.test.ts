import { describe, expect, it } from "vitest";
import { parseAmount, amountsEqual, sumAmounts, difference } from "@/lib/engine/amount";

describe("parseAmount", () => {
  it("parses plain decimals", () => {
    const r = parseAmount("1250.50");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.toFixed(2)).toBe("1250.50");
  });

  it("parses PRD example 1,250.50 → 1250.50", () => {
    const r = parseAmount("1,250.50");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.toFixed(2)).toBe("1250.50");
  });

  it("parses thousands-only commas", () => {
    const r = parseAmount("1,250");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.toFixed()).toBe("1250");
  });

  it("parses decimal comma", () => {
    const r = parseAmount("1250,50");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.toFixed(2)).toBe("1250.50");
  });

  it("parses parentheses negatives", () => {
    const r = parseAmount("(100.00)");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.toFixed(2)).toBe("-100.00");
  });

  it("parses trailing minus", () => {
    const r = parseAmount("100.00-");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.toFixed(2)).toBe("-100.00");
  });

  it("parses currency symbols and codes", () => {
    expect(parseAmount("$1,000.00")).toMatchObject({ ok: true });
    const r = parseAmount("USD 1,000.00");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.toFixed(2)).toBe("1000.00");
    const r2 = parseAmount("€1.000,50");
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.value.toFixed(2)).toBe("1000.50");
  });

  it("preserves negative credit values", () => {
    const r = parseAmount("-100.00");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.toFixed(2)).toBe("-100.00");
  });

  it("honors profile separators", () => {
    const r = parseAmount("1.250.500,75", { decimalSeparator: ",", thousandsSeparator: "." });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.toFixed(2)).toBe("1250500.75");
  });

  it("rejects empty and non-numeric", () => {
    expect(parseAmount("").ok).toBe(false);
    expect(parseAmount(null).ok).toBe(false);
    expect(parseAmount("abc").ok).toBe(false);
    expect(parseAmount("12abc").ok).toBe(false);
  });

  it("accepts numeric input from spreadsheets", () => {
    const r = parseAmount(1250.5);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.toFixed(2)).toBe("1250.50");
  });
});

describe("decimal-safe comparisons", () => {
  it("0.1 + 0.2 style float traps do not break equality", () => {
    // Classic IEEE754: 0.1 + 0.2 !== 0.3 in floats
    expect(amountsEqual(sumAmounts(["0.1", "0.2"]), "0.3")).toBe(true);
  });

  it("applies tolerance", () => {
    expect(amountsEqual("100.00", "100.01", "0")).toBe(false);
    expect(amountsEqual("100.00", "100.01", "0.01")).toBe(true);
  });

  it("computes difference exactly", () => {
    expect(difference("950", "900")).toBe("50");
    expect(difference("100.05", "100.00")).toBe("0.05");
    expect(difference("0.3", "0.1")).toBe("0.2");
  });
});
