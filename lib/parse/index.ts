export type RawTable = {
  headers: string[];
  rows: string[][];
  filename: string;
  fileType: "csv" | "xlsx" | "pdf";
};

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_ROWS = 20000;

export type ParseErrorCode =
  | "too_large"
  | "unsupported_type"
  | "empty"
  | "too_many_rows"
  | "scanned_pdf"
  | "parse_failed";

export class ParseError extends Error {
  code: ParseErrorCode;
  constructor(code: ParseErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const ALLOWED = [
  { ext: ".csv", type: "csv" as const, mimes: ["text/csv", "application/csv", "text/plain", ""] },
  { ext: ".xlsx", type: "xlsx" as const, mimes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ""] },
  { ext: ".xls", type: "xlsx" as const, mimes: ["application/vnd.ms-excel", ""] },
  { ext: ".pdf", type: "pdf" as const, mimes: ["application/pdf", ""] },
];

export function validateFile(file: File): "csv" | "xlsx" | "pdf" {
  if (file.size > MAX_FILE_BYTES) {
    throw new ParseError("too_large", "File exceeds the 20 MB limit.");
  }
  const lower = file.name.toLowerCase();
  const hit = ALLOWED.find((a) => lower.endsWith(a.ext));
  if (!hit) {
    throw new ParseError(
      "unsupported_type",
      "Unsupported file type. Please upload CSV, XLSX, or a text-based PDF.",
    );
  }
  if (file.type && !hit.mimes.includes(file.type) && hit.mimes.some(Boolean)) {
    // MIME mismatch with allowed list — reject obvious mismatches (e.g. HTML renamed).
    if (file.type.includes("html") || file.type.includes("script")) {
      throw new ParseError("unsupported_type", "Unsupported MIME type.");
    }
  }
  return hit.type;
}

export async function parseFile(file: File): Promise<RawTable> {
  const kind = validateFile(file);
  if (kind === "csv") return parseCsvFile(file);
  if (kind === "xlsx") return parseXlsxFile(file);
  return parsePdfFile(file);
}

/* ------------------------------ CSV ------------------------------ */

export async function parseCsvFile(file: File): Promise<RawTable> {
  const Papa = (await import("papaparse")).default;
  const text = await file.text();
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: "greedy",
    delimitersToGuess: [",", ";", "\t", "|"],
  });

  const rows = (result.data as string[][]).map((r) =>
    r.map((c) => (c === null || c === undefined ? "" : String(c))),
  );
  const cleaned = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (cleaned.length === 0) throw new ParseError("empty", "File contains no rows.");
  if (cleaned.length - 1 > MAX_ROWS) {
    throw new ParseError("too_many_rows", `File exceeds ${MAX_ROWS.toLocaleString()} rows.`);
  }

  const headers = cleaned[0].map((h, i) => h.trim() || `Column ${i + 1}`);
  return { headers, rows: cleaned.slice(1), filename: file.name, fileType: "csv" };
}

/* ------------------------------ XLSX ----------------------------- */

export async function parseXlsxFile(file: File): Promise<RawTable> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true, cellNF: false, cellText: false });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new ParseError("empty", "Workbook has no sheets.");

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: "",
    blankrows: false,
  });

  const rows = aoa.map((r) =>
    (Array.isArray(r) ? r : []).map((c) => cellToString(c)),
  );
  const cleaned = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (cleaned.length === 0) throw new ParseError("empty", "Sheet contains no rows.");
  if (cleaned.length - 1 > MAX_ROWS) {
    throw new ParseError("too_many_rows", `File exceeds ${MAX_ROWS.toLocaleString()} rows.`);
  }

  const headers = cleaned[0].map((h, i) => h.trim() || `Column ${i + 1}`);
  return { headers, rows: cleaned.slice(1), filename: file.name, fileType: "xlsx" };
}

function cellToString(c: unknown): string {
  if (c === null || c === undefined) return "";
  if (c instanceof Date && !Number.isNaN(c.getTime())) {
    return c.toISOString().slice(0, 10);
  }
  if (typeof c === "number") {
    // Preserve full precision without float noise for money-like integers.
    return String(c);
  }
  if (typeof c === "boolean") return c ? "TRUE" : "FALSE";
  if (typeof c === "object") {
    // Formula cells expose .v via SheetJS when raw:true
    const obj = c as { v?: unknown; w?: unknown };
    if (obj.v !== undefined) return cellToString(obj.v);
    return String(c);
  }
  return String(c);
}

/* ------------------------------ PDF ------------------------------ */

export async function parsePdfFile(file: File): Promise<RawTable> {
  const pdfjs = await import("pdfjs-dist");

  let doc: { numPages: number; getPage: (p: number) => Promise<{ getTextContent: () => Promise<{ items: unknown[] }> }> };
  try {
    const loaded = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    doc = loaded as typeof doc;
  } catch {
    throw new ParseError("parse_failed", "Could not read this PDF. Try CSV or XLSX.");
  }

  const lines: string[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      type Item = { str?: string; transform?: number[]; hasEOL?: boolean };
      const items = content.items as Item[];

      let current = "";
      let lastY: number | null = null;
      for (const item of items) {
        const y = item.transform?.[5] ?? 0;
        const text = item.str ?? "";
        if (lastY !== null && Math.abs(y - lastY) > 2) {
          if (current.trim()) lines.push(current.trim());
          current = text;
        } else {
          current += text;
        }
        lastY = y;
        if (item.hasEOL) {
          if (current.trim()) lines.push(current.trim());
          current = "";
          lastY = null;
        }
      }
      if (current.trim()) lines.push(current.trim());
    }
  } catch (e) {
    if (e instanceof ParseError) throw e;
    throw new ParseError("parse_failed", "Could not read this PDF. Try CSV or XLSX.");
  }

  const meaningful = lines.filter((l) => l.length > 0);
  if (meaningful.length === 0) {
    throw new ParseError(
      "scanned_pdf",
      "This PDF appears to be scanned. Scanned-statement OCR is not supported yet. Please upload CSV/XLSX or a text-based PDF.",
    );
  }

  // Heuristic table detection: split each line into cells on 2+ spaces or
  // aligned numeric tokens.
  const cellRows = meaningful.map((line) =>
    line
      .split(/\s{2,}/)
      .map((c) => c.trim())
      .filter((c) => c !== ""),
  );

  // Header = first row with >= 2 cells that is not purely numeric.
  let headerIdx = cellRows.findIndex(
    (r, i) => r.length >= 2 && i < 30 && !r.every((c) => /^-?[\d.,]+$/.test(c)),
  );
  if (headerIdx === -1) headerIdx = 0;

  const headers = (cellRows[headerIdx] ?? []).map((h, i) => h || `Column ${i + 1}`);
  const rows = cellRows.slice(headerIdx + 1).filter((r) => r.some((c) => c !== ""));

  if (rows.length === 0) throw new ParseError("empty", "No data rows found in PDF.");
  if (rows.length > MAX_ROWS) {
    throw new ParseError("too_many_rows", `File exceeds ${MAX_ROWS.toLocaleString()} rows.`);
  }

  // Normalize row widths to header width.
  const width = Math.max(headers.length, ...rows.map((r) => r.length));
  while (headers.length < width) headers.push(`Column ${headers.length + 1}`);
  const normRows = rows.map((r) => {
    const copy = [...r];
    while (copy.length < width) copy.push("");
    return copy.slice(0, width);
  });

  return { headers, rows: normRows, filename: file.name, fileType: "pdf" };
}
