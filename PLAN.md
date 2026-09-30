# Fix Plan — Supplier Statement Reconciliation SaaS (PRD gap closure)

> Source of truth: `Supplier Statement Reconciliation SaaS.md` (86 sections).
> Rule: subscriptions/billing Rel (§53–54) baad me — pehle saare bugs/gaps one-by-one.
> Status values: `TODO` · `IN_PROGRESS` · `DONE` · `BLOCKED (user)` · `LATER`

## Fix 1 — Login runtime error (`unexpected response from server`)
- PRD: §52 auth must work (§79 acceptance: authentication works)
- Plan: kill stale dev server, delete `.next`, fresh restart, verify `GET /login` 200.
- Status: `BLOCKED (user)`
- Verified: server-side done 2026-09-24 — old dev (PID 23496) killed, `.next` removed, fresh `next dev` on :3000, `/login` → 200. User must hard-refresh (Ctrl+Shift+R) old tab and confirm the browser error is gone.

## Fix 2 — Results table: sorting + search (§34)
- Have: type filter + tabs + pagination. Missing: sort (ref/amount/date) + text search.
- Plan: URL params `q`, `sort`, `dir` on `app/(app)/reconciliations/[id]/page.tsx` + toolbar UI.
- Status: `DONE`
- Verified: 2026-09-24 — `ResultToolbar` (search + sort + dir + clear) added, `TypeFilter` preserves params, page supports `?q=&sort=ref|amount|date&dir=` with 5,000-row in-memory cap + notice, `N of M` counts, pagination carries params. Full `lint/typecheck/build` at final step.

## Fix 3 — Complete-confirmation summary (§38)
- Plan: `ExportButtons` shows Exact / Resolved / Unresolved counts + "Complete anyway?" confirm step when unresolved > 0.
- Status: `DONE`
- Verified: 2026-09-24 — two-step confirm panel with Exact/Resolved/Ignored/Unresolved counts + "Complete anyway?" when unresolved > 0, "safe to complete" when clean. Full checks at final step.

## Fix 4 — History shows who completed (§39)
- Plan: reconciliations list + results header show `Completed {date} by You / a team member` (RLS-safe: fellow member names not readable, only own id comparable).
- Status: `DONE`
- Verified: 2026-09-24 — `completed_by`/`created_by` selected, RLS-safe "by you / by a team member" labels on results header + history Completed column. Full checks at final step.

## Fix 5 — Dashboard per PRD (§41)
- Plan: cards → Suppliers / Reconciliations This Month / Pending / Unresolved Exceptions; table → Supplier, Period, Status, Exception count, Updated, Owner (You / Team member).
- Status: `TODO`
- Verified: _pending_

## Fix 6 — Supplier saved mapping profile link (§42)
- Plan: supplier rows show saved statement/ledger profile counts + link; wizard already auto-applies latest profile.
- Status: `TODO`
- Verified: _pending_

## Fix 7 — Wizard refresh recovery (§57 "state recoverable once committed")
- Plan: persist unsaved side state (table+mapping+options) to localStorage per reconciliation; restore on mount; quota-guarded.
- Status: `DONE`
- Verified: 2026-09-24 — versioned localStorage drafts per recon+side, mount-restore (SSR-safe), 500ms debounced persist, auto-clear on save/run, 2MB cap, "draft restored" notice. PreviewStep recomputes from restored table. Full checks at final step.

## Fix 8 — Observability wiring (§68) + `mapping_profile_reused` event (§72)
- Plan: call `logEvent` in run/complete/accept/reject/export ops (ids+counts+duration only); emit `mapping_profile_reused` audit when wizard applies a saved profile.
- Status: `DONE`
- Verified: 2026-09-24 — `logEvent` in saveDataset/run(+engine-failure error)/accept/reject/manual/resolve/complete/reopen/export; new `recordMappingReuse` op + `recordMappingReuseAction`, wizard emits it best-effort on profile apply. Full checks at final step.

## Fix 9 — Parse-layer unit tests (§59/§77)
- Plan: `tests/parse.test.ts` — oversized file, bad extension, HTML-spoof MIME, empty CSV, too-many-rows, `MAX_FILE_BYTES`/`MAX_ROWS` constants.
- Status: `DONE`
- Verified: 2026-09-24 — 12/12 pass (`npx vitest run tests/parse.test.ts`); also wrapped raw pdfjs failures into `ParseError("parse_failed")`, scanned PDFs stay `scanned_pdf`. XLSX round-trip + empty-sheet covered; PDF table logic covered via mocked pdfjs-dist.

## Fix 10 — Rate limiting (§64)
- Plan: `lib/rate-limit.ts` in-memory sliding window; enforce in `signInAction`/`signUpAction` (+ export route) per IP; document single-instance limitation.
- Status: `DONE`
- Verified: 2026-09-24 — `lib/rate-limit.ts` (in-memory sliding window, proxy-aware IP, single-instance limit documented); sign-in 10/min/IP, sign-up 5/10min/IP, run 30/10min/org, export 60/min/IP → 429 + Retry-After. No unit test possible (`server-only` guard blocks vitest import) — covered by lint/typecheck/build + review. Full checks green (below).

## Manual E2E checklist (§79 flows 1–4, §76)
- Not a code bug — user runs with `tests/fixtures/*.csv` after fixes. Status: `TODO (manual)`

## Final verification — 2026-09-24 (all fixes)
- `npm run lint` ✅ (0 errors; 1 justified `set-state-in-effect` disable for localStorage restore)
- `npm run typecheck` ✅
- `npx vitest run` ✅ 74/74 (62 existing + 12 new parse tests)
- `npm run build` ✅ 17 routes

## LATER (subscriptions ke saath)
- Real `BillingProvider` (Stripe/Paddle), pricing/limits enforcement (§53–54), production deploy (§51), a11y audit (§70).

## Log
- 2026-09-24: plan created; fixes start with Fix 1.
- 2026-09-24: Fix 1–10 all DONE + verified (lint/typecheck/74 tests/build green). Open: user browser confirm for login (hard refresh), manual E2E with fixtures, subscriptions later.
- 2026-09-24: **Deploy audit DONE.** Pending tha: (a) login browser confirm — ab bhi user ke paas; (b) manual E2E — DEPLOY.md post-deploy checks me; (c) subscriptions — locked (Paddle), implementation baaki. Code/config me koi blocker nahi mila (CSP+headers pehle se, koi TODO/hardcode nahi). Fresh `next build` ✅ + prod smoke 16/16 ✅ (export API ka 307 proxy-intended hai). Supabase live ✅ 13/13, anon 0 rows, auth 200. DEPLOY.md banaya (Vercel CLI fastest, env table, Supabase URL steps). Temp scripts deleted; :3100 server shutdown.
