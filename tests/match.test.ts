import { describe, expect, it } from "vitest";
import { reconcile } from "@/lib/engine/match";
import type { EngineTransaction } from "@/lib/engine/types";

let n = 0;
function txn(
  side: "statement" | "ledger",
  ref: string,
  amount: string,
  opts: Partial<EngineTransaction> = {},
): EngineTransaction {
  n += 1;
  return {
    id: `${side[0]}${n}`,
    side,
    rowNumber: n,
    rawReference: ref,
    normalizedReference: ref.replace(/[\s\-/_\.]+/g, "").toUpperCase(),
    transactionDate: opts.transactionDate ?? null,
    amount,
    currency: opts.currency ?? null,
    transactionType: opts.transactionType ?? (amount.startsWith("-") ? "credit" : "invoice"),
    ...opts,
  };
}

describe("PRD §75 fixture — expected classifications", () => {
  const statement = [
    txn("statement", "INV-1001", "500.00", { transactionDate: "2026-09-01" }),
    txn("statement", "INV-1002", "750.00", { transactionDate: "2026-09-02" }),
    txn("statement", "INV-1003", "900.00", { transactionDate: "2026-09-03" }),
    txn("statement", "INV-1005", "-100.00", { transactionDate: "2026-09-05" }),
  ];
  const ledger = [
    txn("ledger", "INV1001", "500.00", { transactionDate: "2026-09-01" }),
    txn("ledger", "INV-1002", "700.00", { transactionDate: "2026-09-02" }),
    txn("ledger", "INV-1004", "300.00", { transactionDate: "2026-09-04" }),
    txn("ledger", "INV-1005", "-100.00", { transactionDate: "2026-09-05" }),
  ];

  const result = reconcile(statement, ledger);

  function byStatementRef(ref: string) {
    const s = statement.find((t) => t.normalizedReference === ref.replace(/[\s\-/_\.]+/g, "").toUpperCase())!;
    return result.matches.find((m) => m.statementTransactionId === s.id)!;
  }
  function byLedgerRef(ref: string) {
    const l = ledger.find((t) => t.normalizedReference === ref.replace(/[\s\-/_\.]+/g, "").toUpperCase())!;
    return result.matches.find((m) => m.ledgerTransactionId === l.id)!;
  }

  it("INV-1001 → Exact Match (separator-insensitive refs)", () => {
    expect(byStatementRef("INV-1001").matchType).toBe("exact_match");
  });

  it("INV-1002 → Amount Mismatch with difference 50", () => {
    const m = byStatementRef("INV-1002");
    expect(m.matchType).toBe("amount_mismatch");
    expect(m.differenceAmount).toBe("50");
    expect(m.reason).toContain("amount differs");
  });

  it("INV-1003 → Missing In Ledger", () => {
    expect(byStatementRef("INV-1003").matchType).toBe("missing_in_ledger");
  });

  it("INV-1004 → Missing On Statement", () => {
    expect(byLedgerRef("INV-1004").matchType).toBe("missing_on_statement");
  });

  it("INV-1005 → Exact Credit Match (negative preserved)", () => {
    const m = byStatementRef("INV-1005");
    expect(m.matchType).toBe("exact_match");
    const s = statement.find((t) => t.normalizedReference === "INV1005")!;
    expect(s.amount).toBe("-100.00");
    expect(s.transactionType).toBe("credit");
  });

  it("computes totals and difference", () => {
    expect(result.summary.statementTotal).toBe("2050");
    expect(result.summary.ledgerTotal).toBe("1400");
    expect(result.summary.difference).toBe("650");
    expect(result.summary.counts.exactMatch).toBe(2);
    expect(result.summary.counts.amountMismatch).toBe(1);
    expect(result.summary.counts.missingInLedger).toBe(1);
    expect(result.summary.counts.missingOnStatement).toBe(1);
  });
});

