import { Decimal, amountsEqual, difference, sumAmounts } from "./amount";
import { DEFAULT_ENGINE_CONFIG } from "./types";
import type {
  EngineConfig,
  EngineMatch,
  EngineResult,
  EngineSummary,
  EngineTransaction,
  MatchType,
} from "./types";
import { daysBetween } from "./date";
import { referenceSimilarity } from "./similarity";

function currenciesCompatible(a: string | null, b: string | null): boolean {
  if (!a || !b) return true;
  return a.toUpperCase() === b.toUpperCase();
}

function match(
  partial: Omit<EngineMatch, "userConfirmed" | "confidenceScore" | "differenceAmount"> &
    Partial<Pick<EngineMatch, "confidenceScore" | "differenceAmount" | "userConfirmed">>,
): EngineMatch {
  return {
    confidenceScore: null,
    differenceAmount: null,
    userConfirmed: false,
    ...partial,
  };
}

/**
 * Deterministic multi-pass matching engine (PRD §23–§33).
 *
 * Passes, in order:
 *  1. Exact match (reference + amount + currency compatible)
 *  2. Reference match with amount difference
 *  3. Duplicate detection within each source (unmatched rows)
 *  4. Probable reference match (candidate generation only — never auto-accepted)
 *  5. Unmatched statement → missing_in_ledger
 *  6. Unmatched ledger → missing_on_statement
 *
 * Every transaction appears in exactly one result match (invariant).
 * Pure function — no I/O, no UI, independently unit-testable.
 */
