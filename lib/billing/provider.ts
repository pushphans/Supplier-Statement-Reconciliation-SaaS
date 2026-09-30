import "server-only";

export interface BillingCustomer {
  id: string;
  email: string;
}

export interface CheckoutSession {
  url: string;
}

export interface PortalSession {
  url: string;
}

/**
 * Provider-agnostic billing interface (PRD §53).
 * Private pilot must work without payment integration using manually
 * assigned founding plans — see ManualBillingProvider.
 */
export interface BillingProvider {
  readonly name: string;
  createCheckout(customer: BillingCustomer, plan: string): Promise<CheckoutSession>;
  createPortal(customer: BillingCustomer): Promise<PortalSession>;
  /** Verify a webhook payload; returns the normalized subscription state. */
  verifyWebhook(
    payload: string,
    signature: string | null,
  ): Promise<{ organizationId: string | null; status: string; planName: string } | null>;
}

export class ManualBillingProvider implements BillingProvider {
  readonly name = "manual";

  async createCheckout(): Promise<CheckoutSession> {
    return { url: "/settings/billing?pending=manual" };
  }

  async createPortal(): Promise<PortalSession> {
    return { url: "/settings/billing?pending=manual" };
  }

  async verifyWebhook(): Promise<null> {
    return null;
  }
}

export function getBillingProvider(): BillingProvider {
  const name = process.env.BILLING_PROVIDER ?? "manual";
  // Additional providers plug in here without touching product code.
  return new ManualBillingProvider();
  void name;
}
