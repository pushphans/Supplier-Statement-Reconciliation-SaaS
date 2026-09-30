"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg, requireOwner } from "@/lib/dal";
import { supplierSchema, organizationSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import type { ActionResult } from "@/lib/server/ops";

export type SupplierFormState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
} | null;

export async function createSupplierAction(
  _prev: SupplierFormState,
  formData: FormData,
): Promise<SupplierFormState> {
  const ctx = await requireOrg();
  const parsed = supplierSchema.safeParse({
    name: formData.get("name"),
    supplier_code: ((formData.get("supplier_code") as string) ?? "").trim(),
    default_currency: (formData.get("default_currency") as string) || ctx.organization.default_currency,
    notes: ((formData.get("notes") as string) ?? "").trim(),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { error: "Please enter a valid supplier name.", fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("suppliers").insert({
    organization_id: ctx.organization.id,
    name: parsed.data.name,
    supplier_code: parsed.data.supplier_code || null,
    default_currency: parsed.data.default_currency,
    notes: parsed.data.notes || null,
  });

  if (error) {
    if (error.code === "23505") return { error: "A supplier with this code already exists." };
    return { error: error.message };
  }

  await recordAudit(supabase, {
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    eventType: "supplier_created",
    metadata: { name: parsed.data.name },
  });

  revalidatePath("/suppliers");
  return null;
}

export async function updateSupplierAction(
  supplierId: string,
  _prev: SupplierFormState,
  formData: FormData,
): Promise<SupplierFormState> {
  const ctx = await requireOrg();
  const parsed = supplierSchema.safeParse({
    name: formData.get("name"),
    supplier_code: ((formData.get("supplier_code") as string) ?? "").trim(),
    default_currency: (formData.get("default_currency") as string) || "USD",
    notes: ((formData.get("notes") as string) ?? "").trim(),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { error: "Please enter a valid supplier name.", fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update({
      name: parsed.data.name,
      supplier_code: parsed.data.supplier_code || null,
      default_currency: parsed.data.default_currency,
      notes: parsed.data.notes || null,
    })
    .eq("id", supplierId)
    .eq("organization_id", ctx.organization.id);

  if (error) return { error: error.message };

  await recordAudit(supabase, {
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    eventType: "supplier_updated",
    metadata: { supplier_id: supplierId },
  });

  revalidatePath("/suppliers");
  return null;
}

export async function deleteSupplierAction(supplierId: string): Promise<ActionResult> {
  const ctx = await requireOrg();
  const supabase = await createClient();

  const { count } = await supabase
    .from("reconciliations")
    .select("id", { count: "exact", head: true })
    .eq("supplier_id", supplierId);

  if ((count ?? 0) > 0) {
    return { ok: false, error: "Supplier has reconciliations and cannot be deleted." };
  }

  const { error } = await supabase
    .from("suppliers")
    .delete()
    .eq("id", supplierId)
    .eq("organization_id", ctx.organization.id);
  if (error) return { ok: false, error: error.message };

  await recordAudit(supabase, {
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    eventType: "supplier_deleted",
    metadata: { supplier_id: supplierId },
  });

  revalidatePath("/suppliers");
  return { ok: true };
}

export async function updateOrganizationAction(
  _prev: SupplierFormState,
  formData: FormData,
): Promise<SupplierFormState> {
  const ctx = await requireOwner();
  const parsed = organizationSchema.safeParse({
    name: formData.get("name"),
    default_currency: formData.get("default_currency"),
    timezone: formData.get("timezone"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { error: "Invalid organization settings.", fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update(parsed.data)
    .eq("id", ctx.organization.id);
  if (error) return { error: error.message };

  await recordAudit(supabase, {
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    eventType: "organization_updated",
    metadata: {},
  });

  revalidatePath("/settings/organization");
  return null;
}
