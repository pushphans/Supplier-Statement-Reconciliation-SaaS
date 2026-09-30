import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reconcile, type EngineTransaction, type EngineResult } from "@/lib/engine";
import type { DatasetPayload } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { logEvent, newRequestId } from "@/lib/log";

export type ActionOk<T = undefined> = { ok: true; data?: T };
export type ActionErr = { ok: false; error: string; fieldErrors?: Record<string, string[]> };
export type ActionResult<T = undefined> = ActionOk<T> | ActionErr;

function err(error: string, fieldErrors?: Record<string, string[]>): ActionErr {
  return { ok: false, error, fieldErrors };
}

const GENERIC = "Something went wrong. Please try again.";

/* ------------------------------------------------------------------ */
/* Dataset import                                                      */
/* ------------------------------------------------------------------ */

export async function saveDataset(
  supabase: SupabaseClient,
  ctx: { organizationId: string; userId: string },
  reconciliationId: string,
  payload: DatasetPayload,
): Promise<ActionResult<{ datasetId: string; rowCount: number }>> {
  const started = Date.now();
  const requestId = newRequestId();

  const { data: recon, error: reconErr } = await supabase
    .from("reconciliations")
    .select("id, organization_id, status, supplier_id")
    .eq("id", reconciliationId)
    .single();

  if (reconErr || !recon) return err("Reconciliation not found.");
  if (recon.organization_id !== ctx.organizationId) return err("Not authorized.");
  if (recon.status === "completed") return err("Completed reconciliations cannot be modified.");

  // Replace any existing dataset of this type (re-upload).
  const { data: existing } = await supabase
    .from("source_datasets")
    .select("id")
    .eq("reconciliation_id", reconciliationId)
    .eq("type", payload.type)
    .maybeSingle();

  if (existing) {
    await supabase.from("source_transactions").delete().eq("dataset_id", existing.id);
    await supabase.from("source_datasets").delete().eq("id", existing.id);
  }

  const mappingSnapshot = {
    mapping: payload.mapping,
    normalization_options: payload.normalization_options,
  };

  const { data: dataset, error: dsErr } = await supabase
    .from("source_datasets")
    .insert({
      organization_id: ctx.organizationId,
      reconciliation_id: reconciliationId,
      type: payload.type,
      original_filename: payload.original_filename,
      row_count: payload.transactions.length,
      mapping_snapshot: mappingSnapshot,
    })
    .select("id")
    .single();

  if (dsErr || !dataset) return err(GENERIC);

  const rows = payload.transactions.map((t) => ({
    organization_id: ctx.organizationId,
    reconciliation_id: reconciliationId,
    dataset_id: dataset.id,
    source_row_number: t.rowNumber,
    raw_reference: t.rawReference,
    normalized_reference: t.normalizedReference,
    transaction_date: t.transactionDate,
    amount: t.amount,
    currency: t.currency ?? payload.normalization_options.defaultCurrency ?? null,
    transaction_type: t.transactionType,
    raw_data: t.rawData,
  }));

  // Chunked inserts keep payloads manageable.
  const CHUNK = 1000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from("source_transactions").insert(chunk);
    if (error) {
      await supabase.from("source_datasets").delete().eq("id", dataset.id);
      return err(`Failed to save transactions: ${error.message}`);
    }
  }

  if (payload.save_profile && payload.profile_name?.trim()) {
    await supabase.from("mapping_profiles").insert({
      organization_id: ctx.organizationId,
      supplier_id: recon.supplier_id,
      source_type: payload.type === "supplier_statement" ? "statement" : "ledger",
      name: payload.profile_name.trim(),
      mapping: payload.mapping,
      normalization_options: payload.normalization_options,
    });
  }

  await recordAudit(supabase, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    eventType: "dataset_imported",
    metadata: {
      reconciliation_id: reconciliationId,
      dataset_type: payload.type,
      row_count: payload.transactions.length,
      filename: payload.original_filename.slice(0, 200),
    },
  });

  logEvent("info", "dataset_imported", {
    requestId,
    organizationId: ctx.organizationId,
    reconciliationId,
    durationMs: Date.now() - started,
    counts: { rows: payload.transactions.length },
    datasetType: payload.type,
  });

  return { ok: true, data: { datasetId: dataset.id, rowCount: payload.transactions.length } };
}

/* ------------------------------------------------------------------ */
/* Run reconciliation                                                  */
/* ------------------------------------------------------------------ */

