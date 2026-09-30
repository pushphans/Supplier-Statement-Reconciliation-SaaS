import { getBillingProvider } from "@/lib/billing/provider";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/audit";
import { logEvent, newRequestId } from "@/lib/log";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (process.env.BILLING_PROVIDER !== "paddle") {
    return new Response("Billing provider disabled", { status: 404 });
  }
  const signature = request.headers.get("paddle-signature");
  if (!signature || Number(request.headers.get("content-length") ?? 0) > 262144) {
    return new Response("Invalid webhook", { status: signature ? 413 : 401 });
  }

  const payload = await request.text(); // Never parse before signature verification.
  if (payload.length > 262144) return new Response("Payload too large", { status: 413 });

  let event;
  try {
    event = await getBillingProvider().verifyWebhook(payload, signature);
  } catch {
    logEvent("warn", "billing_webhook_rejected", { requestId: newRequestId(), code: "invalid_signature_or_payload" });
    return new Response("Invalid webhook", { status: 401 });
  }
  if (!event) return new Response("Ignored", { status: 200 });

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("apply_paddle_subscription_event", {
    p_event_id: event.eventId,
    p_organization_id: event.organizationId,
    p_customer_id: event.customerId,
    p_subscription_id: event.subscriptionId,
    p_status: event.status,
    p_period_end: event.periodEnd,
    p_trial_end: event.trialEnd,
    p_cancel_at_period_end: event.cancelAtPeriodEnd,
    p_occurred_at: event.occurredAt,
  });
  if (error) {
    logEvent("error", "billing_webhook_failed", {
      requestId: newRequestId(), organizationId: event.organizationId,
      code: error.code,
    });
    return new Response("Could not process webhook", { status: 500 });
  }
  if (data === "applied") {
    await recordAudit(admin, {
      organizationId: event.organizationId,
      actorUserId: null,
      eventType: "subscription_updated",
      metadata: { provider: "paddle", status: event.status, subscription_id: event.subscriptionId },
    });
  }
  logEvent("info", "billing_webhook_processed", {
    requestId: newRequestId(), organizationId: event.organizationId,
    code: String(data),
  });
  return new Response("OK", { status: 200 });
}
