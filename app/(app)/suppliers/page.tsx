import { requireOrg } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import {
  SupplierActions,
  SupplierForm,
  type SupplierRow,
} from "@/components/suppliers/supplier-table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, EmptyState, Table, Th } from "@/components/ui";

export const metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  const ctx = await requireOrg();
  const supabase = await createClient();

  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name, supplier_code, default_currency, notes, created_at")
    .eq("organization_id", ctx.organization.id)
    .order("name");

  const ids = (suppliers ?? []).map((s) => s.id);
  let counts = new Map<string, number>();
  let profileCounts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: recons } = await supabase
      .from("reconciliations")
      .select("supplier_id")
      .in("supplier_id", ids);
    counts = new Map<string, number>();
    for (const r of recons ?? []) {
      counts.set(r.supplier_id, (counts.get(r.supplier_id) ?? 0) + 1);
    }
    const { data: profiles } = await supabase
      .from("mapping_profiles")
      .select("supplier_id")
      .in("supplier_id", ids);
    profileCounts = new Map<string, number>();
    for (const p of profiles ?? []) {
      if (!p.supplier_id) continue;
      profileCounts.set(p.supplier_id, (profileCounts.get(p.supplier_id) ?? 0) + 1);
    }
  }

  const rows: SupplierRow[] = (suppliers ?? []).map((s) => ({
    ...s,
    reconciliation_count: counts.get(s.id) ?? 0,
    profile_count: profileCounts.get(s.id) ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900">Suppliers</h1>
        <p className="text-xs text-zinc-500">
          Suppliers you reconcile statements against. Codes are unique per organization.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add supplier</CardTitle>
          <CardDescription>Required before creating a reconciliation.</CardDescription>
        </CardHeader>
        <CardContent>
          <SupplierForm defaultCurrency={ctx.organization.default_currency} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All suppliers ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState
              title="No suppliers yet"
              description="Add your first supplier above to start reconciling."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Code</Th>
                  <Th>Currency</Th>
                  <Th>Reconciliations</Th>
                  <Th>Mapping profiles</Th>
                  <Th>Created</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <SupplierActions
                    key={s.id}
                    supplier={s}
                    canDelete={(s.reconciliation_count ?? 0) === 0}
                  />
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
