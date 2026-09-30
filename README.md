# Supplier Statement Reconciliation SaaS

B2B SaaS that compares a **supplier statement** against your **AP ledger export** and surfaces matched invoices, amount mismatches, missing entries, duplicates, and probable reference typos — deterministically, with a full audit trail.

Built per the PRD in this folder (`Supplier Statement Reconciliation SaaS.md`).

## Stack

- **Next.js 16** (App Router, Turbopack) · **React 19** · **TypeScript**
- **Tailwind CSS v4** · hand-rolled shadcn-style components
- **Supabase** (Auth + PostgreSQL + Row Level Security)
- **Vitest** for unit tests
- Client-side parsing: PapaParse (CSV), SheetJS (XLSX), PDF.js (text PDFs)
- Decimal-safe money math via `decimal.js` · matching is pure & deterministic (no LLM)

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in Supabase values (see creds.txt)
npm run dev                  # http://localhost:3000
```

### Database

Run `supabase/schema.sql` in the Supabase SQL Editor (or via `psql`) against a clean project. It creates all tables, enums, indexes, RLS policies, helper functions, triggers, and the append-only audit guard.

Optionally: `node scripts/apply-schema.mjs` with `SUPABASE_DB_URL` set.

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm start` | Serve production build |
| `npm test` | Run unit tests (Vitest) |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| `npm run lint` | ESLint |

## Environment

See `.env.example`. Required:

```
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
BILLING_PROVIDER=manual
```

Never commit `.env.local` or `creds.txt`.

## Architecture

```
lib/engine/     Pure deterministic matching engine (unit-tested)
lib/parse/      Client-side file parsing + normalization + validation
lib/server/     Server operations (dataset save, run, review, complete)
lib/supabase/   Browser / server (SSR) / admin (service-role) clients
lib/dal.ts      Data Access Layer — requireUser / requireOrg / requireOwner
app/actions/    Server Actions (auth, org, suppliers, reconciliations, matches, settings)
app/(app)/      Authenticated UI (dashboard, suppliers, reconciliations, settings)
supabase/       schema.sql — full RLS-enabled schema
proxy.ts        Next.js 16 proxy — session refresh + optimistic auth redirects
```

### Matching passes (PRD §23–§33)

1. **Exact** — normalized reference + amount (currency compatible) → auto-confirmed
2. **Amount mismatch** — same reference, different amounts (or currency clash)
3. **Duplicates** — repeated references within each source (never collapsed)
4. **Probable** — equal amount + Damerau–Levenshtein similarity ≥ 0.75 + 30-day window → **never auto-accepted**
5. **Missing in ledger** — unmatched statement rows
6. **Missing on statement** — unmatched ledger rows

Every transaction appears in exactly one match (invariant enforced by `assertCoverage`).

## Privacy

- Files are parsed **in the browser**; only normalized rows (raw + normalized fields) are uploaded.
- Raw cell values are preserved in `source_transactions.raw_data`.
- CSV exports are formula-injection safe (PRD §78).

## Testing

62 unit tests cover reference normalization, amount parsing, date parsing, all six matching passes, credits, currency mismatch, CSV injection, and the PRD §75 fixture.
