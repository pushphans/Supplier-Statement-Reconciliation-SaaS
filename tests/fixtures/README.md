# Synthetic test fixtures (PRD §75)

## supplier-statement.csv

```csv
invoice,date,amount
INV-1001,2026-09-01,500.00
INV-1002,2026-09-02,750.00
INV-1003,2026-09-03,900.00
INV-1005,2026-09-05,-100.00
```

## ap-ledger.csv

```csv
invoice,date,amount
INV1001,2026-09-01,500.00
INV-1002,2026-09-02,700.00
INV-1004,2026-09-04,300.00
INV-1005,2026-09-05,-100.00
```

## Expected results

| Invoice | Result |
| --- | --- |
| INV-1001 | Exact match (separator-insensitive: `INV-1001` ≡ `INV1001`) |
| INV-1002 | Amount mismatch (750 vs 700 → difference 50) |
| INV-1003 | Missing in ledger |
| INV-1004 | Missing on statement |
| INV-1005 | Exact credit match (−100.00 preserved) |

Statement total: **2050** · Ledger total: **1400** · Difference: **650**

These fixtures are encoded in `tests/match.test.ts` under
`describe("PRD §75 fixture — expected classifications")`.
