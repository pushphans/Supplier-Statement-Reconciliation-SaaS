# Tester guide — Supplier Statement Reconciliation SaaS

**App URL:** ____________________  **Tester:** ____________________  **Date:** ____________________

This guide is for a person testing the **deployed web app**, including someone unfamiliar with the codebase. Use **synthetic data only**. Record both whether a feature works and whether it would save time in a real accounts-payable workflow.

## What does this product do?

At month-end, a supplier sends a statement listing the invoices they believe a business owes. The business has its own accounts-payable (AP) ledger. Checking the two lists by hand is slow and error-prone. This app accepts the two exports, lets a user map their columns, and produces an explainable reconciliation: exact matches, different amounts, missing invoices, duplicates, and possible reference typos that need human review. A user can resolve discrepancies, complete the run, revisit it later, and export a CSV record.

**This is a comparison/review tool, not accounting software.** It does not pay invoices, change the AP ledger, fetch statements automatically, or decide whether a probable match is correct without a person.

## Intended users and use cases

| Audience | Typical situation | What they need to check here |
| --- | --- | --- |
| AP clerk / finance associate | Supplier's statement arrived before payment run | Identify invoices missing from either list and amount differences quickly. |
| AP manager / controller | Month-end close and exception review | Check totals, review evidence and explanations, document resolutions, and sign off a run. |
| Bookkeeper / outsourced accountant | Reconcile several clients' suppliers | Reuse mappings, find anomalies, export a clear record, and keep organizations' data separate. |
| Small/medium business finance team | Statements/ledger arrive as CSV, Excel, or text PDF | Avoid manual line-by-line spreadsheet comparison and retain a reviewable history. |

### Main features to evaluate

- Email/password account, organization workspace, suppliers, team invites, and role-based access.
- Browser-side CSV/XLSX/text-PDF parsing; column mapping with saved supplier profiles; normalized preview with validation.
- Deterministic matching: exact reference and amount, amount mismatch, missing on either side, duplicates, credits, and suggested probable matches requiring explicit acceptance/rejection.
- Results summary, filters/search/sorting, manual pairing, exception notes/status, complete/reopen, historical runs, and matches/exceptions/summary CSV exports.
- Audit trail and organization-isolated data. Raw **files** are not stored by default, but imported transaction data **including original cell values** is saved for reconciliation and audit.
- Billing screen shows a **manual pilot/trial**. Online checkout/subscriptions are planned, not part of this test.

## Before you start

1. Ask the product owner for the **deployed app URL** and permission to make test accounts. Use a desktop browser (Chrome or Edge recommended); note browser/device in your report.
2. Download the synthetic files [`tests/fixtures/supplier-statement.csv`](tests/fixtures/supplier-statement.csv) and [`tests/fixtures/ap-ledger.csv`](tests/fixtures/ap-ledger.csv). If you do not have repository access, copy the data below into **two separate UTF-8 `.csv` files** with those filenames:

   **supplier-statement.csv**

   ```csv
   invoice,date,amount
   INV-1001,2026-09-01,500.00
   INV-1002,2026-09-02,750.00
   INV-1003,2026-09-03,900.00
   INV-1005,2026-09-05,-100.00
   ```

   **ap-ledger.csv**

   ```csv
   invoice,date,amount
   INV1001,2026-09-01,500.00
   INV-1002,2026-09-02,700.00
   INV-1004,2026-09-04,300.00
   INV-1005,2026-09-05,-100.00
   ```

3. If signup asks for email confirmation, open the confirmation email and follow its link before signing in. If no email arrives, tell the product owner; do not share passwords or access tokens in a bug report.
4. Use an organization and supplier created **for testing** so edits/exports do not affect anyone else's work. Don't test **Delete all workspace data** in a shared organization.

## Core web-app test: one complete reconciliation (about 15–20 minutes)

Mark each step **Pass / Fail / Blocked** and note the actual result if different from expected.