describe("Pass 1 — exact match", () => {
  it("matches identical reference and amount", () => {
    const r = reconcile(
      [txn("statement", "A1", "10.00")],
      [txn("ledger", "A1", "10.00")],
    );
    expect(r.matches[0].matchType).toBe("exact_match");
    expect(r.matches[0].userConfirmed).toBe(true);
    expect(r.matches[0].differenceAmount).toBe("0");
  });

  it("does not match when currencies conflict", () => {
    const r = reconcile(
      [txn("statement", "A1", "10.00", { currency: "USD" })],
      [txn("ledger", "A1", "10.00", { currency: "EUR" })],
    );
    expect(r.matches[0].matchType).toBe("amount_mismatch");
    expect(r.matches[0].reason).toContain("currencies differ");
  });

  it("matches when one side lacks currency", () => {
    const r = reconcile(
      [txn("statement", "A1", "10.00", { currency: "USD" })],
      [txn("ledger", "A1", "10.00")],
    );
    expect(r.matches[0].matchType).toBe("exact_match");
  });

  it("respects amount tolerance config", () => {
    const strict = reconcile(
      [txn("statement", "A1", "10.00")],
      [txn("ledger", "A1", "10.01")],
    );
    expect(strict.matches[0].matchType).toBe("amount_mismatch");

    const tolerant = reconcile(
      [txn("statement", "A1", "10.00")],
      [txn("ledger", "A1", "10.01")],
      { amountTolerance: "0.01" },
    );
    expect(tolerant.matches[0].matchType).toBe("exact_match");
  });
});

describe("Pass 2 — amount mismatch", () => {
  it("pairs same reference with differing amounts and explains variance", () => {
    const r = reconcile(
      [txn("statement", "INV-102", "950")],
      [txn("ledger", "INV-102", "900")],
    );
    const m = r.matches[0];
    expect(m.matchType).toBe("amount_mismatch");
    expect(m.differenceAmount).toBe("50");
    expect(m.reason).toContain("INV-102");
    expect(m.userConfirmed).toBe(false);
  });
});

describe("Pass 3 — duplicates", () => {
  it("flags duplicate references in the statement", () => {
    const r = reconcile(
      [
        txn("statement", "DUP1", "10"),
        txn("statement", "DUP1", "20"),
      ],
      [txn("ledger", "OTHER", "99")],
    );
    const dups = r.matches.filter((m) => m.matchType === "duplicate_statement");
    expect(dups).toHaveLength(2);
    expect(dups[0].ledgerTransactionId).toBeNull();
  });

  it("flags duplicate references in the ledger", () => {
    const r = reconcile(
      [txn("statement", "ONLY", "99")],
      [
        txn("ledger", "DUP2", "10"),
        txn("ledger", "DUP2", "20"),
      ],
    );
    const dups = r.matches.filter((m) => m.matchType === "duplicate_ledger");
    expect(dups).toHaveLength(2);
  });

  it("does not collapse duplicates — every source row appears", () => {
    const r = reconcile(
      [
        txn("statement", "X", "1"),
        txn("statement", "X", "2"),
        txn("statement", "X", "3"),
      ],
      [txn("ledger", "Y", "5")],
    );
    expect(r.matches.filter((m) => m.matchType === "duplicate_statement")).toHaveLength(3);
    expect(r.summary.statementCount).toBe(3);
  });
});

describe("Pass 4 — probable match (never auto-accepted)", () => {
  it("creates a candidate for transposed reference typo with same amount", () => {
    const r = reconcile(
      [txn("statement", "INV-1089", "250.00", { transactionDate: "2026-09-01" })],
      [txn("ledger", "INV-1098", "250.00", { transactionDate: "2026-09-03" })],
    );
    const m = r.matches[0];
    expect(m.matchType).toBe("probable_match");
    expect(m.userConfirmed).toBe(false);
    expect(m.reason).toContain("user confirmation required");
    expect(m.confidenceScore).not.toBeNull();
    expect(m.reason).toMatch(/amount/i);
  });

  it("does not propose candidates when amounts differ", () => {
    const r = reconcile(
      [txn("statement", "INV-1089", "250.00")],
      [txn("ledger", "INV-1098", "251.00")],
    );
    expect(r.matches[0].matchType).toBe("missing_in_ledger");
    expect(r.matches[1].matchType).toBe("missing_on_statement");
  });

  it("rejects candidates outside the date window", () => {
    const r = reconcile(
      [txn("statement", "INV-1089", "250.00", { transactionDate: "2026-01-01" })],
      [txn("ledger", "INV-1098", "250.00", { transactionDate: "2026-09-01" })],
    );
    expect(r.matches.some((m) => m.matchType === "probable_match")).toBe(false);
  });

  it("does not propose when references are dissimilar", () => {
    const r = reconcile(
      [txn("statement", "COMPLETELY-DIFFERENT", "250.00")],
      [txn("ledger", "ZZZ-99999", "250.00")],
    );
    expect(r.matches.some((m) => m.matchType === "probable_match")).toBe(false);
  });
});

