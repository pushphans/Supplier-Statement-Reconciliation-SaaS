import { requireOrg } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { getBillingProvider } from "@/lib/billing/provider";
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui";

export const metadata = { title: "Billing" };

export default async function BillingPage() {
  const ctx = await requireOrg();
  const supabase = await createClient();
  const provider = getBillingProvider();

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status, plan_name, provider, trial_ends_at, current_period_end")
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();

  const trialEnd = sub?.trial_ends_at ? new Date(sub.trial_ends_at) : null;
  const trialEndMs = trialEnd ? trialEnd.getTime() : null;
  // eslint-disable-next-line react-hooks/purity -- server component; clock read is intentional per-request
  const nowMs = Date.now();
  const trialExpired = trialEndMs !== null ? trialEndMs < nowMs : false;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Current plan</CardTitle>
          <CardDescription>
            Private pilot runs on manual billing — no payment integration required (PRD §53).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-zinc-900">{sub?.plan_name ?? "Trial"}</p>
              <p className="text-xs text-zinc-500">
                Provider: {sub?.provider ?? provider.name}
              </p>
            </div>
            <Badge
              className={
                sub?.status === "founding" || sub?.status === "active"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : sub?.status === "canceled"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-amber-200 bg-amber-50 text-amber-700"
              }
            >
              {sub?.status ?? "trialing"}
            </Badge>
          </div>

          {sub?.status === "trialing" && trialEnd && (
            <Alert tone={trialExpired ? "warning" : "info"}>
              Trial {trialExpired ? "ended" : "ends"} {trialEnd.toLocaleDateString()}.
              {trialExpired
                ? " Contact us to assign the Founding plan — billing is handled manually during the pilot."
                : " Founding pricing will be applied manually at conversion."}
            </Alert>
          )}

          <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
            <p className="font-medium text-zinc-800">Foundation pilot pricing</p>
            <p className="mt-1">
              Flat pilot rate while in private beta. Upgrades and portal actions are recorded
              against the manual provider until a payment processor is connected.
            </p>
          </div>

          <div className="flex gap-2">
            <a
              href="/settings/billing?pending=manual"
              className="inline-flex h-9 items-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Request plan change
            </a>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Billing architecture</CardTitle>
          <CardDescription>Provider-agnostic interface for future processors.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-zinc-700">
            <li>
              <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs">BillingProvider</code>{" "}
              interface with checkout, portal, and webhook verification.
            </li>
            <li>
              <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs">
                ManualBillingProvider
              </code>{" "}
              is the default (<code className="text-xs">BILLING_PROVIDER=manual</code>).
            </li>
            <li>Subscription state lives in the <code className="text-xs">subscriptions</code> table with RLS owner policies.</li>
            <li>Webhooks verify signatures before mutating subscription state.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
