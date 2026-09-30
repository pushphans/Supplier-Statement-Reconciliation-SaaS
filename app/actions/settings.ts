"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg, requireOwner } from "@/lib/dal";
import { recordAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/server/ops";

export type SettingsFormState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
} | null;

export async function updateProfileAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const fullName = String(formData.get("full_name") ?? "").trim();
  if (fullName.length < 2) {
    return {
      error: "Name is too short.",
      fieldErrors: { full_name: ["Name must be at least 2 characters."] },
    };
  }

  const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", user.id);
  if (error) return { error: error.message };

  await supabase.auth.updateUser({ data: { full_name: fullName } });

  const ctx = await requireOrg().catch(() => null);
  if (ctx) {
    await recordAudit(supabase, {
      organizationId: ctx.organization.id,
      actorUserId: user.id,
      eventType: "profile_updated",
      metadata: {},
    });
  }

  revalidatePath("/settings/organization");
  return null;
}

export async function saveMappingProfileAction(input: {
  reconciliationId: string;
  sourceType: "statement" | "ledger";
  name: string;
  mapping: Record<string, string>;
  normalizationOptions: Record<string, unknown>;
}): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireOrg();
  const supabase = await createClient();
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Profile name is required." };

  const { data: recon } = await supabase
    .from("reconciliations")
    .select("id, supplier_id, organization_id")
    .eq("id", input.reconciliationId)
    .maybeSingle();
  if (!recon || recon.organization_id !== ctx.organization.id) {
    return { ok: false, error: "Reconciliation not found." };
  }

  const { data, error } = await supabase
    .from("mapping_profiles")
    .insert({
      organization_id: ctx.organization.id,
      supplier_id: recon.supplier_id,
      source_type: input.sourceType,
      name,
      mapping: input.mapping,
      normalization_options: input.normalizationOptions,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Failed to save profile." };

  await recordAudit(supabase, {
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    eventType: "mapping_profile_saved",
    metadata: { name, source_type: input.sourceType },
  });

  return { ok: true, data: { id: data.id } };
}

export async function deleteMappingProfileAction(profileId: string): Promise<ActionResult> {
  const ctx = await requireOrg();
  const supabase = await createClient();
  const { error } = await supabase
    .from("mapping_profiles")
    .delete()
    .eq("id", profileId)
    .eq("organization_id", ctx.organization.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/organization");
  return { ok: true };
}

export async function deleteAccountDataAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const ctx = await requireOwner();
  const confirmName = String(formData.get("confirm_name") ?? "").trim();
  if (confirmName !== ctx.organization.name) {
    return {
      error: "Type your organization name exactly to confirm.",
      fieldErrors: { confirm_name: ["Name does not match."] },
    };
  }

  const admin = createAdminClient();
  // purge_organization() wipes all workspace rows including append-only audit
  // history (service role only; ownership already verified via requireOwner).
  const { error } = await admin.rpc("purge_organization", {
    target_org: ctx.organization.id,
  });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/onboarding");
}
