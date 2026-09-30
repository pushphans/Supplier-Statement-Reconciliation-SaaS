# Product Requirements Document

## Supplier Statement Reconciliation SaaS

**Document Status:** Build-ready
**Product Type:** B2B Finance SaaS
**Primary Market:** Accounts Payable teams, finance managers, bookkeepers, manufacturers, distributors and businesses processing recurring supplier statements
**Business Model:** Recurring subscription
**Initial Budget Constraint:** $0 infrastructure spend until revenue
**Core Principle:** Deterministic financial reconciliation rather than AI guesswork

---

# 1. PRODUCT SUMMARY

Supplier Statement Reconciliation is a focused B2B SaaS application that compares:

**a supplier statement**

against

**the company's Accounts Payable ledger/export**

and automatically identifies:

* matched invoices,
* missing invoices,
* missing ledger entries,
* amount mismatches,
* duplicate entries,
* unmatched credits,
* probable invoice-reference mismatches.

The product replaces repetitive Excel-based supplier statement reconciliation.

The product does NOT attempt to become accounting software.

Core promise:

> "Upload the supplier statement and AP ledger. See every mismatch immediately."

---

# 2. PRODUCT PROBLEM

Accounts Payable teams frequently receive supplier statements containing dozens or hundreds of transactions.

An employee then:

1. exports their internal AP ledger,
2. opens both files,
3. matches invoice references,
4. compares amounts,
5. looks for missing invoices,
6. finds missing credits,
7. investigates discrepancies,
8. prepares an exception list.

This work is repetitive and error-prone.

Existing enterprise reconciliation tools can be broader and more expensive than a small finance team needs.

The opportunity is a simple, repeatable workflow:

**Two files → reconciliation → exceptions**

---

# 3. PRODUCT VISION

The product should become the fastest way for a small finance/AP team to answer:

> "Does our AP ledger agree with this supplier's statement?"

A typical monthly reconciliation should take minutes rather than extensive manual spreadsheet work.

---

# 4. PRODUCT PRINCIPLES

## 4.1 One financial workflow

The product reconciles supplier statements against AP ledger data.

Nothing more.

## 4.2 Deterministic before AI

Financial reconciliation must not rely on an LLM making uncontrolled assumptions.

Matching must be explainable.

Every matched record needs a clear reason.

## 4.3 User controls ambiguous matches

High-confidence matches may be automatic.

Low-confidence matches require explicit user confirmation.

Never silently invent matches.

## 4.4 Preserve source values

Always retain:

* raw source invoice reference,
* raw amount,
* raw date,
* normalized representation.

Do not overwrite raw data during normalization.

## 4.5 Privacy by design

Where feasible, parse files in the browser.

Only structured normalized records required for reconciliation should be transmitted to the backend.

Raw source files should not be stored by default.

---

# 5. TARGET CUSTOMER

Primary customers:

* Accounts Payable teams,
* finance departments,
* bookkeepers,
* wholesalers,
* distributors,
* manufacturers,
* multi-location businesses,
* companies with recurring vendor statements.

Good customer profile:

* 20+ regular suppliers,
* hundreds or thousands of monthly AP transactions,
* reconciliation currently done using Excel,
* finance employee spending recurring time matching statements.

---

# 6. PERSONAS

## 6.1 AP Clerk

Needs:

* upload files,
* resolve exceptions,
* produce reconciliation report.

## 6.2 Finance Manager

Needs:

* review reconciliation,
* see unresolved exceptions,
* know who completed reconciliation,
* maintain evidence/audit history.

## 6.3 Organization Owner/Admin

Needs:

* manage users,
* organization settings,
* billing,
* data retention.

---

# 7. JOB TO BE DONE

Primary JTBD:

> When a supplier sends a monthly statement, compare it with my AP ledger and show me exactly which transactions require investigation.

---

# 8. PRODUCT GOALS

MVP goals:

* reduce manual matching,
* produce explainable results,
* identify financially relevant discrepancies,
* remember recurring file layouts,
* maintain reconciliation history,
* create audit trail,
* provide exportable exception reports,
* operate without paid AI/OCR dependencies.

---

# 9. NON-GOALS