export async function runReconciliation(
  supabase: SupabaseClient,
  ctx: { organizationId: string; userId: string },
  reconciliationId: string,
): Promise<ActionResult<{ summary: EngineResult["summary"]; matchCount: number }>> {
  const started = Date.now();
  const requestId = newRequestId();

  const { data: recon } = await supabase
    .from("reconciliations")
    .select("id, organization_id, status")
    .eq("id", reconciliationId)
    .single();

  if (!recon || recon.organization_id !== ctx.organizationId) {
    return err("Reconciliation not found.");
  }
  if (recon.status === "completed") return err("Completed reconciliations cannot be re-run.");

  const [sDs, lDs] = await Promise.all([
    supabase
      .from("source_datasets")
      .select("id")
      .eq("reconciliation_id", reconciliationId)
      .eq("type", "supplier_statement")
      .maybeSingle(),
    supabase
      .from("source_datasets")
      .select("id")
      .eq("reconciliation_id", reconciliationId)
      .eq("type", "ap_ledger")
      .maybeSingle(),
  ]);

  if (!sDs.data) return err("Supplier statement has not been uploaded yet.");
  if (!lDs.data) return err("AP ledger has not been uploaded yet.");

  const { data: txns, error: txnErr } = await supabase
    .from("source_transactions")
    .select(
      "id, dataset_id, source_row_number, raw_reference, normalized_reference, transaction_date, amount, currency, transaction_type",
    )
    .eq("reconciliation_id", reconciliationId);

  if (txnErr || !txns) return err(GENERIC);

  const datasetType = new Map<string, "statement" | "ledger">();
  datasetType.set(sDs.data.id, "statement");
  datasetType.set(lDs.data.id, "ledger");

  const statement: EngineTransaction[] = [];
  const ledger: EngineTransaction[] = [];
  for (const t of txns) {
    const side = datasetType.get(t.dataset_id);
    if (!side) continue;
    const item: EngineTransaction = {
      id: t.id,
      side,
      rowNumber: t.source_row_number,
      rawReference: t.raw_reference,
      normalizedReference: t.normalized_reference,
      transactionDate: t.transaction_date,
      amount: String(t.amount),
      currency: t.currency,
      transactionType: t.transaction_type as EngineTransaction["transactionType"],
    };
    if (side === "statement") statement.push(item);
    else ledger.push(item);
  }

  let result: EngineResult;
  try {
    result = reconcile(statement, ledger, {
      amountTolerance: "0",
      dateWindowDays: 30,
    });
  } catch (e) {
    logEvent("error", "reconciliation_run_failed", {
      requestId,
      organizationId: ctx.organizationId,
      reconciliationId,
      durationMs: Date.now() - started,
      code: "engine_failed",
    });
    return err(`Matching engine failed: ${e instanceof Error ? e.message : "unknown error"}`);
  }

  // Reset previous results (re-run support). Resolutions cascade-delete with matches.
  await supabase.from("reconciliation_matches").delete().eq("reconciliation_id", reconciliationId);

  const matchRows = result.matches.map((m) => ({
    organization_id: ctx.organizationId,
    reconciliation_id: reconciliationId,
    statement_transaction_id: m.statementTransactionId,
    ledger_transaction_id: m.ledgerTransactionId,
    match_type: m.matchType,
    confidence_score: m.confidenceScore,
    reason: m.reason,
    difference_amount: m.differenceAmount,
    user_confirmed: m.userConfirmed,
  }));

  const CHUNK = 1000;
  for (let i = 0; i < matchRows.length; i += CHUNK) {
    const { error } = await supabase.from("reconciliation_matches").insert(matchRows.slice(i, i + CHUNK));
    if (error) return err(`Failed to persist matches: ${error.message}`);
  }

  const { error: updErr } = await supabase
    .from("reconciliations")
    .update({
      status: "review",
      statement_total: result.summary.statementTotal,
      ledger_total: result.summary.ledgerTotal,
      total_difference: result.summary.difference,
    })
    .eq("id", reconciliationId);
  if (updErr) return err(GENERIC);

  await recordAudit(supabase, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    eventType: "reconciliation_run",
    metadata: {
      reconciliation_id: reconciliationId,
      statement_count: result.summary.statementCount,
      ledger_count: result.summary.ledgerCount,
      match_count: result.matches.length,
      exact_matches: result.summary.counts.exactMatch,
      duration_ms: Date.now() - started,
    },
  });

  logEvent("info", "reconciliation_run", {
    requestId,
    organizationId: ctx.organizationId,
    reconciliationId,
    durationMs: Date.now() - started,
    counts: {
      statement: result.summary.statementCount,
      ledger: result.summary.ledgerCount,
      matches: result.matches.length,
    },
  });

  return { ok: true, data: { summary: result.summary, matchCount: result.matches.length } };
}

