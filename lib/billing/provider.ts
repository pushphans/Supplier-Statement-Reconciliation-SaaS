import "server-only";
import { Environment, Paddle } from "@paddle/paddle-node-sdk";
import { normalizePaddleEvent, type PaddleSubscriptionEvent } from "@/lib/billing/rules";

export interface BillingCustomer {
  email: string;
  name: string;
  organizationId: string;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
}

export interface CheckoutSession { url: string; customerId: string | null }
export interface PortalSession { url: string }

/** Manual pilot and Paddle implement the same trusted server-side operations. */
export interface BillingProvider {
  readonly name: string;
  createCheckout(customer: BillingCustomer, plan: "standard"): Promise<CheckoutSession>;
  createPortal(customer: BillingCustomer): Promise<PortalSession>;
  verifyWebhook(payload: string, signature: string | null): Promise<PaddleSubscriptionEvent | null>;
}

export class ManualBillingProvider implements BillingProvider {
  readonly name = "manual";
  async createCheckout(): Promise<CheckoutSession> {
    return { url: "/settings/billing?pending=manual", customerId: null };
  }
  async createPortal(): Promise<PortalSession> {
    return { url: "/settings/billing?pending=manual" };
  }
  async verifyWebhook(): Promise<null> { return null; }
}

function paddleClient(): Paddle {
  const apiKey = process.env.PADDLE_API_KEY;
  if (!apiKey) throw new Error("Paddle API key is not configured.");
  return new Paddle(apiKey, {
    environment: process.env.PADDLE_ENV === "production" ? Environment.production : Environment.sandbox,
  });
}

export class PaddleBillingProvider implements BillingProvider {
  readonly name = "paddle";

  async createCheckout(customer: BillingCustomer, plan: "standard"): Promise<CheckoutSession> {
    const priceId = process.env.PADDLE_PRICE_STANDARD;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!priceId || !appUrl) throw new Error("Paddle price or app URL is not configured.");
    if (plan !== "standard") throw new Error("Unknown billing plan.");
    const client = paddleClient();
    const customerId = customer.providerCustomerId ??
      (await client.customers.create({ email: customer.email, name: customer.name })).id;
    const payUrl = new URL("/pay", appUrl).toString();
    const transaction = await client.transactions.create({
      items: [{ priceId, quantity: 1 }],
      customerId,
      customData: { organization_id: customer.organizationId, plan: "standard" },
      collectionMode: "automatic",
      checkout: { url: payUrl },
    });
    const checkoutUrl = transaction.checkout?.url;
    if (!checkoutUrl || new URL(checkoutUrl).origin !== new URL(appUrl).origin) {
      throw new Error("Paddle did not return an approved payment link.");
    }
    return { url: checkoutUrl, customerId };
  }

  async createPortal(customer: BillingCustomer): Promise<PortalSession> {
    if (!customer.providerCustomerId || !customer.providerSubscriptionId) {
      throw new Error("No paid subscription to manage yet.");
    }
    const session = await paddleClient().customerPortalSessions.create(
      customer.providerCustomerId,
      [customer.providerSubscriptionId],
    );
    return { url: session.urls.general.overview };
  }

  async verifyWebhook(payload: string, signature: string | null): Promise<PaddleSubscriptionEvent | null> {
    const secret = process.env.PADDLE_WEBHOOK_SECRET;
    if (!secret || !signature) throw new Error("Missing Paddle webhook signature or secret.");
    const verified = await paddleClient().webhooks.unmarshal(payload, secret, signature);
    if (!verified.eventType.startsWith("subscription.")) return null;
    const priceId = process.env.PADDLE_PRICE_STANDARD;
    if (!priceId) throw new Error("Paddle price is not configured.");
    const event = normalizePaddleEvent(verified, priceId);
    // Other Paddle products may share this webhook endpoint. Never grant
    // access for another price (or unrecognized metadata), but acknowledge it.
    if (!event) return null;
    return event;
  }
}

export function getBillingProvider(): BillingProvider {
  const mode = process.env.BILLING_PROVIDER ?? "manual";
  if (mode === "paddle") return new PaddleBillingProvider();
  if (mode === "manual") return new ManualBillingProvider();
  throw new Error(`Unsupported billing provider: ${mode}`);
}