Do NOT implement in MVP:

* accounting software,
* general ledger,
* invoice approval,
* payments,
* expense management,
* bank reconciliation,
* purchase orders,
* tax filing,
* ERP,
* cash-flow forecasting,
* invoice OCR service,
* accounts receivable,
* bookkeeping automation,
* AI chat assistant.

---

# 10. CORE USER FLOW

1. User signs in.
2. User chooses supplier.
3. User creates new reconciliation.
4. User uploads supplier statement.
5. User uploads AP ledger export.
6. Application parses both.
7. User maps columns.
8. Application shows normalization preview.
9. User starts reconciliation.
10. Matching engine runs.
11. Results appear grouped by category.
12. User reviews probable matches.
13. User resolves exceptions or adds notes.
14. User marks reconciliation completed.
15. User exports results.

---

# 11. SUPPORTED INPUT TYPES

MVP:

* CSV
* XLSX
* text-based PDF supplier statements

Explicitly out of scope for initial MVP:

* scanned/image-only PDFs,
* photographs,
* handwritten documents.

If a PDF contains no extractable text, display:

> This PDF appears to be scanned. Scanned-statement OCR is not supported yet. Please upload CSV/XLSX or a text-based PDF.

Do not automatically call a paid OCR provider.

---

# 12. PRIVACY-FIRST FILE PROCESSING

Whenever technically reasonable:

### CSV/XLSX

Parse client-side.

### PDF

Use an open-source browser PDF parser for text extraction.

The backend should primarily receive normalized transaction records.

Raw files:

* should not be stored by default,
* may be retained temporarily only if explicitly required,
* must have documented deletion lifecycle.

This substantially reduces:

* storage cost,
* privacy risk,
* breach impact.

---

# 13. FILE SIZE LIMIT

MVP recommended:

20 MB/file.

Apply:

* MIME validation,
* extension validation,
* parser error handling,
* row-count guardrails.

Never execute:

* formulas,
* macros,
* scripts,
* embedded content.

---

# 14. SUPPLIER STATEMENT LOGICAL FIELDS

Required:

* invoice/reference number
* amount

Strongly recommended:

* transaction date

Optional:

* due date
* currency
* transaction type
* description
* debit
* credit
* balance

---

# 15. AP LEDGER LOGICAL FIELDS

Required:

* invoice/reference number
* amount

Strongly recommended:

* invoice date

Optional:

* supplier code
* supplier name
* due date
* currency
* payment status
* document type
* description

---

# 16. COLUMN MAPPING

Users must not need to modify their spreadsheet.

Example supplier statement:

```text
Document No
Document Date
Debit
Credit
Balance
```

Mapped to:

```text
Invoice Reference
Transaction Date
Debit Amount
Credit Amount
Balance
```

Mapping screen displays:

* source field,
* sample values,
* target field,
* required/optional indicator.

---

# 17. SAVED MAPPING PROFILES

Mappings should be reusable.

Examples:

* "ABC Steel monthly statement"
* "QuickBooks AP export"
* "SAP vendor ledger"
* "Tally export"

Mapping profiles belong to the organization.

Supplier-specific statement mappings may automatically be suggested next time.

---

# 18. DATA NORMALIZATION

Each source transaction should contain:

### Raw fields

Original values exactly as imported.

### Normalized fields

Canonical values used for matching.

Never discard the raw value.

---

# 19. INVOICE REFERENCE NORMALIZATION

Example:

Raw:

`INV- 00123 / A`

Normalized:

`INV00123A`

Initial canonical normalization may:

* trim whitespace,
* uppercase,
* normalize Unicode,
* remove common separators,
* normalize repeated spaces.

Do NOT remove arbitrary alphanumeric characters.

Store:

`raw_reference`

and

`normalized_reference`

---

# 20. AMOUNT NORMALIZATION

All amounts should be stored using fixed-precision decimal/numeric types.

Never use JavaScript floating-point arithmetic as authoritative financial storage.

Normalize:

* thousands separators,
* decimal separators when known,
* debit/credit conventions,
* negative amounts.

Example:

`1,250.50`

→

`1250.50`

---

# 21. DATE NORMALIZATION

Parse dates only when format can be identified confidently.

