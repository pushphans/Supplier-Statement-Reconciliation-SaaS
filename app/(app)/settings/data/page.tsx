import { requireOwner } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { DeleteDataForm } from "@/components/settings/delete-data-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Data & privacy" };

export default async function DataSettingsPage({
  searchParams,
}: PageProps<"/settings/data">) {
  const ctx = await requireOwner();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const pageSize = 20;
  const supabase = await createClient();

  const { data: events, count } = await supabase
    .from("audit_events")
    .select("id, event_type, actor_user_id, metadata, created_at", { count: "exact" })
    .eq("organization_id", ctx.organization.id)
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Data handling</CardTitle>
            <CardDescription>What the product does with your files.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-relaxed text-zinc-700">
            <p>
              <strong>Client-side parsing.</strong> CSV/XLSX/PDF files are read in your browser.
              Only normalized rows (raw + normalized fields) are sent to the server for matching
              and audit.
            </p>
            <p>
              <strong>Raw values preserved.</strong> Original cell values are stored in{" "}
              <code className="text-xs">source_transactions.raw_data</code> alongside normalized
              columns — never overwritten.
            </p>
            <p>
              <strong>Export.</strong> CSV exports apply formula-injection protection
              (<code className="text-xs">=,+,-,@</code> prefixes neutralized).
            </p>
            <p>
              <strong>Isolation.</strong> Row Level Security scopes every query to your
              organization. Audit events are append-only (DB triggers block UPDATE/DELETE).
            </p>
            <p>
              <strong>Deletion.</strong> Deleting your organization cascades to all workspace
              data (suppliers, reconciliations, transactions, matches, audit rows).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Delete all workspace data</CardTitle>
            <CardDescription>
              Owner only · irreversible · requires typing the organization name.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeleteDataForm orgName={ctx.organization.name} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Audit trail (page {page})</CardTitle>
          <CardDescription>
            Append-only log of sensitive actions. {(count ?? 0)} events total.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Event</Th>
                <Th>Metadata</Th>
              </tr>
            </thead>
            <tbody>
              {(events ?? []).map((e) => (
                <Tr key={e.id}>
                  <Td className="whitespace-nowrap text-xs text-zinc-500">
                    {formatDateTime(e.created_at)}
                  </Td>
                  <Td className="font-mono text-xs">{e.event_type}</Td>
                  <Td className="max-w-md truncate font-mono text-[11px] text-zinc-500">
                    {JSON.stringify(e.metadata)}
                  </Td>
                </Tr>
              ))}
              {(events ?? []).length === 0 && (
                <Tr>
                  <Td colSpan={3} className="py-6 text-center text-zinc-500">
                    No audit events yet.
                  </Td>
                </Tr>
              )}
            </tbody>
          </Table>
          {totalPages > 1 && (
            <div className="mt-3 flex justify-between text-xs text-zinc-600">
              <span>
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                {page > 1 && (
                  <a href={`/settings/data?page=${page - 1}`} className="rounded border border-zinc-300 px-2 py-1 hover:bg-zinc-50">
                    Previous
                  </a>
                )}
                {page < totalPages && (
                  <a href={`/settings/data?page=${page + 1}`} className="rounded border border-zinc-300 px-2 py-1 hover:bg-zinc-50">
                    Next
                  </a>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
