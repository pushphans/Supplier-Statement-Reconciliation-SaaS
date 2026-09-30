import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { toCsv, type CsvColumn } from "@/lib/csv";
import { recordAudit } from "@/lib/audit";
import { logEvent, newRequestId } from "@/lib/log";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { MATCH_TYPE_LABELS } from "@/lib/format";

type ExportType = "matches" | "exceptions" | "summary" | "statement" | "ledger";

const EXCEPTION_TYPES = new Set<string>([
  "amount_mismatch",
  "missing_in_ledger",
  "missing_on_statement",
  "duplicate_statement",
  "duplicate_ledger",
]);

export async function GET(
  request: Request,
  context: RouteContext<"/api/reconciliations/[id]/export">,
) {
  const { id } = await context.params;

  const limited = checkRateLimit(`export:${clientIp(request.headers)}`, {
    limit: 60,
    windowMs: 60 * 1000,
  });
  if (!limited.ok) {
    return new NextResponse("Too many requests", {
      status: 429,
      headers: { "Retry-After": String(limited.retryAfterSec) },
    });
  }

  let ctx;
  try {
    ctx = await requireOrg();
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const supabase = await createClient();
  const { data: recon } = await supabase
    .from("reconciliations")
    .select("id, organization_id, status, currency, statement_total, ledger_total, total_difference, period_start, period_end, suppliers(name)")
    .eq("id", id)
    .maybeSingle();

  if (!recon || recon.organization_id !== ctx.organization.id) {
    return new NextResponse("Not found", { status: 404 });
  }

  const url = new URL(request.url);
  const type = (url.searchParams.get("type") ?? "matches") as ExportType;
  if (!["matches", "exceptions", "summary", "statement", "ledger"].includes(type)) {
    return new NextResponse("Invalid export type", { status: 400 });
  }

  const supplierName =
    (recon.suppliers as unknown as { name?: string } | null)?.name ?? "supplier";
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `${supplierName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${id.slice(0, 8)}-${type}-${stamp}`;

  let csv = "";
  let filename = `${base}.csv`;

  if (type === "summary") {
    const { data: matches } = await supabase
      .from("reconciliation_matches")
      .select("match_type, user_confirmed, difference_amount")
      .eq("reconciliation_id", id);

    const counts: Record<string, number> = {};
    for (const m of matches ?? []) {
      const key = `${m.match_type}${m.match_type === "probable_match" && m.user_confirmed ? "_confirmed" : ""}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }

    type SummaryRow = { metric: string; value: string };
    const rows: SummaryRow[] = [
      { metric: "organization", value: ctx.organization.name },
      { metric: "supplier", value: supplierName },
      { metric: "status", value: recon.status },
      { metric: "currency", value: recon.currency },
      { metric: "period_start", value: recon.period_start ?? "" },
      { metric: "period_end", value: recon.period_end ?? "" },
      { metric: "statement_total", value: String(recon.statement_total ?? "") },
      { metric: "ledger_total", value: String(recon.ledger_total ?? "") },
      { metric: "total_difference", value: String(recon.total_difference ?? "") },
      ...Object.entries(counts).map(([k, v]) => ({ metric: `count_${k}`, value: String(v) })),
    ];

    const cols: CsvColumn<SummaryRow>[] = [
      { header: "Metric", value: (r) => r.metric, kind: "text" },
      { header: "Value", value: (r) => r.value, kind: "text" },
    ];
    csv = toCsv(cols, rows);
  } else if (type === "statement" || type === "ledger") {
    const datasetType = type === "statement" ? "supplier_statement" : "ap_ledger";
    const { data: ds } = await supabase
      .from("source_datasets")
      .select("id")
      .eq("reconciliation_id", id)
      .eq("type", datasetType)
      .maybeSingle();

    if (!ds) {
      return new NextResponse("Dataset not uploaded", { status: 404 });
    }

    const { data: txns } = await supabase
      .from("source_transactions")
      .select(
        "source_row_number, raw_reference, normalized_reference, transaction_date, amount, currency, transaction_type, raw_data",
      )
      .eq("dataset_id", ds.id)
      .order("source_row_number");

    type TxnRow = {
      source_row_number: number;
      raw_reference: string;
      normalized_reference: string;
      transaction_date: string | null;
      amount: string | number;
      currency: string | null;
      transaction_type: string;
      raw_data: Record<string, string>;
    };
    // Union of raw_data keys across rows (cap at 40 columns).
    const rawKeys: string[] = [];
    for (const t of txns ?? []) {
      const raw = (t.raw_data ?? {}) as Record<string, string>;
      for (const k of Object.keys(raw)) {
        if (!rawKeys.includes(k) && rawKeys.length < 40) rawKeys.push(k);
      }
    }

    const cols: CsvColumn<TxnRow>[] = [
      { header: "Row", value: (r) => r.source_row_number, kind: "amount" },
      { header: "Raw reference", value: (r) => r.raw_reference, kind: "text" },
      { header: "Normalized reference", value: (r) => r.normalized_reference, kind: "text" },
      { header: "Date", value: (r) => r.transaction_date ?? "", kind: "text" },
      { header: "Amount", value: (r) => r.amount, kind: "amount" },
      { header: "Currency", value: (r) => r.currency ?? "", kind: "text" },
      { header: "Type", value: (r) => r.transaction_type, kind: "text" },
      ...rawKeys.map((k) => ({
        header: `Raw: ${k}`,
        value: (r: TxnRow) => r.raw_data?.[k] ?? "",
        kind: "text" as const,
      })),
    ];
    csv = toCsv(cols, (txns ?? []) as unknown as TxnRow[]);
    filename = `${supplierName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${type}-${stamp}.csv`;
  } else {
    // matches | exceptions
    const { data: matches } = await supabase
      .from("reconciliation_matches")
      .select(
        `id, match_type, confidence_score, reason, difference_amount, user_confirmed,
         statement:source_transactions!reconciliation_matches_statement_transaction_id_fkey (
           source_row_number, raw_reference, normalized_reference, transaction_date, amount, currency
         ),
         ledger:source_transactions!reconciliation_matches_ledger_transaction_id_fkey (
           source_row_number, raw_reference, normalized_reference, transaction_date, amount, currency
         ),
         exception_resolutions(status, note)`,
      )
      .eq("reconciliation_id", id)
      .order("match_type");

    type Flat = {
      match_type: string;
      type_label: string;
      confidence: string;
      reason: string;
      difference: string;
      user_confirmed: string;
      statement_row: string;
      statement_ref: string;
      statement_norm_ref: string;
      statement_date: string;
      statement_amount: string;
      ledger_row: string;
      ledger_ref: string;
      ledger_norm_ref: string;
      ledger_date: string;
      ledger_amount: string;
      resolution_status: string;
      resolution_note: string;
    };

    type TxnPart = {
      source_row_number?: number;
      raw_reference?: string;
      normalized_reference?: string;
      transaction_date?: string | null;
      amount?: number | string;
    } | null;

    const flat: Flat[] = [];
    for (const rawM of (matches ?? []) as Record<string, unknown>[]) {
      const m = rawM as {
        match_type: string;
        confidence_score: number | string | null;
        reason: string | null;
        difference_amount: number | string | null;
        user_confirmed: boolean;
        statement: TxnPart | TxnPart[];
        ledger: TxnPart | TxnPart[];
        exception_resolutions: { status?: string; note?: string | null } | { status?: string; note?: string | null }[] | null;
      };
      if (type === "exceptions") {
        const isProbablePending = m.match_type === "probable_match" && !m.user_confirmed;
        if (!EXCEPTION_TYPES.has(m.match_type) && !isProbablePending) continue;
      }
      const s = Array.isArray(m.statement) ? (m.statement[0] ?? null) : m.statement;
      const l = Array.isArray(m.ledger) ? (m.ledger[0] ?? null) : m.ledger;
      const resRaw = m.exception_resolutions;
      const res = Array.isArray(resRaw) ? (resRaw[0] ?? null) : resRaw;
      flat.push({
        match_type: m.match_type,
        type_label: MATCH_TYPE_LABELS[m.match_type] ?? m.match_type,
        confidence: m.confidence_score != null ? String(m.confidence_score) : "",
        reason: m.reason ?? "",
        difference: m.difference_amount != null ? String(m.difference_amount) : "",
        user_confirmed: m.user_confirmed ? "yes" : "no",
        statement_row: s?.source_row_number != null ? String(s.source_row_number) : "",
        statement_ref: s?.raw_reference ?? "",
        statement_norm_ref: s?.normalized_reference ?? "",
        statement_date: s?.transaction_date ?? "",
        statement_amount: s?.amount != null ? String(s.amount) : "",
        ledger_row: l?.source_row_number != null ? String(l.source_row_number) : "",
        ledger_ref: l?.raw_reference ?? "",
        ledger_norm_ref: l?.normalized_reference ?? "",
        ledger_date: l?.transaction_date ?? "",
        ledger_amount: l?.amount != null ? String(l.amount) : "",
        resolution_status: res?.status ?? "",
        resolution_note: res?.note ?? "",
      });
    }

    const cols: CsvColumn<Flat>[] = [
      { header: "Match type", value: (r) => r.type_label, kind: "text" },
      { header: "Match type (code)", value: (r) => r.match_type, kind: "text" },
      { header: "Confidence", value: (r) => r.confidence, kind: "text" },
      { header: "User confirmed", value: (r) => r.user_confirmed, kind: "text" },
      { header: "Reason", value: (r) => r.reason, kind: "text" },
      { header: "Difference", value: (r) => r.difference, kind: "amount" },
      { header: "Statement row", value: (r) => r.statement_row, kind: "amount" },
      { header: "Statement ref", value: (r) => r.statement_ref, kind: "text" },
      { header: "Statement normalized ref", value: (r) => r.statement_norm_ref, kind: "text" },
      { header: "Statement date", value: (r) => r.statement_date, kind: "text" },
      { header: "Statement amount", value: (r) => r.statement_amount, kind: "amount" },
      { header: "Ledger row", value: (r) => r.ledger_row, kind: "amount" },
      { header: "Ledger ref", value: (r) => r.ledger_ref, kind: "text" },
      { header: "Ledger normalized ref", value: (r) => r.ledger_norm_ref, kind: "text" },
      { header: "Ledger date", value: (r) => r.ledger_date, kind: "text" },
      { header: "Ledger amount", value: (r) => r.ledger_amount, kind: "amount" },
      { header: "Resolution", value: (r) => r.resolution_status, kind: "text" },
      { header: "Resolution note", value: (r) => r.resolution_note, kind: "text" },
    ];
    csv = toCsv(cols, flat);
  }

  await recordAudit(supabase, {
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    eventType: "data_exported",
    metadata: { reconciliation_id: id, export_type: type },
  });

  logEvent("info", "data_exported", {
    requestId: newRequestId(),
    organizationId: ctx.organization.id,
    reconciliationId: id,
    exportType: type,
  });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
