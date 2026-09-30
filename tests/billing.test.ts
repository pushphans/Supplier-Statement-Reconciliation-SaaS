import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { Paddle } from "@paddle/paddle-node-sdk";
import {
  canWriteBillingData,
  normalizePaddleEvent,
  supplierLimit,
  type SubscriptionState,
} from "@/lib/billing/rules";

const NOW = Date.parse("2026-09-30T00:00:00Z");
const state = (changes: Partial<SubscriptionState> = {}): SubscriptionState => ({
  status: "trialing",
  provider: "manual",
  plan_name: "Trial",
  trial_ends_at: "2026-10-01T00:00:00Z",
  current_period_end: null,
  past_due_since: null,
  ...changes,
});

describe("subscription access", () => {
  it("preserves manual pilot access even after a trial expires", () => {
    expect(canWriteBillingData("manual", state({ trial_ends_at: "2026-09-01T00:00:00Z" }), NOW)).toBe(true);
  });
  it("allows an ongoing trial and denies expired or missing subscriptions in Paddle mode", () => {
    expect(canWriteBillingData("paddle", state(), NOW)).toBe(true);
    expect(canWriteBillingData("paddle", state({ trial_ends_at: "2026-09-01T00:00:00Z" }), NOW)).toBe(false);
    expect(canWriteBillingData("paddle", null, NOW)).toBe(false);
  });
  it("grants active and founding accounts but denies canceled accounts", () => {
    expect(canWriteBillingData("paddle", state({ status: "active" }), NOW)).toBe(true);
    expect(canWriteBillingData("paddle", state({ status: "founding" }), NOW)).toBe(true);
    expect(canWriteBillingData("paddle", state({ status: "canceled" }), NOW)).toBe(false);
    expect(supplierLimit(state({ status: "founding" }))).toBeNull();
    expect(supplierLimit(state({ status: "active" }))).toBe(25);
  });
  it("does not grant an old Paddle subscription indefinite access if renewal webhooks stop", () => {
    expect(canWriteBillingData("paddle", state({ status: "active", provider: "paddle", current_period_end: "2026-09-29T00:00:00Z" }), NOW)).toBe(true);
    expect(canWriteBillingData("paddle", state({ status: "active", provider: "paddle", current_period_end: "2026-09-20T00:00:00Z" }), NOW)).toBe(false);
  });
  it("gives past-due accounts seven days of grace", () => {
    expect(canWriteBillingData("paddle", state({ status: "past_due", past_due_since: "2026-09-29T00:00:00Z" }), NOW)).toBe(true);
    expect(canWriteBillingData("paddle", state({ status: "past_due", past_due_since: "2026-09-20T00:00:00Z" }), NOW)).toBe(false);
    expect(canWriteBillingData("paddle", state({ status: "past_due", past_due_since: null }), NOW)).toBe(false);
  });
});

const raw = (changes: Record<string, unknown> = {}) => ({
  eventId: "evt_1",
  eventType: "subscription.created",
  occurredAt: "2026-09-30T00:00:00Z",
  data: {
    id: "sub_123",
    customerId: "ctm_123",
    status: "active",
    customData: { organization_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    items: [{ price: { id: "pri_standard" } }],
    currentBillingPeriod: { endsAt: "2026-10-30T00:00:00Z" },
    scheduledChange: null,
    ...changes,
  },
});

describe("verified Paddle event normalization", () => {
  it("keeps only the configured recurring price and organization", () => {
    expect(normalizePaddleEvent(raw(), "pri_standard")).toMatchObject({
      organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      status: "active",
      customerId: "ctm_123",
      subscriptionId: "sub_123",
      periodEnd: "2026-10-30T00:00:00Z",
    });
    expect(normalizePaddleEvent(raw(), "pri_other")).toBeNull();
    expect(normalizePaddleEvent(raw({ customData: { organization_id: "not-a-uuid" } }), "pri_standard")).toBeNull();
  });
  it("maps scheduled cancel and paused status without granting free access", () => {
    expect(normalizePaddleEvent(raw({ scheduledChange: { action: "cancel" } }), "pri_standard")?.cancelAtPeriodEnd).toBe(true);
    expect(normalizePaddleEvent(raw({ status: "paused" }), "pri_standard")?.status).toBe("past_due");
  });
  it("ignores other event types and malformed timestamps", () => {
    expect(normalizePaddleEvent({ ...raw(), eventType: "transaction.completed" }, "pri_standard")).toBeNull();
    expect(normalizePaddleEvent({ ...raw(), occurredAt: "invalid" }, "pri_standard")).toBeNull();
  });
});

describe("Paddle SDK raw-body signature verification", () => {
  it("accepts a signed subscription event and rejects a tampered event", async () => {
    const payload = JSON.stringify({
      event_id: "evt_signed", event_type: "subscription.created",
      occurred_at: "2026-09-30T00:00:00Z",
      data: {
        id: "sub_123", customer_id: "ctm_123", status: "active",
        custom_data: { organization_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
        billing_cycle: { interval: "month", frequency: 1 },
        items: [{ price: { id: "pri_standard" } }],
        current_billing_period: { starts_at: "2026-09-30T00:00:00Z", ends_at: "2026-10-30T00:00:00Z" },
      },
    });
    const secret = "test_webhook_secret";
    const timestamp = Math.floor(Date.now() / 1000);
    const hash = createHmac("sha256", secret).update(`${timestamp}:${payload}`).digest("hex");
    const signature = `ts=${timestamp};h1=${hash}`;
    const paddle = new Paddle("test_key");

    const verified = await paddle.webhooks.unmarshal(payload, secret, signature);
    expect(normalizePaddleEvent(verified, "pri_standard")?.status).toBe("active");
    await expect(paddle.webhooks.unmarshal(payload.replace("active", "canceled"), secret, signature))
      .rejects.toThrow(/signature/i);
  });
});
