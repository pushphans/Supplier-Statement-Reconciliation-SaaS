import { requireOrg } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import {
  OrganizationForm,
  ProfileForm,
} from "@/components/settings/organization-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";

export const metadata = { title: "Organization settings" };

export default async function OrganizationSettingsPage() {
  const ctx = await requireOrg();
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", ctx.user.id)
    .maybeSingle();

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
          <CardDescription>Applies to all members. Owner only.</CardDescription>
        </CardHeader>
        <CardContent>
          <OrganizationForm org={ctx.organization} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your profile</CardTitle>
          <CardDescription>Shown in the app header and audit trail.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm fullName={profile?.full_name ?? (ctx.user.user_metadata?.full_name as string) ?? ""} />
        </CardContent>
      </Card>
    </div>
  );
}
