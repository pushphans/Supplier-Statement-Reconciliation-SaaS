import { requireOrg } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { InviteForm, MemberRow } from "@/components/settings/team";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  Th,
} from "@/components/ui";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const ctx = await requireOrg();
  const supabase = await createClient();

  const { data: members } = await supabase
    .from("organization_members")
    .select("user_id, role")
    .eq("organization_id", ctx.organization.id)
    .order("role", { ascending: false });

  const userIds = (members ?? []).map((m) => m.user_id);
  const profileMap = new Map<string, { full_name: string | null; email: string | null }>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);
    for (const p of profiles ?? []) {
      profileMap.set(p.id, { full_name: p.full_name, email: null });
    }
    // Emails via admin API are not available here; show name only when email missing.
    // Supabase profiles don't include email — fetch auth users is owner-limited.
    // We display email only for invitees; members show name.
  }

  const { data: invites } = await supabase
    .from("organization_invites")
    .select("id, email, role, accepted_at, created_at")
    .eq("organization_id", ctx.organization.id)
    .order("created_at", { ascending: false });

  const { data: authProfiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", userIds);

  const nameById = new Map((authProfiles ?? []).map((p) => [p.id, p.full_name]));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>Everyone with access to this workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {(members ?? []).map((m) => (
                <MemberRow
                  key={m.user_id}
                  member={{
                    user_id: m.user_id,
                    role: m.role,
                    full_name: nameById.get(m.user_id) ?? profileMap.get(m.user_id)?.full_name ?? null,
                    email: profileMap.get(m.user_id)?.email ?? null,
                  }}
                  isSelf={m.user_id === ctx.user.id}
                  canRemove={ctx.role === "owner" && m.user_id !== ctx.user.id}
                />
              ))}
            </tbody>
          </Table>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Invite a teammate</CardTitle>
            <CardDescription>Owner only · members join with standard access.</CardDescription>
          </CardHeader>
          <CardContent>
            {ctx.role === "owner" ? (
              <InviteForm />
            ) : (
              <p className="text-sm text-zinc-500">Only owners can invite members.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pending invites</CardTitle>
          </CardHeader>
          <CardContent>
            {(invites ?? []).filter((i) => !i.accepted_at).length === 0 ? (
              <p className="text-sm text-zinc-500">No pending invites.</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {(invites ?? [])
                  .filter((i) => !i.accepted_at)
                  .map((i) => (
                    <li key={i.id} className="flex items-center justify-between py-2">
                      <span className="text-sm text-zinc-800">{i.email}</span>
                      <span className="text-[11px] text-zinc-500">
                        sent {new Date(i.created_at).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
