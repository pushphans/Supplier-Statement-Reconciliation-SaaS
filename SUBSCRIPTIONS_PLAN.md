# Subscriptions Plan — Paddle (Merchant of Record)

> Status: `GATEWAY LOCKED: Paddle (2026-09-24, user confirmed)`. Implementation Phase 1 go-ahead ka wait kar raha hai.
> PRD refs: §53 Billing architecture, §54 Pricing, §79 (billing region/account settings), PLAN.md LATER section.

## 1. Gateway decision: Paddle (Recommended)

| Sawal | Paddle | Dodo Payments | Stripe/Razorpay |
|---|---|---|---|
| India + Global | ✅ UPI + UPI Autopay (INR), 200+ desh | ✅ UPI/RuPay, 220+ desh | ❌ user ne mana kiya (complex setup) |
| Setup | ✅ Dashboard toggle (UPI on), hosted checkout, 1 SDK | ✅ easy, API-first | ❌ GST/tax khud sambhalo |
| Tax/GST/VAT | ✅ MoR — Paddle bharta hai, tumhe kuch nahi karna | ✅ MoR | ❌ tumhara sir-dard |
| India me entity/bank | ✅ zaroorat nahi | Adaptive Currency chahiye (non-IN sellers) | ❌ alag setup |
| Fees | 5% + $0.50/txn, all-in, $0/month | 4% + 40¢ US, +1.5% intl, +0.5% subs | — |
| Maturity | ✅ 10+ saal, SaaS standard | 🟡 naya (startup credits milte hain) | — |
| $99/mo par fee | ≈ $5.45 (tax/compliance/fraud/support included) | ≈ $6 (intl card + subs fee) | — |

**Decision: Paddle.** Global market priority hai, UPI 2026 me support ho gaya, docs mature hain, aur MoR hone se GST/VAT ka zero kaam. Dodo backup option rahega (cheaper + India-DNA, par naya hai).

## 2. Pricing mapping (PRD §54)

| Plan | Price | Paddle me | App me |
|---|---|---|---|
| Trial | 14 din free | free-trial period on price (ya app-side gate) | `subscriptions.status='trialing'`, org create par auto (already hai) |
| Standard | **$99/mo** | recurring price USD + **INR override** (UPI Autopay cap ₹15,000/renewal se neeche rakho) | `plan_name='Standard'`, 25 suppliers limit enforce karna hai |
| Growth | $149–199/mo | BAAD ME (jab pilot bole) | — |
| Founding | manual | koi price nahi | `status='founding'` — already supported, bypass sab gates |

INR override Paddle dashboard me set hoga (purchasing-power-adjusted, renewal < ₹15,000 taaki UPI Autopay toote nahi).

## 3. Architecture (existing abstraction me plug-in)

- `lib/billing/provider.ts` ka `BillingProvider` interface **same rahega** — sirf `PaddleBillingProvider` class add hogi (`BILLING_PROVIDER=paddle` par active, default `manual` pilot ke liye).
- SDK: `@paddle/paddle-node` (1 dependency). Hosted checkout → **koi frontend payment SDK nahi** (MVP me card details hamare page par kabhi nahi aate = PCI scope zero).
- Flows:
  1. **Upgrade** → server action Paddle transaction banata hai → hosted checkout URL → redirect. Success par webhook state sync karta hai.
  2. **Manage** → customer portal session → redirect (cancel/upgrade/downgrade/payment-method sab Paddle sambhalta hai).
  3. **Webhook** `POST /api/billing/webhook` → raw body + `Webhooks.verifySignature` → events: `subscription.created/updated/canceled`, `transaction.completed` → `subscriptions` row upsert + audit event (`subscription_updated` — audit type add hoga).
- Migration (chhoti, idempotent): `subscriptions.provider_subscription_id text`, `subscriptions.cancel_at_period_end bool default false`.
- Env (`.env.example` me add): `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_ENV=sandbox|production`, `PADDLE_PRICE_STANDARD_USD`, `PADDLE_PRICE_STANDARD_INR`.

## 4. Enforcement rules (data kabhi lock nahi hoga)

- Trial valid / `active` / `founding` → sab kuch.
- Trial expired ya `canceled` (period end ke baad) ya `past_due` 7-day grace ke baad → **naye reconciliation / run / upload block** + Upgrade CTA. History, results, exports **hamesha readable** (finance trust).
- 25-supplier limit Standard par (count check `createSupplierAction` me).
- `past_due` me banner: "payment failed — update payment method" (portal link).

## 5. Paddle dashboard setup (tumhara kaam, ~30 min, code ke baad)

1. paddle.com → account → sandbox mode.
2. Catalog → Product "Standard" → monthly recurring price USD 99 + INR override (< ₹15,000).
3. Checkout settings → **UPI on** (India ke liye).
4. Developer tools → API key + webhook endpoint `https://<app>/api/billing/webhook` (+ secret) — events: subscription + transaction.
5. Sandbox test: card + UPI test flow (Paddle docs guide), webhook.site se pehle verify.
6. Production me jaane se pehle: business verification (Paddle maangta hai — MoR ka rule, Stripe se aasan kyunki tax tumhe nahi bharna).

## 6. Implementation phases (code, is order me)

1. **Provider + webhook**: migration, `PaddleBillingProvider`, `/api/billing/webhook` + signature verify + upsert + audit type.
2. **Checkout UI**: billing page par plan card (status/trial days), Upgrade button → action → redirect; success/cancel return states.
3. **Portal**: Manage billing button (owner-only).
4. **Gates**: trial/past_due/cancel checks in create/run/upload + supplier limit + banners.
5. **Sandbox E2E**: trial → checkout → active → cancel → past_due paths, RLS re-check (sub row sirf apne org ka).

## 7. Acceptance criteria

- Sandbox me $0 kharch pe poora cycle: signup → trial → checkout → active → portal cancel → canceled gate.
- Webhook signature fail → 400, replay same event → idempotent (duplicate upsert nahi).
- India test: INR price + UPI visible; renewal < ₹15,000.
- `BILLING_PROVIDER=manual` par pilot flow bilkul unchanged.
- Rate limit webhook route par (60/min/IP, existing helper).

## Log
- 2026-09-24: plan created (Paddle recommended, Dodo alternative). Gateway confirm hote hi Phase 1 shuru.
- 2026-09-24: **Paddle locked (user confirmed).** Ready for Phase 1 implementation.
