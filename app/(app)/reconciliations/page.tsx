import Link from "next/link";
import { requireOrg } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, statusBadgeClass, STATUS_LABELS } from "@/lib/format";
import { Badge, Card, CardContent, EmptyState, Table, Th, Td, Tr } from "@/components/ui";

export const metadata = { title: "Reconciliations" };

export default async function ReconciliationsPage({
  searchParams,
}: PageProps<"/reconciliations">) {
  const params = await searchParams;
  const statusFilter = typeof params.status === "string" ? params.status : "all";
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const pageSize = 20;

  const ctx = await requireOrg();
  const supabase = await createClient();

  let query = supabase
    .from("reconciliations")
    .select(
      "id, status, currency, period_start, period_end, total_difference, created_at, completed_at, completed_by, suppliers(name)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (statusFilter !== "all") query = query.eq("status", statusFilter);

  const { data, count, error } = await query;
  if (error) {
    return <Alertish message={error.message} />;
  }

  const rows = data ?? [];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));

  const tabs = [
    { key: "all", label: "All" },
    { key: "draft", label: "Draft" },
    { key: "review", label: "In review" },
    { key: "completed", label: "Completed" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">Reconciliations</h1>
          <p className="text-xs text-zinc-500">Supplier statement vs. AP ledger runs.</p>
        </div>
        <Link
          href="/reconciliations/new"
          className="inline-flex h-9 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800"
        >
          New reconciliation
        </Link>
      </div>

      <div className="flex gap-1 border-b border-zinc-200">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.key === "all" ? "/reconciliations" : `/reconciliations?status=${t.key}`}
            className={
              statusFilter === t.key
                ? "border-b-2 border-zinc-900 px-3 py-2 text-sm font-medium text-zinc-900"
                : "border-b-2 border-transparent px-3 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-800"
            }
          >
            {t.label}
          </Link>
        ))}
      </div>

      <Card>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState
              title="No reconciliations found"
              description="Create a reconciliation, upload a supplier statement and AP ledger, then run deterministic matching."
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
                  <Th className="text-right">Difference</Th>
                  <Th>Created</Th>
                  <Th>Completed</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
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
                      <Badge className={statusBadgeClass(r.status)}>
                        {STATUS_LABELS[r.status]}
                      </Badge>
                    </Td>
                    <Td className="text-right tabular-nums">
                      {r.total_difference !== null
                        ? formatMoney(r.total_difference, r.currency)
                        : "—"}
                    </Td>
                    <Td className="text-xs text-zinc-500">
                      {new Date(r.created_at).toLocaleDateString()}
                    </Td>
                    <Td className="text-xs text-zinc-500">
                      {r.completed_at ? new Date(r.completed_at).toLocaleDateString() : "—"}
                      {r.completed_at && r.completed_by
                        ? ` ${r.completed_by === ctx.user.id ? "by you" : "by a team member"}`
                        : ""}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-zinc-600">
          <span>
            Page {page} of {totalPages} · {count ?? 0} total
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/reconciliations?page=${page - 1}${statusFilter !== "all" ? `&status=${statusFilter}` : ""}`}
                className="rounded border border-zinc-300 px-3 py-1 hover:bg-zinc-50"
              >
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/reconciliations?page=${page + 1}${statusFilter !== "all" ? `&status=${statusFilter}` : ""}`}
                className="rounded border border-zinc-300 px-3 py-1 hover:bg-zinc-50"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Alertish({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </div>
  );
}
