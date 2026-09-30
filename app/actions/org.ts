"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, getMembership } from "@/lib/dal";
import { recordAudit } from "@/lib/audit";
import { organizationSchema, inviteSchema } from "@/lib/validation";
import type { ActionResult } from "@/lib/server/ops";

export type OrgFormState = {
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string[]>;
} | null;

export async function createOrganizationAction(
  _prev: OrgFormState,
  formData: FormData,
): Promise<OrgFormState> {
  const user = await requireUser();
  const existing = await getMembership();
  if (existing) redirect("/dashboard");

  const parsed = organizationSchema.safeParse({
    name: formData.get("name"),
    default_currency: (formData.get("default_currency") as string) || "USD",
    timezone: (formData.get("timezone") as string) || "UTC",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { error: "Please enter a valid organization name.", fieldErrors };
  }

  const supabase = await createClient();
  const { data: org, error } = await supabase
    .from("organizations")
    .insert({
      name: parsed.data.name,
      default_currency: parsed.data.default_currency,
      timezone: parsed.data.timezone,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !org) return { error: error?.message ?? "Could not create organization." };

  await recordAudit(supabase, {
    organizationId: org.id,
    actorUserId: user.id,
    eventType: "organization_created",
    metadata: { name: parsed.data.name },
  });
  await recordAudit(supabase, {
    organizationId: org.id,
    actorUserId: user.id,
    eventType: "signup_completed",
    metadata: {},
  });

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function acceptInviteAction(inviteId: string): Promise<ActionResult> {
  const user = await requireUser();
  const email = user.email?.toLowerCase();
  if (!email) return { ok: false, error: "No email on account." };

  const supabase = await createClient();
  const { data: invite } = await supabase
    .from("organization_invites")
    .select("id, organization_id, email, accepted_at")
    .eq("id", inviteId)
    .maybeSingle();

  if (!invite) return { ok: false, error: "Invite not found." };
  if (invite.email.toLowerCase() !== email) {
    return { ok: false, error: "This invite was sent to a different email address." };
  }
  if (invite.accepted_at) return { ok: false, error: "Invite already used." };

  // Membership insert needs owner RLS — use service role after verifying invite.
  const admin = createAdminClient();
  const { error: memErr } = await admin.from("organization_members").upsert(
    {
      organization_id: invite.organization_id,
      user_id: user.id,
      role: "member",
    },
    { onConflict: "organization_id,user_id", ignoreDuplicates: true },
  );
  if (memErr) return { ok: false, error: memErr.message };

  await admin
    .from("organization_invites")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id);

  await recordAudit(admin, {
    organizationId: invite.organization_id,
    actorUserId: user.id,
    eventType: "user_invite_accepted",
    metadata: { invite_id: invite.id },
  });

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function inviteMemberAction(
  _prev: OrgFormState,
  formData: FormData,
): Promise<OrgFormState> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .single();
  if (!membership || membership.role !== "owner") {
    return { error: "Only owners can invite members." };
  }

  const parsed = inviteSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "email");
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { error: "Enter a valid email address.", fieldErrors };
  }

  const email = parsed.data.email.toLowerCase();

  const { data: existingInvite } = await supabase
    .from("organization_invites")
    .select("id")
    .eq("organization_id", membership.organization_id)
    .ilike("email", email)
    .maybeSingle();
  if (existingInvite) return { error: "An invite for this email already exists." };

  const { error: insErr } = await supabase.from("organization_invites").insert({
    organization_id: membership.organization_id,
    email,
    role: "member",
    invited_by: user.id,
  });
  if (insErr) return { error: insErr.message };

  // Send the actual invite email (service role).
  try {
    const admin = createAdminClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${appUrl}/auth/callback?next=/onboarding`,
      data: { invited_org: membership.organization_id },
    });
  } catch {
    // Email provider may be unconfigured in local/dev — invite row still exists.
  }

  await recordAudit(supabase, {
    organizationId: membership.organization_id,
    actorUserId: user.id,
    eventType: "user_invited",
    metadata: { email },
  });

  return { message: `Invite created for ${email}.` };
}

export async function removeMemberAction(userId: string): Promise<ActionResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .single();
  if (!membership || membership.role !== "owner") {
    return { ok: false, error: "Only owners can remove members." };
  }
  if (userId === user.id) return { ok: false, error: "You cannot remove yourself." };

  const { count: ownerCount } = await supabase
    .from("organization_members")
    .select("user_id", { count: "exact", head: true })
    .eq("organization_id", membership.organization_id)
    .eq("role", "owner");
  const { data: target } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", membership.organization_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (target?.role === "owner" && (ownerCount ?? 0) <= 1) {
    return { ok: false, error: "Cannot remove the last owner." };
  }

  const { error } = await supabase
    .from("organization_members")
    .delete()
    .eq("organization_id", membership.organization_id)
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };

  await recordAudit(supabase, {
    organizationId: membership.organization_id,
    actorUserId: user.id,
    eventType: "user_removed",
    metadata: { removed_user_id: userId },
  });

  revalidatePath("/settings/team");
  return { ok: true };
}
