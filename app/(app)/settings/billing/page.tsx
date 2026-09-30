import { requireOrg } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { getBillingProvider } from "@/lib/billing/provider";
import { BillingButtons } from "@/components/billing/billing-buttons";
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

export const metadata = { title: "Billing" };

export default async function BillingPage({ searchParams }: PageProps<"/settings/billing">) {
  const ctx = await requireOrg();
  const sp = await searchParams;
  const supabase = await createClient();
  const provider = getBillingProvider();
  const { data: sub } = await supabase.from("subscriptions")
    .select("status, plan_name, provider, trial_ends_at, current_period_end, provider_subscription_id, cancel_at_period_end, past_due_since")
    .eq("organization_id", ctx.organization.id).maybeSingle();

  const trialEnd = sub?.trial_ends_at ? new Date(sub.trial_ends_at) : null;
  const activeUntil = sub?.current_period_end ? new Date(sub.current_period_end) : null;
  // eslint-disable-next-line react-hooks/purity -- server component; clock read is intentional per-request
  const trialExpired = Boolean(trialEnd && trialEnd.getTime() < Date.now());
  const isManual = provider.name === "manual";

  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="text-lg font-semibold text-zinc-900">Billing</h1>
      {sp.checkout === "returned" && (
        <Alert tone="info">Paddle is confirming your payment. This page updates when the payment webhook arrives; refresh shortly.</Alert>
      )}
      <Card>
        <CardHeader><CardTitle>Current plan</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm text-zinc-700">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-zinc-900">{sub?.plan_name ?? "Trial"}</p>
              <p className="text-xs text-zinc-500">Provider: {sub?.provider ?? provider.name}</p>
            </div>
            <Badge className="border-zinc-200 bg-zinc-100 text-zinc-700">{sub?.status ?? "trialing"}</Badge>
          </div>
          {sub?.status === "trialing" && trialEnd && (
            <Alert tone={trialExpired ? "warning" : "info"}>
              Trial {trialExpired ? "ended" : "ends"} {trialEnd.toLocaleDateString()}.
              {isManual ? " Contact us for a founding plan." : " Subscribe to keep creating reconciliations."}
            </Alert>
          )}
          {sub?.status === "past_due" && (
            <Alert tone="warning">Payment needs attention. Use Manage subscription to update your payment method; a 7-day grace period applies.</Alert>
          )}
          {activeUntil && <p>Current paid period ends {activeUntil.toLocaleDateString()}.</p>}
          {sub?.cancel_at_period_end && <p>Cancellation is scheduled for the end of your paid period.</p>}
          {isManual ? (
            <p>Private pilot billing is handled manually; no online payment is required.</p>
          ) : sub?.status === "founding" ? (
            <p>Your founding plan is managed directly by the team.</p>
          ) : ctx.role === "owner" ? (
            <BillingButtons hasSubscription={Boolean(sub?.provider_subscription_id && sub.status !== "canceled")} />
          ) : (
            <p>Ask your organization owner to manage billing.</p>
          )}
        </CardContent>
      </Card>
      {provider.name === "paddle" && (
        <Card>
          <CardHeader><CardTitle>Standard — $99/month</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-zinc-700">
            <p>Up to 25 suppliers, reconciliation history and CSV exports, with multiple team members.</p>
            <p>India checkout uses an INR price override and supports UPI Autopay when enabled in Paddle. Paddle handles payments, invoices and sales tax as Merchant of Record.</p>
            <p className="text-xs text-zinc-500">Payment is confirmed by a signed webhook, not merely by returning from checkout. Existing history and exports remain available if a plan expires.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