Mapping profile may store format such as:

* DD/MM/YYYY
* MM/DD/YYYY
* YYYY-MM-DD

Ambiguous dates must trigger validation rather than silent guessing.

---

# 22. CURRENCY

Every reconciliation has a currency context.

If both files contain currency:

* compare currencies.

If one does not:

* user selects reconciliation currency.

Records with conflicting currencies must not automatically match.

---

# 23. MATCHING ENGINE

The engine should run deterministic passes.

Matching order matters.

---

# 24. PASS 1 — EXACT MATCH

Criteria:

* normalized invoice reference equal,
* amount equal within configured decimal precision,
* currency compatible.

Result:

**EXACT_MATCH**

This can be automatically accepted.

---

# 25. PASS 2 — REFERENCE MATCH / AMOUNT DIFFERENCE

Criteria:

* invoice reference matches,
* amount differs.

Result:

**AMOUNT_MISMATCH**

Display:

* supplier amount,
* ledger amount,
* variance.

Example:

```text
INV-102
Statement: $950
Ledger: $900
Difference: $50
```

---

# 26. PASS 3 — DUPLICATES

Detect duplicate references within each source.

Categories:

* duplicate_in_statement
* duplicate_in_ledger

Do not automatically collapse duplicates.

Show the user every source row.

---

# 27. PASS 4 — PROBABLE REFERENCE MATCH

For currently unmatched transactions only.

Candidate may be generated when:

* amounts are exactly equal,
* invoice references are extremely similar,
* dates are reasonably close.

Example:

Statement:

`INV-1089`

Ledger:

`INV-1098`

Same amount.

This may be a data-entry typo.

Result:

**PROBABLE_MATCH**

The system MUST NOT auto-accept it.

User actions:

* Accept Match
* Reject Match

---

# 28. FUZZY-MATCH SAFETY

Fuzzy matching is candidate generation only.

Never use fuzzy similarity alone to mark a financial record reconciled.

Candidate scoring may consider:

* reference similarity,
* amount equality,
* date proximity,
* same supplier.

Display reason:

> Same amount; invoice number differs by one character; dates are 2 days apart.

Explainability is mandatory.

---

# 29. PASS 5 — UNMATCHED STATEMENT ITEM

Statement transaction has no acceptable ledger match.

Category:

**MISSING_IN_LEDGER**

Typical meaning:

* invoice not entered,
* credit not entered,
* unknown transaction.

---

# 30. PASS 6 — UNMATCHED LEDGER ITEM

Ledger transaction has no acceptable supplier statement match.

Category:

**MISSING_ON_STATEMENT**

Possible explanations:

* timing difference,
* incorrect supplier,
* supplier statement period issue,
* internal duplicate.

---

# 31. CREDIT NOTES

Credit transactions must be supported.

Store transaction type:

* invoice,
* credit,
* unknown.

Negative values must be preserved correctly.

Do not convert credits into positive invoices.

---

# 32. MATCH STATUS MODEL

Possible statuses:

* exact_match
* probable_match
* manually_matched
* amount_mismatch
* missing_in_ledger
* missing_on_statement
* duplicate_statement
* duplicate_ledger
* ignored
* resolved

---

# 33. RECONCILIATION RESULTS SCREEN

Top summary:

* Statement Total
* Ledger Total
* Difference
* Total Transactions
* Exact Matches
* Exceptions
* Unresolved

Tabs:

### All

### Matched

### Amount Mismatches

### Missing in Ledger

### Missing on Statement

### Probable Matches

### Duplicates

---

# 34. RESULT TABLE

Columns:

* status
* statement reference
* statement date
* statement amount
* ledger reference
* ledger date
* ledger amount
* difference
* confidence/reason
* action

Must support:

* sorting,
* filtering,
* search,
* pagination.

---

# 35. PROBABLE MATCH REVIEW

Use side-by-side layout.

### Supplier Statement

Reference
Date
Amount

### AP Ledger

Reference
Date
Amount

Reason:

> Amount is identical and reference similarity is high.

Actions:

**Accept Match**

**Reject**

No hidden matching decisions.

---

# 36. EXCEPTION RESOLUTION

