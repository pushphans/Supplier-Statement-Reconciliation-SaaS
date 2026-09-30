import "server-only";
import { createClient } from "@/lib/supabase/server";
import { canWriteBillingData, supplierLimit, type SubscriptionState } from "@/lib/billing/rules";

export async function billingWriteAccess(organizationId: string): Promise<{
  allowed: boolean;
  message: string;
  supplierLimit: number | null;
}> {
  if ((process.env.BILLING_PROVIDER ?? "manual") !== "paddle") {
    return { allowed: true, message: "", supplierLimit: null };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("subscriptions")
    .select("status, provider, plan_name, trial_ends_at, current_period_end, past_due_since")
    .eq("organization_id", organizationId).maybeSingle();
  if (error) return { allowed: false, message: "Could not verify your plan. Please try again.", supplierLimit: null };
  const sub = data as SubscriptionState | null;
  return {
    allowed: canWriteBillingData("paddle", sub),
    message: "Your trial or subscription needs attention. Visit Settings → Billing to continue.",
    supplierLimit: supplierLimit(sub),
  };
}
