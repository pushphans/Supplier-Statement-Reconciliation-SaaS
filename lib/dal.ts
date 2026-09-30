import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type OrgRole = "owner" | "member";

export type OrgMembership = {
  organization_id: string;
  user_id: string;
  role: OrgRole;
};

export type OrgContext = {
  user: User;
  membership: OrgMembership;
  organization: {
    id: string;
    name: string;
    default_currency: string;
    timezone: string;
  };
  role: OrgRole;
};

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** First organization membership for the current user, if any. */
export const getMembership = cache(async (): Promise<OrgMembership | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_members")
    .select("organization_id, user_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);
  return (data?.[0] as OrgMembership | undefined) ?? null;
});

export async function requireOrg(): Promise<OrgContext> {
  const user = await requireUser();
  const membership = await getMembership();
  if (!membership) redirect("/onboarding");

  const supabase = await createClient();
  const { data: org, error } = await supabase
    .from("organizations")
    .select("id, name, default_currency, timezone")
    .eq("id", membership.organization_id)
    .single();
  if (error || !org) redirect("/onboarding");

  return {
    user,
    membership,
    organization: org,
    role: membership.role,
  };
}

export async function requireOwner(): Promise<OrgContext> {
  const ctx = await requireOrg();
  if (ctx.role !== "owner") redirect("/dashboard");
  return ctx;
}