User may mark an exception:

* resolved,
* ignored,
* needs investigation.

User may attach a short note.

Example:

> Invoice received after AP export. Will enter next period.

All changes should appear in audit history.

---

# 37. MANUAL MATCH

Users should be able to manually pair:

one unmatched statement transaction

with

one unmatched ledger transaction.

Before confirmation show both values.

After confirmation:

status = `manually_matched`

Record:

* user,
* timestamp,
* original records.

---

# 38. COMPLETING A RECONCILIATION

A reconciliation may be marked Complete even if exceptions remain.

Before completing display:

```text
Exact matches: 182
Resolved exceptions: 7
Unresolved exceptions: 3
```

Confirmation:

> 3 exceptions remain unresolved. Complete reconciliation anyway?

---

# 39. RECONCILIATION HISTORY

For each supplier display:

* period,
* completed date,
* completed by,
* statement total,
* ledger total,
* exceptions,
* unresolved count.

Example:

```text
August 2026    Completed    2 unresolved
July 2026      Completed    0 unresolved
June 2026      Completed    5 resolved
```

---

# 40. EXPORT

Allow export of:

### Full reconciliation CSV

and

### Exceptions-only CSV

Export fields should include:

* reconciliation,
* supplier,
* status,
* statement reference,
* statement date,
* statement amount,
* ledger reference,
* ledger date,
* ledger amount,
* difference,
* resolution,
* note.

PDF reports are optional future functionality.

Do not block MVP on PDF generation.

---

# 41. DASHBOARD

Dashboard focuses on recurring reconciliation work.

Cards:

* Suppliers
* Reconciliations This Month
* Pending Reconciliations
* Unresolved Exceptions

Recent table:

* Supplier
* Period
* Status
* Exception Count
* Updated
* Owner

---

# 42. SUPPLIERS

Users can create supplier records manually.

Fields:

* supplier name
* supplier code
* default currency
* notes
* saved statement mapping profile

A supplier is primarily organizational metadata.

Do not build vendor lifecycle management.

---

# 43. ORGANIZATION MODEL

Multi-tenant entities:

* users
* organizations
* organization_members
* suppliers
* mapping_profiles
* reconciliations
* source_datasets
* source_transactions
* reconciliation_matches
* exception_resolutions
* audit_events
* subscriptions

Every business record must belong to one organization.

---

# 44. USER ROLES

MVP:

## OWNER

Can:

* manage organization,
* invite members,
* manage billing,
* access all reconciliations,
* delete organization.

## MEMBER

Can:

* create reconciliations,
* upload data,
* review matches,
* resolve exceptions,
* export results.

No complex custom permissions.

---

# 45. RECOMMENDED DATABASE SCHEMA

Use Supabase PostgreSQL.

## profiles

* id
* full_name
* created_at

## organizations

* id
* name
* default_currency
* timezone
* created_at

## organization_members

* organization_id
* user_id
* role
* created_at

## suppliers

* id
* organization_id
* supplier_code
* name
* default_currency
* notes
* created_at
* updated_at

## mapping_profiles

* id
* organization_id
* supplier_id nullable
* source_type
* name
* mapping JSONB
* normalization_options JSONB
* created_at
* updated_at

`source_type`:

* statement
* ledger

## reconciliations

* id
* organization_id
* supplier_id
* period_start nullable
* period_end nullable
* currency
* status
* statement_total
* ledger_total
* total_difference
* created_by
* completed_by nullable
* completed_at nullable
* created_at
* updated_at

Statuses:

* draft
* processing
* review
* completed

## source_datasets

* id
* organization_id
* reconciliation_id
* type
* original_filename
* row_count
* mapping_snapshot JSONB
* created_at

Type:

* supplier_statement
* ap_ledger

## source_transactions

* id
* organization_id
* reconciliation_id
* dataset_id
* source_row_number
* raw_reference
* normalized_reference
* transaction_date
* amount NUMERIC
* currency
* transaction_type
* raw_data JSONB
* created_at

## reconciliation_matches

* id
* organization_id
* reconciliation_id
* statement_transaction_id nullable
* ledger_transaction_id nullable
* match_type
* confidence_score nullable
* reason
* difference_amount nullable
* user_confirmed
* created_at
* updated_at

