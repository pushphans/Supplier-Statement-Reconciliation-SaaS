"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/dal";
import {
  acceptProbableMatch,
  rejectProbableMatch,
  createManualMatch,
  resolveException,
  type ActionResult,
} from "@/lib/server/ops";

async function requireMatchOrg(matchId: string) {
  const ctx = await requireOrg();
  const supabase = await createClient();
  const { data: match } = await supabase
    .from("reconciliation_matches")
    .select("id, organization_id, reconciliation_id")
    .eq("id", matchId)
    .maybeSingle();
  if (!match || match.organization_id !== ctx.organization.id) return null;
  return { ctx, supabase, match };
}

export async function acceptMatchAction(matchId: string): Promise<ActionResult> {
  const access = await requireMatchOrg(matchId);
  if (!access) return { ok: false, error: "Not found." };
  const result = await acceptProbableMatch(
    access.supabase,
    { organizationId: access.ctx.organization.id, userId: access.ctx.user.id },
    matchId,
  );
  if (result.ok) {
    revalidatePath(`/reconciliations/${access.match.reconciliation_id}`);
  }
  return result;
}

export async function rejectMatchAction(matchId: string): Promise<ActionResult> {
  const access = await requireMatchOrg(matchId);
  if (!access) return { ok: false, error: "Not found." };
  const result = await rejectProbableMatch(
    access.supabase,
    { organizationId: access.ctx.organization.id, userId: access.ctx.user.id },
    matchId,
  );
  if (result.ok) {
    revalidatePath(`/reconciliations/${access.match.reconciliation_id}`);
  }
  return result;
}

export async function manualMatchAction(
  statementTransactionId: string,
  ledgerTransactionId: string,
): Promise<ActionResult<{ matchId: string }>> {
  const ctx = await requireOrg();
  const result = await createManualMatch(
    await createClient(),
    { organizationId: ctx.organization.id, userId: ctx.user.id },
    { statementTransactionId, ledgerTransactionId },
  );
  if (result.ok) revalidatePath("/reconciliations");
  return result;
}

export async function resolveExceptionAction(input: {
  matchId: string;
  status: "resolved" | "ignored" | "needs_investigation";
  note?: string;
}): Promise<ActionResult> {
  const access = await requireMatchOrg(input.matchId);
  if (!access) return { ok: false, error: "Not found." };

  const result = await resolveException(
    access.supabase,
    { organizationId: access.ctx.organization.id, userId: access.ctx.user.id },
    { matchId: input.matchId, status: input.status, note: input.note ?? "" },
  );
  if (result.ok) {
    revalidatePath(`/reconciliations/${access.match.reconciliation_id}`);
  }
  return result;
}