| # | What to do in the web app | Expected result | Result |
| --- | --- | --- | --- |
| 1 | Open the URL; choose **Create account**. Enter name, test email, password (at least 8 characters). Confirm email if prompted; sign in. | Signup/login works; you reach onboarding or dashboard without a server error. | ___ |
| 2 | On **Create your organization**, enter e.g. `QA Reconciliation Team`, choose **USD**, create it. | Dashboard loads for your new workspace. | ___ |
| 3 | Open **Suppliers → Add supplier**; create `Acme Supplies Test` with currency **USD**. | Supplier appears in the list and is selectable for a new reconciliation. | ___ |
| 4 | Open **Reconciliations → New reconciliation**; select Acme, period **2026-09-01 to 2026-09-30**, currency **USD**; click **Continue to file upload**. | A draft is created and the setup wizard opens. | ___ |
| 5 | **Upload supplier statement** using `supplier-statement.csv`. On **Map statement**, map **Invoice / Reference Number → invoice**, **Transaction / Invoice Date → date**, **Amount → amount** (check auto-selected fields). Optionally name and save a mapping profile. | Four rows parsed; mappings are editable. | ___ |
| 6 | **Continue to preview**. Check raw/normalized references, negative credit, row count and any warnings. Click **Save statement & continue**. | Preview has four valid transactions; data saves and ledger upload opens. | ___ |
| 7 | Upload `ap-ledger.csv`. Map `invoice`, `date`, `amount` in the same way; preview; **Save ledger & continue**. | Four valid ledger transactions saved; **Review & run** shows four rows on each side. | ___ |
| 8 | Click **Run reconciliation (USD)**. Open **Overview**, **All matches**, and **Exceptions**. | Results load without a crash; classifications and totals match the table below. | ___ |
| 9 | In **All matches**, filter by match type; search for `INV-1002`; try Reference/Amount/Date sort and both directions. | Filtering/search/sort show relevant rows; clearing search restores results. | ___ |
| 10 | On **Exceptions**, find `INV-1002`, choose **Resolve**, select **Resolved**, type a test note, then **Save**. Refresh. | Resolution badge/note persists; unresolved count decreases. | ___ |
| 11 | Export **matches CSV**, **exceptions CSV**, and **summary CSV**. Open the downloads. | Downloads contain correct references, amounts, classifications and a readable summary. A `-100.00` credit stays numeric. | ___ |
| 12 | Click **Complete reconciliation**; inspect Exact/Resolved/Unresolved counts. If any are unresolved, confirm with **Complete anyway**. | Status becomes Completed; completed date is visible in history. | ___ |
| 13 | Return to **Reconciliations**, open the completed run, and try **Reopen for editing**. | Historical results remain readable/exportable; reopening changes status back to review. | ___ |

### Exact expected results for the provided CSV files

| Statement / ledger reference | Expected classification | Why |
| --- | --- | --- |
| `INV-1001` / `INV1001` | **Exact match** | Punctuation-normalized references and amounts `500.00` agree. |
| `INV-1002` / `INV-1002` | **Amount mismatch** | `750.00` vs `700.00`; difference `50.00`. |
| `INV-1003` / none | **Missing in ledger** | Statement-only invoice for `900.00`. |
| None / `INV-1004` | **Missing on statement** | Ledger-only invoice for `300.00`. |
| `INV-1005` / `INV-1005` | **Exact match (credit)** | Negative `-100.00` matches on both sides. |

**Expected run totals before reviews:** 4 statement rows, 4 ledger rows, **2 exact matches**, **1 amount mismatch**, **1 missing in ledger**, **1 missing on statement**; statement total **2050.00**, ledger total **1400.00**, difference **650.00**, initially **3 open exceptions**. Resolving an exception changes its review count, not the underlying source totals.

## Additional test scenarios

Run these as **separate new reconciliations** so their results do not interfere with the core test.

### Probable match: human decision required

Create two small CSVs with headers `invoice,date,amount`:

**Statement CSV**

```csv
invoice,date,amount
INV-1089,2026-09-01,250.00
```

**Ledger CSV**