## exception_resolutions

* id
* organization_id
* match_id
* status
* note
* resolved_by
* resolved_at

## audit_events

Same general pattern as first product.

## subscriptions

Provider-agnostic subscription state.

---

# 46. FINANCIAL DATA TYPES

Critical requirement:

PostgreSQL `NUMERIC/DECIMAL` must be used for stored monetary values.

Do not use:

* float,
* real,
* binary floating-point

for authoritative financial amounts.

On the frontend, values may be formatted for display but reconciliation calculations must use decimal-safe arithmetic.

---

# 47. DATABASE RLS

Enable Row Level Security for all tenant-owned tables.

Policy rule:

A user can access a row only when the row's `organization_id` belongs to an organization in `organization_members` for that authenticated user.

Do not trust:

* organization ID sent by frontend,
* hidden input fields,
* URL alone.

Authorization must be enforced server/database-side.

---

# 48. SCHEMA DELIVERABLE

Create:

`supabase/schema.sql`

The file must be sufficient to initialize a clean Supabase project.

Include:

* tables,
* foreign keys,
* indexes,
* RLS,
* RLS policies,
* constraints,
* enums/check constraints,
* required functions.

---

# 49. FRONTEND TECH STACK

* Next.js 16
* React 19
* TypeScript
* Tailwind CSS v4
* shadcn/ui or comparable open-source components
* React Hook Form
* Zod

Parsing libraries:

* open-source CSV parser,
* open-source XLSX parser,
* PDF.js or similar open-source library for text PDFs.

No paid document extraction service.

---

# 50. BACKEND

Use:

* Next.js server routes/server actions where appropriate,
* Supabase Auth,
* Supabase PostgreSQL.

Raw files should generally remain client-side.

This makes backend needs relatively small.

---

# 51. HOSTING

Use zero-cost-compatible deployment such as:

* Cloudflare Workers / Pages for web application,
* Supabase Free during validation.

Architecture must not depend on a paid always-on server.

---

# 52. AUTHENTICATION

Use Supabase Auth.

MVP login options:

* email/password or magic link,
* optional Google login if simple.

Do not build custom password infrastructure.

---

# 53. BILLING ARCHITECTURE

Create provider-independent interface:

`BillingProvider`

Responsibilities:

* create checkout,
* customer portal,
* webhook verification,
* subscription state synchronization.

Private pilot must work without payment integration using manually assigned founding plans.

Do not make billing provider availability block product validation.

---

# 54. PRICING TO TEST

Potential pricing:

### Trial

14 days.

### Standard

**$99/month**

Suggested usage:

* up to 25 suppliers,
* reasonable monthly reconciliation volume,
* multiple team members.

### Growth

Future:

**$149–$199/month**

For:

* additional suppliers,
* higher transaction volumes,
* more retention/history.

Exact limits should be adjusted based on pilot usage.

---

# 55. UI / UX DIRECTION

Finance product design should feel:

* trustworthy,
* precise,
* quiet,
* clean,
* spreadsheet-familiar,
* easy to scan.

Avoid:

* excessive gradients,
* cartoon illustrations,
* unnecessary animations,
* flashy AI branding.

Financial discrepancies should be visually obvious.

---

# 56. MAIN NAVIGATION

* Dashboard
* Reconciliations
* Suppliers
* Settings

Settings:

* Organization
* Team
* Billing
* Data & Privacy

Do not create more navigation than necessary.

---

# 57. CREATE RECONCILIATION WIZARD

Use a clear stepper:

### Step 1

Choose Supplier

### Step 2

Upload Supplier Statement

### Step 3

Map Statement Columns

### Step 4

Upload AP Ledger

### Step 5

Map Ledger Columns

### Step 6

Review Data

### Step 7

Run Reconciliation

Keep state recoverable so browser refresh does not destroy completed configuration once committed.

---

# 58. DATA PREVIEW

Before matching show approximately first 20 rows.

Display:

* reference,
* date,
* amount.

Show warnings such as:

* 7 rows missing invoice reference,
* 3 invalid amounts,
* ambiguous date format,
* duplicate references detected.