/* ------------------------------------------------------------------ */
/* Probable match review                                               */
/* ------------------------------------------------------------------ */

export async function acceptProbableMatch(
  supabase: SupabaseClient,
  ctx: { organizationId: string; userId: string },
  matchId: string,
): Promise<ActionResult> {
  const { data: match } = await supabase
    .from("reconciliation_matches")
    .select("id, organization_id, match_type, reconciliation_id")
    .eq("id", matchId)
    .single();

  if (!match || match.organization_id !== ctx.organizationId) return err("Match not found.");
  if (match.match_type !== "probable_match") return err("Only probable matches can be accepted.");

  const { error } = await supabase
    .from("reconciliation_matches")
    .update({ user_confirmed: true, match_type: "probable_match" })
    .eq("id", matchId);
  if (error) return err(GENERIC);

  await recordAudit(supabase, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    eventType: "probable_match_reviewed",
    metadata: { match_id: matchId, action: "accepted", reconciliation_id: match.reconciliation_id },
  });

  logEvent("info", "probable_match_reviewed", {
    requestId: newRequestId(),
    organizationId: ctx.organizationId,
    reconciliationId: match.reconciliation_id,
    action: "accepted",
  });

  return { ok: true };
}

export async function rejectProbableMatch(
  supabase: SupabaseClient,
  ctx: { organizationId: string; userId: string },
  matchId: string,
): Promise<ActionResult> {
  const { data: match } = await supabase
    .from("reconciliation_matches")
    .select(
      "id, organization_id, match_type, reconciliation_id, statement_transaction_id, ledger_transaction_id",
    )
    .eq("id", matchId)
    .single();

  if (!match || match.organization_id !== ctx.organizationId) return err("Match not found.");
  if (match.match_type !== "probable_match") return err("Only probable matches can be rejected.");

  // Split back into unmatched one-sided rows.
  const { error } = await supabase
    .from("reconciliation_matches")
    .update({
      match_type: "missing_in_ledger",
      ledger_transaction_id: null,
      confidence_score: null,
      difference_amount: null,
      user_confirmed: false,
      reason: "Probable match rejected by user; no corresponding ledger entry accepted.",
    })
    .eq("id", matchId);
  if (error) return err(GENERIC);

  if (match.ledger_transaction_id) {
    const { error: insErr } = await supabase.from("reconciliation_matches").insert({
      organization_id: ctx.organizationId,
      reconciliation_id: match.reconciliation_id,
      statement_transaction_id: null,
      ledger_transaction_id: match.ledger_transaction_id,
      match_type: "missing_on_statement",
      user_confirmed: false,
      reason: "Probable match rejected by user; no corresponding statement entry accepted.",
    });
    if (insErr) return err(GENERIC);
  }

  await recordAudit(supabase, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    eventType: "probable_match_reviewed",
    metadata: { match_id: matchId, action: "rejected", reconciliation_id: match.reconciliation_id },
  });

  logEvent("info", "probable_match_reviewed", {
    requestId: newRequestId(),
    organizationId: ctx.organizationId,
    reconciliationId: match.reconciliation_id,
    action: "rejected",
  });

  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Manual match                                                        */
/* ------------------------------------------------------------------ */

