import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  MAX_FILE_BYTES,
  MAX_ROWS,
  ParseError,
  parseCsvFile,
  parsePdfFile,
  parseXlsxFile,
  validateFile,
} from "@/lib/parse";

vi.mock("pdfjs-dist", () => ({ getDocument: vi.fn() }));

type PdfItem = { str?: string; transform?: number[]; hasEOL?: boolean };

function mockPdfPages(pages: PdfItem[][]) {
  return {
    numPages: pages.length,
    getPage: async (p: number) => ({
      getTextContent: async () => ({ items: pages[p - 1] ?? [] }),
    }),
  };
}

async function mockedGetDocument() {
  const pdfjs = await import("pdfjs-dist");
  return vi.mocked(pdfjs.getDocument);
}

function csvFile(text: string, name = "statement.csv", type = "text/csv"): File {
  return new File([text], name, { type });
}

describe("validateFile", () => {
  it("accepts csv/xlsx/pdf", () => {
    expect(validateFile(csvFile("a,b\n1,2"))).toBe("csv");
    expect(validateFile(new File(["x"], "s.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }))).toBe("xlsx");
    expect(validateFile(new File(["x"], "s.pdf", { type: "application/pdf" }))).toBe("pdf");
  });

  it("rejects unknown extensions", () => {
    try {
      validateFile(new File(["x"], "evil.exe", { type: "application/octet-stream" }));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ParseError);
      expect((e as ParseError).code).toBe("unsupported_type");
    }
  });

  it("rejects oversized files (PRD 20 MB cap)", () => {
    expect(MAX_FILE_BYTES).toBe(20 * 1024 * 1024);
    const big = new File([new Uint8Array(MAX_FILE_BYTES + 1)], "big.csv", { type: "text/csv" });
    try {
      validateFile(big);
      expect.unreachable();
    } catch (e) {
      expect((e as ParseError).code).toBe("too_large");
    }
  });

  it("rejects HTML/script MIME spoofs", () => {
    try {
      validateFile(csvFile("<html>", "renamed.csv", "text/html"));
      expect.unreachable();
    } catch (e) {
      expect((e as ParseError).code).toBe("unsupported_type");
    }
    try {
      validateFile(new File(["x"], "s.xlsx", { type: "application/javascript" }));
      expect.unreachable();
    } catch (e) {
      expect((e as ParseError).code).toBe("unsupported_type");
    }
  });
});

describe("parseCsvFile", () => {
  it("parses headers and rows", async () => {
    const t = await parseCsvFile(csvFile("invoice,date,amount\nINV-1,2026-09-01,500.00\n"));
    expect(t.headers).toEqual(["invoice", "date", "amount"]);
    expect(t.rows).toHaveLength(1);
    expect(t.fileType).toBe("csv");
  });

  it("rejects empty files", async () => {
    await expect(parseCsvFile(csvFile("\n\n"))).rejects.toMatchObject({ code: "empty" });
  });

  it("rejects files over the row cap", async () => {
    expect(MAX_ROWS).toBe(20000);
    const lines = ["invoice,amount"];
    for (let i = 0; i < MAX_ROWS + 1; i++) lines.push(`INV-${i},${i}.00`);
    await expect(parseCsvFile(csvFile(lines.join("\n")))).rejects.toMatchObject({
      code: "too_many_rows",
    });
  });
});

describe("parseXlsxFile", () => {
  it("round-trips a workbook", async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([["invoice", "amount"], ["INV-1", 100], ["INV-2", -50.5]]),
      "Sheet1",
    );
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const t = await parseXlsxFile(
      new File([buf], "s.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    expect(t.headers).toEqual(["invoice", "amount"]);
    expect(t.rows).toEqual([
      ["INV-1", "100"],
      ["INV-2", "-50.5"],
    ]);
  });

  it("rejects empty workbooks", async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), "Empty");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    await expect(
      parseXlsxFile(new File([buf], "empty.xlsx")),
    ).rejects.toMatchObject({ code: "empty" });
  });
});

describe("parsePdfFile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("detects scanned PDFs with no text layer", async () => {
    const getDocument = await mockedGetDocument();
    getDocument.mockReturnValue({ promise: Promise.resolve(mockPdfPages([[]])) } as never);
    await expect(parsePdfFile(new File(["x"], "scan.pdf", { type: "application/pdf" }))).rejects.toMatchObject({
      code: "scanned_pdf",
    });
  });

  it("extracts a simple text table", async () => {
    const getDocument = await mockedGetDocument();
    const y = (v: number): number[] => [1, 0, 0, 1, 0, v];
    getDocument.mockReturnValue({
      promise: Promise.resolve(
        mockPdfPages([
          [
            { str: "Invoice", transform: y(100) },
            { str: "  Amount", transform: y(100), hasEOL: true },
            { str: "INV-1", transform: y(80) },
            { str: "  500.00", transform: y(80), hasEOL: true },
          ],
        ]),
      ),
    } as never);
    const t = await parsePdfFile(new File(["x"], "stmt.pdf", { type: "application/pdf" }));
    expect(t.headers).toEqual(["Invoice", "Amount"]);
    expect(t.rows).toEqual([["INV-1", "500.00"]]);
  });

  it("wraps unreadable PDFs as parse_failed", async () => {
    const getDocument = await mockedGetDocument();
    getDocument.mockReturnValue({ promise: Promise.reject(new Error("bad pdf")) } as never);
    await expect(parsePdfFile(new File(["garbage"], "bad.pdf"))).rejects.toMatchObject({
      code: "parse_failed",
    });
  });
});