User must resolve blocking errors before continuing.

---

# 59. BLOCKING VS NON-BLOCKING ERRORS

Blocking:

* no invoice reference column,
* no amount column,
* invalid file,
* zero valid transactions,
* inconsistent currency with no resolution.

Non-blocking:

* missing date,
* duplicate references,
* blank descriptions,
* unsupported optional columns.

---

# 60. MATCH EXPLAINABILITY

Each match must answer:

> Why did the system match these two transactions?

Examples:

* Exact normalized reference + exact amount.
* Exact reference; amount differs by $50.
* Same amount; reference differs by one character; user confirmation required.
* No corresponding ledger entry found.

Do not expose meaningless opaque confidence numbers without explanation.

---

# 61. MATCHING CONFIGURATION

Initially expose very little configuration.

Organization defaults:

### Amount tolerance

Default:

`0.00`

Optional future:

`0.01`

### Date candidate window

Default:

30 days.

### Probable-match reference similarity

Keep implementation-defined but conservative.

Do not overwhelm users with algorithm settings.

---

# 62. MATCHING ENGINE ARCHITECTURE

Implement matching as pure/testable functions.

Example stages:

```text
parse
normalize
validate
index
exact match
amount mismatch detection
duplicate detection
candidate generation
unmatched classification
summary
```

Do not intertwine UI with matching logic.

Matching engine should be independently unit-testable.

---

# 63. MATCHING PERFORMANCE

Target:

10,000 + 10,000 transaction rows should not require O(n²) brute-force matching.

Use maps/indexes such as:

* normalized reference → transaction IDs
* amount → unmatched candidates

Exact matching should be near O(n).

Fuzzy matching should run only on narrowed candidate sets.

---

# 64. SECURITY

Finance data is sensitive.

Implement:

* strict tenant isolation,
* HTTPS,
* secure authentication,
* server authorization,
* Content Security Policy,
* rate limiting,
* secure headers,
* input validation,
* escaped output,
* safe file parsing,
* audit logs,
* least-privilege credentials,
* no secrets in client code.

---

# 65. RAW FILE SECURITY

Preferred:

do not upload raw source files to backend.

If future functionality requires storage:

* private bucket,
* organization-isolated paths,
* signed URLs,
* short retention,
* no public bucket,
* explicit deletion.

---

# 66. DATA RETENTION

Provide organization settings for:

* deleting reconciliation,
* deleting supplier,
* deleting organization,
* exporting reconciliation data.

Initial recommendation:

retain structured completed reconciliation records until organization deletes them.

Raw imported files should not be retained by default.

---

# 67. AUDIT TRAIL

Record:

* reconciliation created,
* dataset imported,
* match manually accepted,
* probable match rejected,
* exception resolved,
* reconciliation completed,
* reconciliation reopened,
* data exported,
* user invited/removed,
* organization deleted.

Audit events must be append-only from normal application UI.

---

# 68. OBSERVABILITY

Implement structured logs.

Include:

* request ID,
* reconciliation ID,
* organization ID,
* processing duration,
* transaction counts,
* non-sensitive error code.

Do not log:

* full financial datasets,
* uploaded documents,
* authentication tokens,
* secrets.

---

# 69. PERFORMANCE

Application should:

* parse common spreadsheets quickly,
* avoid sending unnecessary raw data to backend,
* paginate reconciliation tables,
* virtualize very large tables if required,
* avoid recalculating reconciliation on every UI change.

Persist reconciliation result.

---

# 70. ACCESSIBILITY

Requirements:

* keyboard usable,
* proper form labels,
* clear focus states,
* accessible tables,
* semantic status text in addition to color,
* readable contrast,
* clear validation messages.

---

# 71. RESPONSIVE DESIGN

Primary usage:

desktop/laptop.

Mobile should support:

* viewing dashboard,
* viewing reconciliation results,
* resolving simple exceptions.

Do not attempt full spreadsheet mapping UX on small phones unless practical.

---

# 72. INTERNAL PRODUCT ANALYTICS

Track minimally:

* signup_completed
* supplier_created
* reconciliation_started
* reconciliation_completed
* mapping_profile_reused
* probable_match_reviewed
* report_exported