export function reconcile(
  statement: EngineTransaction[],
  ledger: EngineTransaction[],
  config: Partial<EngineConfig> = {},
): EngineResult {
  const cfg: EngineConfig = { ...DEFAULT_ENGINE_CONFIG, ...config };
  const tolerance = cfg.amountTolerance;

  const matches: EngineMatch[] = [];

  const sUnmatched = new Map<string, EngineTransaction>();
  const lUnmatched = new Map<string, EngineTransaction>();
  for (const t of statement) sUnmatched.set(t.id, t);
  for (const t of ledger) lUnmatched.set(t.id, t);

  const statementByRef = groupByRef(statement);
  const ledgerByRef = groupByRef(ledger);
  const allRefs = new Set([...statementByRef.keys(), ...ledgerByRef.keys()]);

  // ---- Pass 1: EXACT MATCH -------------------------------------------------
  // Within each shared reference, pair rows greedily by order when amounts are
  // equal (within tolerance) and currencies are compatible.
  for (const ref of allRefs) {
    const sRows = statementByRef.get(ref) ?? [];
    const lRows = ledgerByRef.get(ref) ?? [];
    if (sRows.length === 0 || lRows.length === 0) continue;

    const lUsed = new Set<string>();
    for (const s of sRows) {
      if (!sUnmatched.has(s.id)) continue;
      for (const l of lRows) {
        if (!lUnmatched.has(l.id) || lUsed.has(l.id)) continue;
        if (!currenciesCompatible(s.currency, l.currency)) continue;
        if (!amountsEqual(s.amount, l.amount, tolerance)) continue;
        sUnmatched.delete(s.id);
        lUnmatched.delete(l.id);
        lUsed.add(l.id);
        matches.push(
          match({
            statementTransactionId: s.id,
            ledgerTransactionId: l.id,
            matchType: "exact_match",
            reason:
              `Exact normalized reference "${ref}" + exact amount` +
              (s.currency && l.currency && s.currency !== l.currency
                ? ""
                : " (currency compatible)"),
            differenceAmount: "0",
            userConfirmed: true,
          }),
        );
        break;
      }
    }
  }

  // ---- Pass 2: REFERENCE MATCH / AMOUNT DIFFERENCE ------------------------
  for (const ref of allRefs) {
    const sRows = (statementByRef.get(ref) ?? []).filter((t) => sUnmatched.has(t.id));
    const lRows = (ledgerByRef.get(ref) ?? []).filter((t) => lUnmatched.has(t.id));
    const pairCount = Math.min(sRows.length, lRows.length);
    for (let i = 0; i < pairCount; i++) {
      const s = sRows[i];
      const l = lRows[i];
      const currencyClash =
        s.currency && l.currency && s.currency.toUpperCase() !== l.currency.toUpperCase();
      if (currencyClash) {
        // Conflicting currencies must not auto-match. Surface as amount/currency
        // exception for explicit human review.
        sUnmatched.delete(s.id);
        lUnmatched.delete(l.id);
        matches.push(
          match({
            statementTransactionId: s.id,
            ledgerTransactionId: l.id,
            matchType: "amount_mismatch",
            reason: `Same reference "${ref}" but currencies differ (${s.currency} vs ${l.currency}); manual review required`,
            differenceAmount: null,
          }),
        );
        continue;
      }
      sUnmatched.delete(s.id);
      lUnmatched.delete(l.id);
      const diff = difference(s.amount, l.amount);
      matches.push(
        match({
          statementTransactionId: s.id,
          ledgerTransactionId: l.id,
          matchType: "amount_mismatch",
          reason: `Exact reference "${s.rawReference}"; amount differs by ${diff}`,
          differenceAmount: diff,
        }),
      );
    }
  }

  // ---- Pass 3: DUPLICATES (within each source, among unmatched) ------------
  const dupCandidatesS = new Set<string>();
  const dupCandidatesL = new Set<string>();

  const unmatchedSByRef = new Map<string, EngineTransaction[]>();
  for (const t of sUnmatched.values()) {
    const arr = unmatchedSByRef.get(t.normalizedReference) ?? [];
    arr.push(t);
    unmatchedSByRef.set(t.normalizedReference, arr);
  }
  const unmatchedLByRef = new Map<string, EngineTransaction[]>();
  for (const t of lUnmatched.values()) {
    const arr = unmatchedLByRef.get(t.normalizedReference) ?? [];
    arr.push(t);
    unmatchedLByRef.set(t.normalizedReference, arr);
  }
  for (const [ref, rows] of unmatchedSByRef) {
    if (rows.length > 1) for (const r of rows) dupCandidatesS.add(r.id);
    void ref;
  }
  for (const [ref, rows] of unmatchedLByRef) {
    if (rows.length > 1) for (const r of rows) dupCandidatesL.add(r.id);
    void ref;
  }

  for (const id of [...dupCandidatesS]) {
    const t = sUnmatched.get(id);
    if (!t) continue;
    sUnmatched.delete(id);
    const occurrences = unmatchedSByRef.get(t.normalizedReference)?.length ?? 1;
    matches.push(
      match({
        statementTransactionId: t.id,
        ledgerTransactionId: null,
        matchType: "duplicate_statement",
        reason: `Reference "${t.normalizedReference}" appears ${occurrences} times in the supplier statement with no acceptable ledger match`,
      }),
    );
  }
  for (const id of [...dupCandidatesL]) {
    const t = lUnmatched.get(id);
    if (!t) continue;
    lUnmatched.delete(id);
    const occurrences = unmatchedLByRef.get(t.normalizedReference)?.length ?? 1;
    matches.push(
      match({
        statementTransactionId: null,
        ledgerTransactionId: t.id,
        matchType: "duplicate_ledger",
        reason: `Reference "${t.normalizedReference}" appears ${occurrences} times in the AP ledger with no acceptable statement match`,
      }),
    );
  }

  // ---- Pass 4: PROBABLE REFERENCE MATCH (candidates only) ------------------
  // Index remaining ledger rows by amount for near-O(1) candidate lookup.
  const ledgerByAmount = new Map<string, EngineTransaction[]>();
  for (const t of lUnmatched.values()) {
    const arr = ledgerByAmount.get(t.amount) ?? [];
    arr.push(t);
    ledgerByAmount.set(t.amount, arr);
  }

  const claimedLedger = new Set<string>();
  for (const s of [...sUnmatched.values()]) {
    const candidates = (ledgerByAmount.get(s.amount) ?? []).filter(
      (l) => lUnmatched.has(l.id) && !claimedLedger.has(l.id) && l.id !== s.id,
    );
    let best: { l: EngineTransaction; score: number; parts: string[] } | null = null;

    for (const l of candidates) {
      if (!currenciesCompatible(s.currency, l.currency)) continue;
      const sim = referenceSimilarity(s.normalizedReference, l.normalizedReference);
      if (sim < cfg.minReferenceSimilarity) continue;
      if (sim >= 1) {
        // Same normalized reference with equal amount would have matched in
        // pass 1 unless previously consumed — skip here to avoid duplicates.
        continue;
      }

      const parts: string[] = ["Same amount"];
      let dateOk = true;
      let dateNote: string | null = null;

      if (s.transactionDate && l.transactionDate) {
        const delta = daysBetween(s.transactionDate, l.transactionDate);
        if (delta > cfg.dateWindowDays) {
          dateOk = false;
          dateNote = `dates are ${delta} days apart (outside ${cfg.dateWindowDays}-day window)`;
        } else {
          dateNote = delta === 0 ? "dates are identical" : `dates are ${delta} day${delta === 1 ? "" : "s"} apart`;
        }
      } else {
        dateNote = "one or both dates missing";
      }
      if (!dateOk) continue;

      const dist = Math.round((1 - sim) * Math.max(s.normalizedReference.length, l.normalizedReference.length));
      parts.push(
        dist <= 1
          ? `invoice number differs by ${dist} character${dist === 1 ? "" : "s"}`
          : `reference similarity ${Math.round(sim * 100)}%`,
      );
      if (dateNote) parts.push(dateNote);

      const score = sim;
      if (!best || score > best.score) {
        best = { l, score, parts };
      }
    }

    if (best) {
      sUnmatched.delete(s.id);
      claimedLedger.add(best.l.id);
      lUnmatched.delete(best.l.id);
      const reason =
        `${best.parts.join("; ")}. ` +
        `Statement "${s.rawReference}" vs ledger "${best.l.rawReference}" — user confirmation required.`;
      matches.push(
        match({
          statementTransactionId: s.id,
          ledgerTransactionId: best.l.id,
          matchType: "probable_match",
          confidenceScore: best.score.toFixed(4),
          reason,
          differenceAmount: "0",
        }),
      );
    }
  }

  // ---- Pass 5: UNMATCHED STATEMENT → MISSING_IN_LEDGER ---------------------
  for (const t of sUnmatched.values()) {
    matches.push(
      match({
        statementTransactionId: t.id,
        ledgerTransactionId: null,
        matchType: "missing_in_ledger",
        reason: `No acceptable ledger entry found for statement reference "${t.rawReference}" (amount ${t.amount})`,
      }),
    );
  }

  // ---- Pass 6: UNMATCHED LEDGER → MISSING_ON_STATEMENT ---------------------
  for (const t of lUnmatched.values()) {
    matches.push(
      match({
        statementTransactionId: null,
        ledgerTransactionId: t.id,
        matchType: "missing_on_statement",
        reason: `No acceptable supplier statement entry found for ledger reference "${t.rawReference}" (amount ${t.amount})`,
      }),
    );
  }

  const summary = computeSummary(statement, ledger, matches);
  assertCoverage(statement, ledger, matches);
  assertSingleSided(matches);

  return { matches, summary };
}