export async function createManualMatch(
  supabase: SupabaseClient,
  ctx: { organizationId: string; userId: string },
  input: { statementTransactionId: string; ledgerTransactionId: string },
): Promise<ActionResult<{ matchId: string }>> {
  const { data: sTxn } = await supabase
    .from("source_transactions")
    .select("id, organization_id, reconciliation_id, amount, raw_reference")
    .eq("id", input.statementTransactionId)
    .single();
  const { data: lTxn } = await supabase
    .from("source_transactions")
    .select("id, organization_id, reconciliation_id, amount, raw_reference")
    .eq("id", input.ledgerTransactionId)
    .single();

  if (!sTxn || !lTxn) return err("Transaction not found.");
  if (sTxn.organization_id !== ctx.organizationId || lTxn.organization_id !== ctx.organizationId) {
    return err("Not authorized.");
  }
  if (sTxn.reconciliation_id !== lTxn.reconciliation_id) {
    return err("Both transactions must belong to the same reconciliation.");
  }

  const reconId = sTxn.reconciliation_id;

  // Ensure both rows are currently unmatched (not paired with different partners).
  const { data: existing } = await supabase
    .from("reconciliation_matches")
    .select("id, match_type, statement_transaction_id, ledger_transaction_id, user_confirmed")
    .eq("reconciliation_id", reconId)
    .or(
      `statement_transaction_id.eq.${input.statementTransactionId},ledger_transaction_id.eq.${input.ledgerTransactionId}`,
    );

  let replaceMatchId: string | null = null;
  if (existing && existing.length > 0) {
    for (const row of existing) {
      const touchesS = row.statement_transaction_id === input.statementTransactionId;
      const touchesL = row.ledger_transaction_id === input.ledgerTransactionId;
      if (touchesS && touchesL) {
        replaceMatchId = row.id;
        continue;
      }
      if (touchesS && row.ledger_transaction_id) {
        return err("Statement transaction is already matched to a different ledger row.");
      }
      if (touchesL && row.statement_transaction_id) {
        return err("Ledger transaction is already matched to a different statement row.");
      }
      // One-sided unmatched row — manual match supersedes it.
      await supabase.from("exception_resolutions").delete().eq("match_id", row.id);
      await supabase.from("reconciliation_matches").delete().eq("id", row.id);
    }
  }

  const sAmount = String(sTxn.amount);
  const lAmount = String(lTxn.amount);
  const { difference } = await import("@/lib/engine/amount");
  const diffStr = difference(sAmount, lAmount);
  const reason = `Manual match confirmed by user: statement "${sTxn.raw_reference}" (${sAmount}) with ledger "${lTxn.raw_reference}" (${lAmount})`;

  let resultingId: string;

  if (replaceMatchId) {
    const { data: updated, error } = await supabase
      .from("reconciliation_matches")
      .update({
        match_type: "manually_matched",
        user_confirmed: true,
        difference_amount: diffStr,
        confidence_score: null,
        reason,
      })
      .eq("id", replaceMatchId)
      .select("id")
      .single();
    if (error || !updated) return err(GENERIC);
    resultingId = updated.id;
  } else {
    const { data: created, error } = await supabase
      .from("reconciliation_matches")
      .insert({
        organization_id: ctx.organizationId,
        reconciliation_id: reconId,
        statement_transaction_id: input.statementTransactionId,
        ledger_transaction_id: input.ledgerTransactionId,
        match_type: "manually_matched",
        user_confirmed: true,
        difference_amount: diffStr,
        reason,
      })
      .select("id")
      .single();
    if (error || !created) return err(GENERIC);
    resultingId = created.id;
  }

  await recordAudit(supabase, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    eventType: "manual_match_created",
    metadata: {
      match_id: resultingId,
      statement_transaction_id: input.statementTransactionId,
      ledger_transaction_id: input.ledgerTransactionId,
      reconciliation_id: reconId,
    },
  });

  logEvent("info", "manual_match_created", {
    requestId: newRequestId(),
    organizationId: ctx.organizationId,
    reconciliationId: reconId,
  });

  return { ok: true, data: { matchId: resultingId } };
}

/* ------------------------------------------------------------------ */
/* Exception resolution                                                */
/* ------------------------------------------------------------------ */

export async function resolveException(
  supabase: SupabaseClient,
  ctx: { organizationId: string; userId: string },
  input: { matchId: string; status: "resolved" | "ignored" | "needs_investigation"; note: string },
): Promise<ActionResult> {
  const { data: match } = await supabase
    .from("reconciliation_matches")
    .select("id, organization_id, match_type")
    .eq("id", input.matchId)
    .single();

  if (!match || match.organization_id !== ctx.organizationId) return err("Match not found.");

  const { data: existing } = await supabase
    .from("exception_resolutions")
    .select("id")
    .eq("match_id", input.matchId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("exception_resolutions")
      .update({
        status: input.status,
        note: input.note || null,
        resolved_by: ctx.userId,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) return err(GENERIC);
  } else {
    const { error } = await supabase.from("exception_resolutions").insert({
      organization_id: ctx.organizationId,
      match_id: input.matchId,
      status: input.status,
      note: input.note || null,
      resolved_by: ctx.userId,
    });
    if (error) return err(GENERIC);
  }

  await recordAudit(supabase, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    eventType: "exception_resolved",
    metadata: { match_id: input.matchId, status: input.status },
  });

  logEvent("info", "exception_resolved", {
    requestId: newRequestId(),
    organizationId: ctx.organizationId,
    resolutionStatus: input.status,
  });

  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Completion                                                          */
/* ------------------------------------------------------------------ */

export async function completeReconciliation(
  supabase: SupabaseClient,
  ctx: { organizationId: string; userId: string },
  reconciliationId: string,
): Promise<ActionResult<{ unresolved: number }>> {
  const { data: recon } = await supabase
    .from("reconciliations")
    .select("id, organization_id, status")
    .eq("id", reconciliationId)
    .single();

  if (!recon || recon.organization_id !== ctx.organizationId) return err("Reconciliation not found.");
  if (recon.status === "completed") return err("Already completed.");

  const { counts } = await getExceptionCounts(supabase, reconciliationId);

  const { error } = await supabase
    .from("reconciliations")
    .update({
      status: "completed",
      completed_by: ctx.userId,
      completed_at: new Date().toISOString(),
    })
    .eq("id", reconciliationId);
  if (error) return err(GENERIC);

  await recordAudit(supabase, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    eventType: "reconciliation_completed",
    metadata: { reconciliation_id: reconciliationId, unresolved: counts.unresolved },
  });

  logEvent("info", "reconciliation_completed", {
    requestId: newRequestId(),
    organizationId: ctx.organizationId,
    reconciliationId,
    counts: { unresolved: counts.unresolved },
  });

  return { ok: true, data: { unresolved: counts.unresolved } };
}

