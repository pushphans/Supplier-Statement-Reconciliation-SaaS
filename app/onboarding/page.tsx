import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getMembership } from "@/lib/dal";
import { OnboardingForms } from "@/components/onboarding/onboarding-form";

export const metadata = { title: "Set up your workspace" };

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const membership = await getMembership();
  if (membership) redirect("/dashboard");

  const supabase = await createClient();
  const email = user.email?.toLowerCase() ?? "";

  const { data: invites } = await supabase
    .from("organization_invites")
    .select("id, email, organizations(name)")
    .eq("email", email)
    .is("accepted_at", null);

  const mapped =
    invites?.map((i) => ({
      id: i.id,
      email: i.email,
      orgName:
        (i.organizations as unknown as { name?: string } | null)?.name ?? undefined,
    })) ?? [];

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-12">
      <h1 className="text-xl font-semibold text-zinc-900">Welcome{user.user_metadata?.full_name ? `, ${user.user_metadata.full_name}` : ""}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Create your organization to start reconciling supplier statements.
      </p>
      <div className="mt-6">
        <OnboardingForms invites={mapped} />
      </div>
    </div>
  );
}