```csv
invoice,date,amount
INV-1098,2026-09-03,250.00
```

Upload/map/run with the same workflow. In **Probable review**, the single suggestion should **not** be marked confirmed on its own. Click **Accept**: it should become confirmed and the pending-probable count should fall. Repeat in another new run and click **Reject**: the suggested pair should instead appear as two missing-side entries. Record any unexpected totals or duplicate rows.

### Manual match and other exceptions

- In the **core run, before completion**, look for **Manual matching** on the Exceptions tab. There is one statement-only row (`INV-1003`) and one ledger-only row (`INV-1004`). Check whether the row selectors offer a pair; if they say there are no candidates despite those missing rows, **report that as a bug** rather than assuming manual matching passed. Use a separate run if you want to keep the baseline expected results intact.
- Try changing a resolution from **Resolved** to **Needs investigation** or **Ignored**, add a note, refresh, and verify that status/note and unresolved count behave as expected. Also try changing the status **after** typing the note; report it if your note changes unexpectedly.
- Create a separate test dataset with a repeated invoice reference on one side and check the duplicate classification; include the exact rows you used in the report.

### Import, persistence, and validation

- Convert each sample CSV to `.xlsx` in Excel/LibreOffice, then repeat an upload; verify mapping and four-row preview. If available, test a **text-selectable** supplier PDF; a scanned/image-only PDF should show an unsupported/scanned message (OCR is not offered).
- Upload an empty CSV, a wrong file type (e.g. `.txt`/HTML), or a file over **20 MB**; the app should show an error, not crash. Limit is **20,000 rows per file**.
- In a new draft, map columns, wait a second, **refresh** before saving: check the unsaved draft is restored in the same browser. After saving a side, refresh again: saved row count should remain. Reuse a saved mapping profile with the same supplier and check the proposed mapping, correcting it if columns differ.
- On a phone, check that the dashboard/results can be viewed and a simple exception can be resolved. Desktop is the primary format for spreadsheet mapping.

### Access and audit (two test accounts, if permitted)

- With account A in organization A, copy a reconciliation URL. With account B in a **different** organization in another private/incognito window, try to open it and its export URL. B must not see or download A's rows. The signed-out visitor should be asked to sign in.
- As organization owner, open **Settings → Data & Privacy** and check audit events for creating/running/completing/exporting a reconciliation. In **Settings → Team**, invite another test account and check the invite and role behavior. Do not delete the workspace unless the owner explicitly asks for a deletion test.
- Open **Settings → Billing** to confirm the trial/manual pilot status displays. **Do not attempt a live payment**; checkout integration is not enabled yet.

## Product feedback: ask the tester after the task

1. In your own words, what job does this product do? Would your team use it for month-end or supplier disputes?
2. What files do you actually receive from suppliers and your AP/accounting system (formats, usual columns, currencies, approximate row counts)?
3. How long did it take from signup to the first useful results? How long would the same reconciliation take in a spreadsheet?
4. Were the mismatch reasons and `Missing in ledger` / `Missing on statement` labels understandable? Which result would you investigate first?
5. Which actions or screens were confusing, missing, too slow, or difficult on your device?
6. Would CSV export and the audit trail be enough for your manager/client? What report or integration would you need next?
7. If this saved time reliably, who would approve buying it, how often would they use it, and what price would feel reasonable?

## Report back to the product owner

**App URL / browser / device:** ____________________  **Test account (email only):** ____________________

**Core steps passed:** ___ / 13  **Blocked steps:** ___  **Time to first results:** ___ minutes

For each issue, send:

```text
Title and severity: Blocker / High / Medium / Low
Page URL and step number:
Test file / row / invoice reference used (synthetic data only):
Steps to reproduce:
Expected result:
Actual result and exact error message:
Screenshot or short screen recording (hide passwords/tokens):
Browser/device and whether refresh changed the result:
```

Finish with the answers to the seven product-feedback questions. **Do not send real supplier statements, login passwords, API keys, or financial data** in screenshots or reports.
