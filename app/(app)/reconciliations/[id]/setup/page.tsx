import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { SetupWizard } from "@/components/setup/setup-wizard";

export const metadata = { title: "Setup reconciliation" };

export default async function SetupPage({
  params,
  searchParams,
}: PageProps<"/reconciliations/[id]/setup">) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requireOrg();
  const supabase = await createClient();

  const { data: recon } = await supabase
    .from("reconciliations")
    .select("id, organization_id, status, supplier_id, currency")
    .eq("id", id)
    .maybeSingle();

  if (!recon || recon.organization_id !== ctx.organization.id) notFound();
  if (recon.status === "completed") {
    // Allow setup only for drafts/review; completed goes to results.
    notFound();
  }

  const { data: datasets } = await supabase
    .from("source_datasets")
    .select("id, type, original_filename, row_count")
    .eq("reconciliation_id", id);

  const { data: profiles } = await supabase
    .from("mapping_profiles")
    .select("id, name, source_type, mapping, normalization_options")
    .eq("organization_id", ctx.organization.id)
    .or(`supplier_id.eq.${recon.supplier_id},supplier_id.is.null`);

  const datasetInfo = (type: string) => {
    const d = (datasets ?? []).find((x) => x.type === type);
    return d ? { filename: d.original_filename, rowCount: d.row_count } : null;
  };

  const initialStep = typeof sp.step === "string" ? Number(sp.step) : NaN;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900">Setup reconciliation</h1>
        <p className="text-xs text-zinc-500">
          Upload → map → normalize → run. Parsing happens in your browser; normalized rows are
          saved server-side for auditability.
        </p>
      </div>

      <SetupWizard
        reconciliationId={id}
        defaultCurrency={recon.currency}
        initialStep={initialStep}
        existing={{
          statement: datasetInfo("supplier_statement"),
          ledger: datasetInfo("ap_ledger"),
        }}
        profiles={(profiles ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          source_type: p.source_type as "statement" | "ledger",
          mapping: p.mapping as Record<string, string>,
          normalization_options: p.normalization_options as Record<string, unknown>,
        }))}
      />
    </div>
  );
}
