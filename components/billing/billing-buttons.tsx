"use client";

import { useActionState } from "react";
import {
  openBillingPortalAction,
  startCheckoutAction,
} from "@/app/actions/billing";
import { Alert, Button } from "@/components/ui";

export function BillingButtons({
  hasSubscription,
}: { hasSubscription: boolean }) {
  const [checkout, checkoutAction, checkoutPending] = useActionState(startCheckoutAction, null);
  const [portal, portalAction, portalPending] = useActionState(openBillingPortalAction, null);

  return (
    <div className="space-y-3">
      {checkout?.error && <Alert tone="error">{checkout.error}</Alert>}
      {portal?.error && <Alert tone="error">{portal.error}</Alert>}
      {hasSubscription ? (
        <form action={portalAction}>
          <Button type="submit" loading={portalPending}>Manage subscription & payment method</Button>
        </form>
      ) : (
        <form action={checkoutAction}>
          <Button type="submit" loading={checkoutPending}>Subscribe to Standard</Button>
        </form>
      )}
    </div>
  );
}
