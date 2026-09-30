"use client";

import { useEffect, useState } from "react";
import { initializePaddle } from "@paddle/paddle-js";
import { useRouter } from "next/navigation";

export function PaymentLink() {
  const router = useRouter();
  const [message, setMessage] = useState(
    process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN
      ? "Opening Paddle Checkout…"
      : "Checkout is not configured yet. Please contact support.",
  );

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
    if (!token) return;
    // Paddle.js reads ?_ptxn= from the approved default payment-link URL and
    // opens the transaction. Do not call Checkout.open() with a second item.
    initializePaddle({
      token,
      environment: process.env.NEXT_PUBLIC_PADDLE_ENV === "production" ? "production" : "sandbox",
      eventCallback: (event) => {
        if (event.name === "checkout.completed") {
          router.push("/settings/billing?checkout=returned");
        }
      },
    }).then((paddle) => {
      if (!paddle) setMessage("Checkout could not start. Please try again.");
    }).catch(() => setMessage("Checkout could not start. Please try again."));
  }, [router]);

  return <p role="status" className="rounded-md bg-zinc-50 px-4 py-3 text-sm text-zinc-700">{message}</p>;
}