export async function reopenReconciliation(
  supabase: SupabaseClient,
  ctx: { organizationId: string; userId: string },
  reconciliationId: string,
): Promise<ActionResult> {
  const { data: recon } = await supabase
    .from("reconciliations")
    .select("id, organization_id, status")
    .eq("id", reconciliationId)
    .single();

  if (!recon || recon.organization_id !== ctx.organizationId) return err("Reconciliation not found.");
  if (recon.status !== "completed") return err("Only completed reconciliations can be reopened.");

  const { error } = await supabase
    .from("reconciliations")
    .update({ status: "review", completed_by: null, completed_at: null })
    .eq("id", reconciliationId);
  if (error) return err(GENERIC);

  await recordAudit(supabase, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    eventType: "reconciliation_reopened",
    metadata: { reconciliation_id: reconciliationId },
  });

  logEvent("info", "reconciliation_reopened", {
    requestId: newRequestId(),
    organizationId: ctx.organizationId,
    reconciliationId,
  });

  return { ok: true };
}

export async function recordMappingReuse(
  supabase: SupabaseClient,
  ctx: { organizationId: string; userId: string },
  profileId: string,
): Promise<ActionResult<{ profileId: string }>> {
  const { data: profile } = await supabase
    .from("mapping_profiles")
    .select("id, organization_id, supplier_id, source_type, name")
    .eq("id", profileId)
    .maybeSingle();

  if (!profile || profile.organization_id !== ctx.organizationId) {
    return err("Mapping profile not found.");
  }

  await recordAudit(supabase, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    eventType: "mapping_profile_reused",
    metadata: {
      profile_id: profile.id,
      supplier_id: profile.supplier_id,
      source_type: profile.source_type,
      name: profile.name,
    },
  });

  return { ok: true, data: { profileId: profile.id } };
}

export async function getExceptionCounts(
  supabase: SupabaseClient,
  reconciliationId: string,
): Promise<{ counts: { exceptions: number; unresolved: number; resolved: number; ignored: number; probablePending: number } }> {
  const { data: matches } = await supabase
    .from("reconciliation_matches")
    .select("id, match_type, user_confirmed, exception_resolutions(status)")
    .eq("reconciliation_id", reconciliationId);

  let exceptions = 0;
  let unresolved = 0;
  let resolved = 0;
  let ignored = 0;
  let probablePending = 0;

  const exceptionTypes = new Set([
    "amount_mismatch",
    "missing_in_ledger",
    "missing_on_statement",
    "duplicate_statement",
    "duplicate_ledger",
  ]);

  for (const m of matches ?? []) {
    const resolution = ((m.exception_resolutions ?? null) as { status: string } | { status: string }[] | null) ?? null;
    const resolutionStatus = Array.isArray(resolution) ? (resolution[0]?.status ?? null) : (resolution?.status ?? null);
    const isException = exceptionTypes.has(m.match_type);
    const isPendingProbable = m.match_type === "probable_match" && !m.user_confirmed;

    if (isPendingProbable) {
      probablePending += 1;
      exceptions += 1;
      unresolved += 1;
      continue;
    }
    if (!isException) continue;
    exceptions += 1;
    if (resolutionStatus === "resolved") resolved += 1;
    else if (resolutionStatus === "ignored") ignored += 1;
    else unresolved += 1;
  }

  return { counts: { exceptions, unresolved, resolved, ignored, probablePending } };
}
