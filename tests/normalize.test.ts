import { describe, expect, it } from "vitest";
import { normalizeReference, isBlankReference } from "@/lib/engine/normalize";

describe("normalizeReference", () => {
  it("applies the PRD example: INV- 00123 / A → INV00123A", () => {
    expect(normalizeReference("INV- 00123 / A")).toBe("INV00123A");
  });

  it("trims and uppercases", () => {
    expect(normalizeReference("  inv-1001 ")).toBe("INV1001");
  });

  it("removes common separators but keeps alphanumeric", () => {
    expect(normalizeReference("a.b_c/d-e f")).toBe("ABCDEF");
    expect(normalizeReference("PO#12345")).toBe("PO#12345");
  });

  it("normalizes unicode and NBSP", () => {
    expect(normalizeReference("INV -1001")).toBe("INV1001");
    expect(normalizeReference("ＦＯＮＴ")).toBe("FONT");
  });

  it("does not remove arbitrary characters", () => {
    expect(normalizeReference("INV:123#A")).toBe("INV:123#A");
  });

  it("handles null/empty", () => {
    expect(normalizeReference("")).toBe("");
    expect(normalizeReference(null as unknown as string)).toBe("");
    expect(isBlankReference("   ")).toBe(true);
    expect(isBlankReference("1")).toBe(false);
  });

  it("is idempotent", () => {
    const once = normalizeReference("INV- 00123 / A");
    expect(normalizeReference(once)).toBe(once);
  });
});