Avoid invasive third-party tracking during MVP.

---

# 73. API / SERVER OPERATIONS

Conceptual endpoints:

### Suppliers

`GET /api/suppliers`

`POST /api/suppliers`

`PATCH /api/suppliers/:id`

### Reconciliation

`POST /api/reconciliations`

`GET /api/reconciliations/:id`

`POST /api/reconciliations/:id/datasets`

`POST /api/reconciliations/:id/run`

`POST /api/reconciliations/:id/complete`

### Matches

`POST /api/matches/:id/accept`

`POST /api/matches/:id/reject`

`POST /api/matches/manual`

### Exceptions

`PATCH /api/exceptions/:id`

### Export

`GET /api/reconciliations/:id/export`

Actual implementation may use Server Actions where appropriate, but authorization and validation requirements remain identical.

---

# 74. ENVIRONMENT VARIABLES

Example:

```text
NEXT_PUBLIC_APP_URL=

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

BILLING_PROVIDER=
BILLING_API_KEY=
BILLING_WEBHOOK_SECRET=
```

Add provider-specific variables only when billing integration is enabled.

Provide `.env.example`.

Never commit production secrets.

---

# 75. TEST DATA

Repository should contain synthetic fixtures.

Example statement:

```text
invoice,date,amount
INV-1001,2026-09-01,500.00
INV-1002,2026-09-02,750.00
INV-1003,2026-09-03,900.00
INV-1005,2026-09-05,-100.00
```

Ledger:

```text
invoice,date,amount
INV1001,2026-09-01,500.00
INV-1002,2026-09-02,700.00
INV-1004,2026-09-04,300.00
INV-1005,2026-09-05,-100.00
```

Expected:

* INV-1001 → Exact Match
* INV-1002 → Amount Mismatch
* INV-1003 → Missing In Ledger
* INV-1004 → Missing On Statement
* INV-1005 → Exact Credit Match

---

# 76. TESTING REQUIREMENTS

## Unit tests

Mandatory:

* invoice normalization,
* amount parsing,
* date parsing,
* exact matching,
* amount mismatch,
* duplicate detection,
* probable candidate generation,
* credit matching,
* currency mismatch,
* summary calculation.

## Property / invariant tests where practical

Examples:

* every transaction belongs to at most one accepted reconciliation match unless explicitly modeled otherwise,
* total classified transactions equals input transaction counts,
* accepted match cannot reference transactions from another organization.

## Integration tests

* RLS isolation,
* reconciliation creation,
* persistence,
* manual match,
* exception resolution,
* export.

## E2E

### Flow 1

Sign up → supplier → upload statement → upload ledger → reconcile → results.

### Flow 2

Review probable match → accept → totals update.

### Flow 3

Resolve missing invoice → complete reconciliation → reopen history.

### Flow 4

Organization A user attempts Organization B reconciliation → denied.

---

# 77. SECURITY TESTS

Explicitly test:

* horizontal privilege escalation,
* altered organization ID,
* altered reconciliation ID,
* malicious CSV cells,
* XSS strings in supplier names,
* oversized files,
* unsupported MIME types,
* unauthorized exports,
* service-role key never present in browser bundle.

---

# 78. CSV FORMULA INJECTION

Exports must protect against spreadsheet formula injection.

If textual cells begin with characters such as:

* `=`
* `+`
* `-`
* `@`

and could be interpreted as formulas by spreadsheet software, sanitize/escape them appropriately during export.

Financial negative numbers should still remain valid numeric amounts.

Handle this carefully based on column type.

---

# 79. MVP ACCEPTANCE CRITERIA

MVP is complete only when:

* authentication works,
* multi-tenant organizations work,
* suppliers can be created,
* CSV statement upload works,
* XLSX statement upload works,
* CSV/XLSX ledger upload works,
* text PDF statements work,
* mapping UI works,
* mappings can be saved,
* normalized preview works,
* deterministic reconciliation engine works,
* exact matches work,
* amount mismatches work,
* missing entries work,
* duplicates work,
* probable matches require human confirmation,
* manual matching works,
* credits work,
* results are filterable,
* reconciliation can be completed,
* historical runs can be viewed,
* exceptions CSV can be exported,
* RLS prevents cross-organization access,
* audit trail works,
* application can run on free-tier-compatible infrastructure,
* `.env.example` exists,
* `supabase/schema.sql` exists,
* tests cover core financial matching rules.

