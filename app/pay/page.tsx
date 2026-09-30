import { PaymentLink } from "@/components/billing/payment-link";

export const metadata = { title: "Secure checkout" };

export default function PayPage() {
  return (
    <main className="mx-auto max-w-lg space-y-5 px-5 py-20 text-center">
      <h1 className="text-2xl font-semibold text-zinc-900">Secure subscription checkout</h1>
      <p className="text-sm text-zinc-600">
        Your payment is handled by Paddle. This application never receives card or UPI credentials.
      </p>
      <PaymentLink />
      <a href="/settings/billing" className="text-sm text-zinc-600 underline">Back to billing</a>
    </main>
  );
}