function groupByRef(txns: EngineTransaction[]): Map<string, EngineTransaction[]> {
  const map = new Map<string, EngineTransaction[]>();
  for (const t of txns) {
    const arr = map.get(t.normalizedReference) ?? [];
    arr.push(t);
    map.set(t.normalizedReference, arr);
  }
  return map;
}

export function computeSummary(
  statement: EngineTransaction[],
  ledger: EngineTransaction[],
  matches: EngineMatch[],
): EngineSummary {
  const statementTotal = sumAmounts(statement.map((t) => t.amount));
  const ledgerTotal = sumAmounts(ledger.map((t) => t.amount));
  const counts = {
    exactMatch: 0,
    probableMatch: 0,
    manuallyMatched: 0,
    amountMismatch: 0,
    missingInLedger: 0,
    missingOnStatement: 0,
    duplicateStatement: 0,
    duplicateLedger: 0,
  };
  const map: Record<MatchType, keyof typeof counts> = {
    exact_match: "exactMatch",
    probable_match: "probableMatch",
    manually_matched: "manuallyMatched",
    amount_mismatch: "amountMismatch",
    missing_in_ledger: "missingInLedger",
    missing_on_statement: "missingOnStatement",
    duplicate_statement: "duplicateStatement",
    duplicate_ledger: "duplicateLedger",
  };
  for (const m of matches) {
    counts[map[m.matchType]] += 1;
  }
  return {
    statementTotal,
    ledgerTotal,
    difference: difference(statementTotal, ledgerTotal),
    statementCount: statement.length,
    ledgerCount: ledger.length,
    totalCount: statement.length + ledger.length,
    counts,
  };
}

/** Invariant: every input transaction appears in exactly one match. */
export function assertCoverage(
  statement: EngineTransaction[],
  ledger: EngineTransaction[],
  matches: EngineMatch[],
): void {
  const seen = new Set<string>();
  for (const m of matches) {
    for (const id of [m.statementTransactionId, m.ledgerTransactionId]) {
      if (!id) continue;
      if (seen.has(id)) {
        throw new Error(`Invariant violated: transaction ${id} appears in multiple matches`);
      }
      seen.add(id);
    }
  }
  for (const t of statement) {
    if (!seen.has(t.id)) throw new Error(`Invariant violated: statement transaction ${t.id} unclassified`);
  }
  for (const t of ledger) {
    if (!seen.has(t.id)) throw new Error(`Invariant violated: ledger transaction ${t.id} unclassified`);
  }
}

/** Invariant: a two-sided match never mixes sides incorrectly. */
export function assertSingleSided(matches: EngineMatch[]): void {
  for (const m of matches) {
    if (m.matchType === "missing_in_ledger" && m.ledgerTransactionId) {
      throw new Error("Invariant violated: missing_in_ledger cannot reference a ledger transaction");
    }
    if (m.matchType === "missing_on_statement" && m.statementTransactionId) {
      throw new Error("Invariant violated: missing_on_statement cannot reference a statement transaction");
    }
    if (m.matchType === "duplicate_statement" && m.ledgerTransactionId) {
      throw new Error("Invariant violated: duplicate_statement cannot reference a ledger transaction");
    }
    if (m.matchType === "duplicate_ledger" && m.statementTransactionId) {
      throw new Error("Invariant violated: duplicate_ledger cannot reference a statement transaction");
    }
  }
}

export function isExceptionType(t: MatchType): boolean {
  return (
    t === "amount_mismatch" ||
    t === "missing_in_ledger" ||
    t === "missing_on_statement" ||
    t === "duplicate_statement" ||
    t === "duplicate_ledger" ||
    t === "probable_match"
  );
}

export function isAutoAcceptable(t: MatchType): boolean {
  return t === "exact_match";
}

export { Decimal };
