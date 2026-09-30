"use server";

import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBillingProvider } from "@/lib/billing/provider";
import { checkRateLimit, rateLimitError } from "@/lib/rate-limit";

export type BillingFormState = { error?: string } | null;

export async function startCheckoutAction(
  _previous: BillingFormState,
  _formData: FormData,
): Promise<BillingFormState> {
  void _previous;
  void _formData;
  const ctx = await requireOwner();
  if (process.env.BILLING_PROVIDER !== "paddle") {
    return { error: "Online checkout is not enabled for this pilot." };
  }
  const limited = checkRateLimit(`checkout:${ctx.organization.id}`, { limit: 5, windowMs: 60_000 });
  if (!limited.ok) return { error: rateLimitError(limited.retryAfterSec) };

  const admin = createAdminClient();
  const { data: sub, error } = await admin.from("subscriptions")
    .select("status, provider_customer_id, provider_subscription_id")
    .eq("organization_id", ctx.organization.id).single();
  if (error || !sub) return { error: "Subscription could not be loaded." };
  if (sub.status === "founding") return { error: "Founding plans are managed manually." };
  if (sub.provider_subscription_id && sub.status !== "canceled") {
    return { error: "A subscription already exists. Use Manage billing to update it." };
  }

  let checkout;
  try {
    checkout = await getBillingProvider().createCheckout({
      organizationId: ctx.organization.id,
      email: ctx.user.email ?? "",
      name: (ctx.user.user_metadata?.full_name as string) || ctx.organization.name,
      providerCustomerId: sub.provider_customer_id,
      providerSubscriptionId: null,
    }, "standard");
  } catch {
    return { error: "Checkout is unavailable. Check the Paddle setup and try again." };
  }
  if (checkout.customerId && checkout.customerId !== sub.provider_customer_id) {
    const { error: saveError } = await admin.from("subscriptions")
      .update({ provider_customer_id: checkout.customerId })
      .eq("organization_id", ctx.organization.id);
    if (saveError) return { error: "Could not save billing customer. Please try again." };
  }
  redirect(checkout.url);
}

export async function openBillingPortalAction(
  _previous: BillingFormState,
  _formData: FormData,
): Promise<BillingFormState> {
  void _previous;
  void _formData;
  const ctx = await requireOwner();
  if (process.env.BILLING_PROVIDER !== "paddle") return { error: "Billing portal is not enabled." };
  const admin = createAdminClient();
  const { data: sub } = await admin.from("subscriptions")
    .select("provider_customer_id, provider_subscription_id")
    .eq("organization_id", ctx.organization.id).single();
  if (!sub?.provider_customer_id || !sub?.provider_subscription_id) {
    return { error: "No paid subscription to manage yet." };
  }
  let session;
  try {
    session = await getBillingProvider().createPortal({
      organizationId: ctx.organization.id,
      email: ctx.user.email ?? "",
      name: ctx.organization.name,
      providerCustomerId: sub.provider_customer_id,
      providerSubscriptionId: sub.provider_subscription_id,
    });
  } catch {
    return { error: "Billing portal is unavailable. Please try again." };
  }
  redirect(session.url);
}
