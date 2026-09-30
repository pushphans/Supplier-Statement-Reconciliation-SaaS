# Deploy Guide — Supplier Statement Reconciliation SaaS (Vercel)

> Pre-deploy verified 2026-09-24: `lint` ✅ · `typecheck` ✅ · `tests` 74/74 ✅ · `next build` ✅ (17 routes) · prod smoke 16/16 ✅ · Supabase live 13/13 tables, anon sees 0 rows, auth healthy ✅
> No git repo in folder — Option A needs none. Billing = `manual` (pilot); Paddle = SUBSCRIPTIONS_PLAN.md Phase 1+.

## Option A — fastest (Vercel CLI, no git needed)

```powershell
cd "C:\Users\pushp\Desktop\Supplier Statement Reconciliation SaaS\Supplier Statement Reconciliation SaaS"
npx vercel login        # browser me login/signup (ek baar)
npx vercel --prod       # env vars poochhega to neeche wali list dalna
```

## Option B — GitHub + Vercel dashboard

```powershell
cd "C:\Users\pushp\Desktop\Supplier Statement Reconciliation SaaS\Supplier Statement Reconciliation SaaS"
git init; git add -A; git commit -m "Pilot deploy"
# GitHub pe repo banao, push karo, vercel.com → Add New Project → Import
```

## Env vars (Vercel → Project → Settings → Environment Variables, Production)

| Key | Value kahan se |
|---|---|
| `NEXT_PUBLIC_APP_URL` | prod domain, e.g. `https://app-tumhara.vercel.app` (trailing slash nahi) |
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local` se copy |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` se copy |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` se copy (sirf server — kabhi `NEXT_PUBLIC_` mat banana) |
| `BILLING_PROVIDER` | `manual` |

`.env.local`, `creds.txt` kabhi commit/paste mat karna public jagah (`.gitignore` me hain).

## Supabase dashboard — manual steps (5 min, zaroori)

1. Project `ygxvmzkzohtuwrhovvzd` → **Authentication → URL Configuration**:
   - **Site URL** = prod domain (`https://app-tumhara.vercel.app`)
   - **Redirect URLs** me add: `https://app-tumhara.vercel.app/auth/callback`
   - (localhost entries rehne do — dev chalta rahega)
2. Save. Bas — schema/RLS/policies pehle se live hain, kuch chalane ki zaroorat nahi.

## Post-deploy checks (10 min)

1. `https://<domain>/signup` → account banao → onboarding → org banta hai?
2. Supplier add → reconciliation → `tests/fixtures/supplier-statement.csv` + `ap-ledger.csv` upload → run → results + export.
3. `/login` logout karke kholo — purana "unexpected response" error aaya to turant batao (dev me fresh restart ke baad 200 tha).
4. Vercel → Logs me `reconciliation_run` / `dataset_imported` JSON lines dikhengi (observability wired hai).

## Known limitations (deploy rokne wale nahi)

- **Rate limit in-memory hai** — Vercel serverless multi-instance par per-instance kaam karega (best-effort). Shared store (Redis) baad me, traffic badhne par.
- **CSP** `connect-src` me `*.supabase.co` allow hai — Supabase custom domain lagaya to `next.config.ts` update karna.
- **Billing manual** — trial gates enforce nahi hain; Paddle Phase 1 (SUBSCRIPTIONS_PLAN.md) deploy ke baad.
- **PDF** text-based hi (OCR explicitly non-goal, PRD §81).

## Redeploy

CLI: `npx vercel --prod` dobara. Dashboard: git push par auto-deploy.