---

# 80. IMPLEMENTATION PHASES

## Phase 1 — Foundation

* app setup,
* auth,
* organization,
* RLS,
* layout.

## Phase 2 — Supplier + file ingestion

* suppliers,
* CSV,
* XLSX,
* column mapping,
* saved mappings.

## Phase 3 — Normalization

* references,
* amounts,
* dates,
* currencies,
* validation.

## Phase 4 — Matching engine

* exact,
* amount mismatch,
* duplicates,
* unmatched,
* credits.

## Phase 5 — Review workflow

* result UI,
* probable matches,
* manual matches,
* resolution notes.

## Phase 6 — History/export

* reconciliation completion,
* history,
* CSV reports.

## Phase 7 — Text PDFs

* PDF.js extraction,
* mapping,
* error states.

## Phase 8 — Production hardening

* security,
* performance,
* accessibility,
* tests,
* audit logging,
* billing abstraction.

---

# 81. FUTURE FEATURES — DO NOT BUILD IN MVP

Potential later features:

* scanned PDF OCR,
* statement inbox ingestion,
* QuickBooks integration,
* Xero integration,
* NetSuite integration,
* SAP integration,
* automatic supplier statement collection,
* scheduled reconciliations,
* advanced many-to-many matching,
* split payments,
* payment allocation,
* AI-assisted exception explanations,
* shared external accountant access.

Only implement after customer evidence.

---

# 82. ZERO-COST DEVELOPMENT RULES

Do not introduce paid dependencies for:

* AI,
* OCR,
* file conversion,
* monitoring,
* parsing,
* queues,
* email,
* hosting.

Prefer:

* client-side parsing,
* open-source libraries,
* deterministic matching,
* Supabase free-tier services,
* Cloudflare free-tier hosting.

Once revenue exists, infrastructure may be upgraded based on actual bottlenecks.

---

# 83. FIRST PAID INFRASTRUCTURE PRIORITIES

When money arrives, prioritize reliability over shiny features.

Order:

1. production database plan with automatic backups,
2. monitoring/error tracking,
3. higher resource limits if needed,
4. OCR only if scanned PDF demand proves strong,
5. accounting integrations only when requested by paying customers.

---

# 84. PRODUCT SUCCESS METRICS

Primary:

* real reconciliation runs,
* reconciliations completed per month,
* recurring organizations,
* paying organizations,
* MRR,
* monthly churn.

Operational:

* average transactions per reconciliation,
* percentage automatically exact-matched,
* exceptions per reconciliation,
* probable matches accepted,
* time from upload to completion.

Primary customer-value metric:

> Percentage of transactions automatically classified without manual searching.

---

# 85. IMPLEMENTATION DIRECTIVE FOR AI CODING AGENT

The implementation agent MUST:

1. use this PRD as source of truth,
2. avoid scope not explicitly required,
3. not introduce an LLM for matching,
4. use deterministic financial rules,
5. preserve raw imported values,
6. use decimal-safe financial arithmetic,
7. require user confirmation for fuzzy matches,
8. enforce organization isolation at database level,
9. parse files client-side where practical,
10. avoid storing raw documents by default,
11. keep matching engine separated from UI,
12. create comprehensive automated tests,
13. create `supabase/schema.sql`,
14. create `.env.example`,
15. keep infrastructure compatible with zero-budget deployment,
16. favor correctness and explainability over cleverness.

If implementation decisions conflict, priority order is:

**financial correctness → security → explainability → simplicity → performance → visual polish.**

---

# 86. FINAL PRODUCT DEFINITION

The completed product should make this workflow possible:

A finance employee receives a supplier statement, uploads it together with their AP ledger export, maps the columns once, and receives an immediate explainable list of:

* what matches,
* what is missing,
* what differs,
* what looks suspicious,
* what still needs human review.

The employee resolves exceptions and exports a clean reconciliation record.

That is the product.

Do not turn it into accounting software.
