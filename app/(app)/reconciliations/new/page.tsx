import { requireOrg } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { NewReconciliationForm } from "@/components/reconciliations/new-reconciliation-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";

export const metadata = { title: "New reconciliation" };

export default async function NewReconciliationPage() {
  const ctx = await requireOrg();
  const supabase = await createClient();

  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name, default_currency")
    .eq("organization_id", ctx.organization.id)
    .order("name");

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900">New reconciliation</h1>
        <p className="text-xs text-zinc-500">
          Step 1 of the wizard — define the supplier and period. You will upload files next.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Reconciliation details</CardTitle>
          <CardDescription>
            The period is optional but helps filter probable-match date windows later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewReconciliationForm
            suppliers={(suppliers ?? []).map((s) => ({
              id: s.id,
              name: s.name,
              default_currency: s.default_currency,
            }))}
            defaultCurrency={ctx.organization.default_currency}
          />
        </CardContent>
      </Card>
    </div>
  );
}
