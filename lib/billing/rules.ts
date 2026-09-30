export type SubscriptionState = {
  status: string;
  provider: string;
  plan_name: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  past_due_since: string | null;
};

const GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/** In the manual pilot no payment is collected, so existing workspaces keep working. */
export function canWriteBillingData(
  providerMode: string,
  subscription: SubscriptionState | null,
  now = Date.now(),
): boolean {
  if (providerMode !== "paddle") return true;
  if (!subscription) return false;
  if (subscription.status === "founding") return true;
  if (subscription.status === "trialing") {
    return Boolean(subscription.trial_ends_at && Date.parse(subscription.trial_ends_at) > now);
  }
  if (subscription.status === "active") {
    if (subscription.provider === "manual") return true;
    // A lost renewal webhook must not grant perpetual access. Allow up to
    // three days for delayed Indian UPI captures and webhook delivery.
    return Boolean(subscription.current_period_end &&
      Date.parse(subscription.current_period_end) + 3 * 24 * 60 * 60 * 1000 > now);
  }
  if (subscription.status === "past_due") {
    return Boolean(subscription.past_due_since && Date.parse(subscription.past_due_since) + GRACE_MS > now);
  }
  return false;
}

export function supplierLimit(subscription: SubscriptionState | null): number | null {
  if (subscription?.status === "founding") return null;
  return 25; // Standard plan and trial
}

export type PaddleSubscriptionEvent = {
  eventId: string;
  organizationId: string;
  customerId: string;
  subscriptionId: string;
  status: "trialing" | "active" | "past_due" | "canceled";
  periodEnd: string | null;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean;
  occurredAt: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only use after Paddle has verified the raw body + signature. */
export function normalizePaddleEvent(
  event: {
    eventId: string;
    eventType: string;
    occurredAt: string;
    data: object;
  },
  expectedPriceId: string,
): PaddleSubscriptionEvent | null {
  if (!event.eventType.startsWith("subscription.")) return null;
  const data = event.data as {
    id?: string;
    customerId?: string;
    status?: string;
    customData?: Record<string, unknown> | null;
    items?: { price?: { id?: string } | null }[];
    currentBillingPeriod?: { endsAt?: string } | null;
    scheduledChange?: { action?: string } | null;
    nextBilledAt?: string | null;
  };
  const orgId = data.customData?.organization_id;
  if (
    !event.eventId || !Number.isFinite(Date.parse(event.occurredAt)) ||
    typeof orgId !== "string" || !UUID.test(orgId) ||
    !data.id?.startsWith("sub_") || !data.customerId?.startsWith("ctm_") ||
    !data.items?.some((item) => item.price?.id === expectedPriceId)
  ) return null;

  const status =
    data.status === "active" ? "active" :
    data.status === "trialing" ? "trialing" :
    data.status === "past_due" || data.status === "paused" ? "past_due" :
    data.status === "canceled" ? "canceled" : null;
  if (!status) return null;

  return {
    eventId: event.eventId,
    organizationId: orgId,
    customerId: data.customerId,
    subscriptionId: data.id,
    status,
    periodEnd: data.currentBillingPeriod?.endsAt ?? null,
    trialEnd: status === "trialing" ? (data.nextBilledAt ?? null) : null,
    cancelAtPeriodEnd: data.scheduledChange?.action === "cancel",
    occurredAt: event.occurredAt,
  };
}