describe("Passes 5–6 — unmatched classification", () => {
  it("classifies statement-only as missing_in_ledger", () => {
    const r = reconcile([txn("statement", "S1", "10")], []);
    expect(r.matches[0].matchType).toBe("missing_in_ledger");
    expect(r.matches[0].reason).toContain("No acceptable ledger entry");
  });

  it("classifies ledger-only as missing_on_statement", () => {
    const r = reconcile([], [txn("ledger", "L1", "10")]);
    expect(r.matches[0].matchType).toBe("missing_on_statement");
  });
});

describe("Invariants / property checks", () => {
  it("every transaction is classified exactly once across mixed data", () => {
    const statement = [
      txn("statement", "A", "1"),
      txn("statement", "B", "2"),
      txn("statement", "C", "3"),
      txn("statement", "D", "4"),
      txn("statement", "E", "5"),
      txn("statement", "F", "6"),
      txn("statement", "G", "7"),
    ];
    const ledger = [
      txn("ledger", "A", "1"),
      txn("ledger", "B", "2.50"),
      txn("ledger", "X", "9"),
      txn("ledger", "F", "6"),
      txn("ledger", "F", "6.10"),
    ];
    const r = reconcile(statement, ledger);
    const ids = new Set<string>();
    for (const m of r.matches) {
      for (const id of [m.statementTransactionId, m.ledgerTransactionId]) {
        if (!id) continue;
        expect(ids.has(id)).toBe(false);
        ids.add(id);
      }
    }
    expect(ids.size).toBe(statement.length + ledger.length);
    expect(r.summary.totalCount).toBe(statement.length + ledger.length);
  });

  it("classification counts sum to number of matches and cover both sides", () => {
    const r = reconcile(
      [txn("statement", "A", "1"), txn("statement", "Z", "3")],
      [txn("ledger", "A", "1"), txn("ledger", "Y", "2")],
    );
    const c = r.summary.counts;
    const total =
      c.exactMatch +
      c.probableMatch +
      c.manuallyMatched +
      c.amountMismatch +
      c.missingInLedger +
      c.missingOnStatement +
      c.duplicateStatement +
      c.duplicateLedger;
    expect(total).toBe(r.matches.length);
  });

  it("deterministic: same input yields identical output", () => {
    const s = [txn("statement", "A", "1"), txn("statement", "B", "2")];
    const l = [txn("ledger", "A", "1"), txn("ledger", "C", "3")];
    const r1 = reconcile(s, l);
    const r2 = reconcile(s, l);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });

  it("scales: 5000 + 5000 rows complete quickly via indexed passes", () => {
    const s: EngineTransaction[] = [];
    const l: EngineTransaction[] = [];
    n = 0;
    for (let i = 0; i < 5000; i++) {
      s.push(txn("statement", `INV-${i}`, `${(i % 900) + 1}.00`));
      l.push(txn("ledger", `INV-${i}`, `${(i % 900) + 1}.00`));
    }
    const start = performance.now();
    const r = reconcile(s, l);
    const elapsed = performance.now() - start;
    expect(r.summary.counts.exactMatch).toBe(5000);
    expect(elapsed).toBeLessThan(3000);
  });
});
