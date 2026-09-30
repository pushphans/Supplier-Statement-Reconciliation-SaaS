import Link from "next/link";
import { requireOrg } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, statusBadgeClass, STATUS_LABELS } from "@/lib/format";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, Table, Td, Th, Tr } from "@/components/ui";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const ctx = await requireOrg();
  const supabase = await createClient();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [suppliersRes, monthRes, pendingRes, openRes] = await Promise.all([
    supabase.from("suppliers").select("id", { count: "exact", head: true }),
    supabase
      .from("reconciliations")
      .select("id", { count: "exact", head: true })
      .gte("created_at", monthStart.toISOString()),
    supabase
      .from("reconciliations")
      .select("id", { count: "exact", head: true })
      .neq("status", "completed"),
    supabase
      .from("reconciliations")
      .select(
        "id, status, currency, total_difference, updated_at, period_start, period_end, created_by, suppliers(name), created_at",
      )
      .neq("status", "completed")
      .order("updated_at", { ascending: false })
      .limit(200),
  ]);

  const openRows = openRes.data ?? [];
  const openIds = openRows.map((r) => r.id);

  // Unresolved exception counts per open reconciliation (single query).
  const unresolvedByRecon = new Map<string, number>();
  if (openIds.length > 0) {
    const { data: matchRows } = await supabase
      .from("reconciliation_matches")
      .select("reconciliation_id, match_type, user_confirmed, exception_resolutions(status)")
      .in("reconciliation_id", openIds);
    const exceptionTypes = new Set([
      "amount_mismatch",
      "missing_in_ledger",
      "missing_on_statement",
      "duplicate_statement",
      "duplicate_ledger",
    ]);
    for (const m of matchRows ?? []) {
      const res = (
        Array.isArray(m.exception_resolutions)
          ? m.exception_resolutions[0]
          : m.exception_resolutions
      ) as { status?: string } | null;
      const handled = res?.status === "resolved" || res?.status === "ignored";
      const counts =
        (m.match_type === "probable_match" && !m.user_confirmed) ||
        (exceptionTypes.has(m.match_type) && !handled);
      if (counts) {
        unresolvedByRecon.set(
          m.reconciliation_id,
          (unresolvedByRecon.get(m.reconciliation_id) ?? 0) + 1,
        );
      }
    }
  }
  let totalUnresolved = 0;
  for (const n of unresolvedByRecon.values()) totalUnresolved += n;

  const { data: recentCompleted } = await supabase
    .from("reconciliations")
    .select("id, status, currency, total_difference, completed_at, completed_by, suppliers(name)")
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(5);

  const doneRows = recentCompleted ?? [];

  const stats = [
    { label: "Suppliers", value: suppliersRes.count ?? 0 },
    { label: "Reconciliations this month", value: monthRes.count ?? 0 },
    { label: "Pending", value: pendingRes.count ?? 0 },
    { label: "Unresolved exceptions", value: totalUnresolved },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">Dashboard</h1>
          <p className="text-xs text-zinc-500">Workspace: {ctx.organization.name}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/suppliers"
            className="inline-flex h-9 items-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
          >
            Manage suppliers
          </Link>
          <Link
            href="/reconciliations/new"
            className="inline-flex h-9 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800"
          >
            New reconciliation
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="py-5">
              <p className="text-xs font-medium text-zinc-500">{s.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Needs attention</CardTitle>
            <Link href="/reconciliations" className="text-xs font-medium text-zinc-600 hover:text-zinc-900">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {openRows.length === 0 ? (
              <EmptyState
                title="No open reconciliations"
                description="Create one to upload a supplier statement and your AP ledger."
                action={
                  <Link
                    href="/reconciliations/new"
                    className="inline-flex h-9 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800"
                  >
                    New reconciliation
                  </Link>
                }
              />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Supplier</Th>
                    <Th>Period</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Exceptions</Th>
                    <Th>Updated</Th>
                    <Th>Owner</Th>
                  </tr>
                </thead>
                <tbody>
                  {openRows.slice(0, 8).map((r) => (
                    <Tr key={r.id}>
                      <Td>
                        <Link
                          href={`/reconciliations/${r.id}`}
                          className="font-medium text-zinc-900 hover:underline"
                        >
                          {(r.suppliers as unknown as { name?: string })?.name ?? "Supplier"}
                        </Link>
                      </Td>
                      <Td className="text-xs text-zinc-600">
                        {r.period_start || r.period_end
                          ? `${r.period_start ?? "…"} → ${r.period_end ?? "…"}`
                          : "—"}
                      </Td>
                      <Td>
                        <Badge className={statusBadgeClass(r.status)}>{STATUS_LABELS[r.status]}</Badge>
                      </Td>
                      <Td className="text-right tabular-nums">
                        {unresolvedByRecon.get(r.id) ?? 0}
                      </Td>
                      <Td className="text-xs text-zinc-500">
                        {new Date(r.updated_at).toLocaleDateString()}
                      </Td>
                      <Td className="text-xs text-zinc-500">
                        {r.created_by === ctx.user.id ? "You" : "Team member"}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recently completed</CardTitle>
          </CardHeader>
          <CardContent>
            {doneRows.length === 0 ? (
              <p className="py-6 text-center text-xs text-zinc-500">Nothing completed yet.</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {doneRows.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/reconciliations/${r.id}`}
                      className="flex items-center justify-between gap-3 py-3 hover:bg-zinc-50 -mx-2 px-2 rounded"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-900">
                          {(r.suppliers as unknown as { name?: string })?.name ?? "Supplier"}
                        </p>
                        <p className="text-xs text-zinc-500">
                          Completed{" "}
                          {r.completed_at ? new Date(r.completed_at).toLocaleDateString() : "—"}
                          {r.completed_by
                            ? ` ${r.completed_by === ctx.user.id ? "by you" : "by a team member"}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs tabular-nums text-zinc-600">
                          {r.total_difference !== null ? formatMoney(r.total_difference, r.currency) : "—"}
                        </span>
                        <Badge className={statusBadgeClass(r.status)}>{STATUS_LABELS[r.status]}</Badge>
                      </div>
                    </Link>
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
