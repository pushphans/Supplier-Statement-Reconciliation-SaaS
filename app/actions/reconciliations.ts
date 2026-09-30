"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/dal";
import { createReconciliationSchema, datasetPayloadSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { checkRateLimit, rateLimitError } from "@/lib/rate-limit";
import {
  saveDataset,
  runReconciliation,
  completeReconciliation,
  reopenReconciliation,
  recordMappingReuse,
  type ActionResult,
} from "@/lib/server/ops";

export type CreateReconState = {
  error?: string;
  id?: string;
  fieldErrors?: Record<string, string[]>;
} | null;

export async function createReconciliationAction(
  _prev: CreateReconState,
  formData: FormData,
): Promise<CreateReconState> {
  const ctx = await requireOrg();

  const parsed = createReconciliationSchema.safeParse({
    supplier_id: formData.get("supplier_id"),
    period_start: ((formData.get("period_start") as string) ?? "").trim(),
    period_end: ((formData.get("period_end") as string) ?? "").trim(),
    currency:
      ((formData.get("currency") as string) ?? "").trim() ||
      ctx.organization.default_currency,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { error: "Select a supplier and provide a valid period.", fieldErrors };
  }

  const supabase = await createClient();

  const { data: supplier } = await supabase
    .from("suppliers")
    .select("id, organization_id")
    .eq("id", parsed.data.supplier_id)
    .maybeSingle();
  if (!supplier || supplier.organization_id !== ctx.organization.id) {
    return { error: "Supplier not found." };
  }

  const { data: recon, error } = await supabase
    .from("reconciliations")
    .insert({
      organization_id: ctx.organization.id,
      supplier_id: parsed.data.supplier_id,
      period_start: parsed.data.period_start || null,
      period_end: parsed.data.period_end || null,
      currency: parsed.data.currency,
      status: "draft",
      created_by: ctx.user.id,
    })
    .select("id")
    .single();

  if (error || !recon) return { error: error?.message ?? "Could not create reconciliation." };

  await recordAudit(supabase, {
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    eventType: "reconciliation_started",
    metadata: {
      reconciliation_id: recon.id,
      supplier_id: parsed.data.supplier_id,
      period_start: parsed.data.period_start,
      period_end: parsed.data.period_end,
    },
  });

  revalidatePath("/reconciliations");
  redirect(`/reconciliations/${recon.id}/setup`);
}

export async function saveDatasetAction(
  reconciliationId: string,
  json: string,
): Promise<ActionResult<{ datasetId: string; rowCount: number }>> {
  const ctx = await requireOrg();

  let payloadRaw: unknown;
  try {
    payloadRaw = JSON.parse(json);
  } catch {
    return { ok: false, error: "Invalid payload." };
  }

  const parsed = datasetPayloadSchema.safeParse(payloadRaw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid dataset.",
      fieldErrors,
    };
  }

  if (parsed.data.transactions.length > 20000) {
    return { ok: false, error: "Row limit is 20,000 transactions per file in the MVP." };
  }

  return saveDataset(
    await createClient(),
    { organizationId: ctx.organization.id, userId: ctx.user.id },
    reconciliationId,
    parsed.data,
  );
}

export async function runReconciliationAction(
  reconciliationId: string,
): Promise<ActionResult<{ matchCount: number }>> {
  const ctx = await requireOrg();
  // Matching runs are the most expensive op — bound per organization.
  const limited = checkRateLimit(`run:${ctx.organization.id}`, {
    limit: 30,
    windowMs: 10 * 60 * 1000,
  });
  if (!limited.ok) return { ok: false, error: rateLimitError(limited.retryAfterSec) };
  const result = await runReconciliation(
    await createClient(),
    { organizationId: ctx.organization.id, userId: ctx.user.id },
    reconciliationId,
  );
  if (result.ok) {
    revalidatePath(`/reconciliations/${reconciliationId}`);
    revalidatePath("/reconciliations");
    revalidatePath("/dashboard");
  }
  return result;
}

export async function completeReconciliationAction(
  reconciliationId: string,
): Promise<ActionResult<{ unresolved: number }>> {
  const ctx = await requireOrg();
  const result = await completeReconciliation(
    await createClient(),
    { organizationId: ctx.organization.id, userId: ctx.user.id },
    reconciliationId,
  );
  if (result.ok) {
    revalidatePath(`/reconciliations/${reconciliationId}`);
    revalidatePath("/reconciliations");
    revalidatePath("/dashboard");
  }
  return result;
}

export async function reopenReconciliationAction(reconciliationId: string): Promise<ActionResult> {
  const ctx = await requireOrg();
  const result = await reopenReconciliation(
    await createClient(),
    { organizationId: ctx.organization.id, userId: ctx.user.id },
    reconciliationId,
  );
  if (result.ok) {
    revalidatePath(`/reconciliations/${reconciliationId}`);
    revalidatePath("/reconciliations");
    revalidatePath("/dashboard");
  }
  return result;
}

export async function recordMappingReuseAction(
  profileId: string,
): Promise<ActionResult<{ profileId: string }>> {
  const ctx = await requireOrg();
  return recordMappingReuse(await createClient(), {
    organizationId: ctx.organization.id,
    userId: ctx.user.id,
  }, profileId);
}

export async function deleteReconciliationAction(reconciliationId: string): Promise<ActionResult> {
  const ctx = await requireOrg();
  const supabase = await createClient();

  const { data: recon } = await supabase
    .from("reconciliations")
    .select("id, organization_id")
    .eq("id", reconciliationId)
    .maybeSingle();
  if (!recon || recon.organization_id !== ctx.organization.id) {
    return { ok: false, error: "Not found." };
  }

  const { error } = await supabase.from("reconciliations").delete().eq("id", reconciliationId);
  if (error) return { ok: false, error: error.message };

  await recordAudit(supabase, {
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    eventType: "reconciliation_deleted",
    metadata: { reconciliation_id: reconciliationId },
  });

  revalidatePath("/reconciliations");
  revalidatePath("/dashboard");
  redirect("/reconciliations");
}
