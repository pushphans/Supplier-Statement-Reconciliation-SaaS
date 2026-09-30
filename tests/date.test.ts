import { describe, expect, it } from "vitest";
import { parseDate, daysBetween } from "@/lib/engine/date";

describe("parseDate", () => {
  it("parses ISO dates", () => {
    const r = parseDate("2026-09-01");
    expect(r).toEqual({ ok: true, iso: "2026-09-01", ambiguous: false });
  });

  it("parses unambiguous dd/mm/yyyy when day > 12", () => {
    const r = parseDate("25/12/2026");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.iso).toBe("2026-12-25");
  });

  it("parses unambiguous mm/dd/yyyy when month position > 12", () => {
    const r = parseDate("12/25/2026");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.iso).toBe("2026-12-25");
  });

  it("flags ambiguous dates instead of guessing", () => {
    const r = parseDate("01/02/2026");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.ambiguous).toBe(true);
  });

  it("resolves ambiguity with an explicit profile format", () => {
    const r = parseDate("01/02/2026", "DD/MM/YYYY");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.iso).toBe("2026-02-01");

    const r2 = parseDate("01/02/2026", "MM/DD/YYYY");
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.iso).toBe("2026-01-02");
  });

  it("parses dd-Mon-yyyy", () => {
    const r = parseDate("01-Sep-2026");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.iso).toBe("2026-09-01");
  });

  it("parses Date objects", () => {
    const r = parseDate(new Date(Date.UTC(2026, 8, 1)));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.iso).toBe("2026-09-01");
  });

  it("rejects garbage", () => {
    const r = parseDate("not a date");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.ambiguous).toBe(false);
  });

  it("rejects invalid calendar dates", () => {
    expect(parseDate("2026-02-30").ok).toBe(false);
    expect(parseDate("32/01/2026", "DD/MM/YYYY").ok).toBe(false);
  });
});

describe("daysBetween", () => {
  it("computes absolute day difference", () => {
    expect(daysBetween("2026-09-01", "2026-09-03")).toBe(2);
    expect(daysBetween("2026-09-03", "2026-09-01")).toBe(2);
    expect(daysBetween("2026-09-01", "2026-09-01")).toBe(0);
  });
});
