export type Side = "statement" | "ledger";

export type TransactionType = "invoice" | "credit" | "unknown";

export type MatchType =
  | "exact_match"
  | "probable_match"
  | "manually_matched"
  | "amount_mismatch"
  | "missing_in_ledger"
  | "missing_on_statement"
  | "duplicate_statement"
  | "duplicate_ledger";

/** Normalized transaction used by the matching engine. Raw values are preserved. */
export interface EngineTransaction {
  id: string;
  side: Side;
  rowNumber: number;
  rawReference: string;
  normalizedReference: string;
  /** ISO date string (yyyy-mm-dd) or null when missing/unparseable. */
  transactionDate: string | null;
  /** Canonical decimal string, e.g. "1250.50" or "-100.00". */
  amount: string;
  currency: string | null;
  transactionType: TransactionType;
}

export interface EngineConfig {
  /** Absolute amount tolerance as decimal string. Default "0". */
  amountTolerance: string;
  /** Date proximity window (days) for probable-match candidates. */
  dateWindowDays: number;
  /** Minimum reference similarity (0..1) for probable candidates. */
  minReferenceSimilarity: number;
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  amountTolerance: "0",
  dateWindowDays: 30,
  minReferenceSimilarity: 0.75,
};

export interface EngineMatch {
  statementTransactionId: string | null;
  ledgerTransactionId: string | null;
  matchType: MatchType;
  confidenceScore: string | null;
  reason: string;
  differenceAmount: string | null;
  userConfirmed: boolean;
}

export interface EngineSummary {
  statementTotal: string;
  ledgerTotal: string;
  difference: string;
  statementCount: number;
  ledgerCount: number;
  totalCount: number;
  counts: {
    exactMatch: number;
    probableMatch: number;
    manuallyMatched: number;
    amountMismatch: number;
    missingInLedger: number;
    missingOnStatement: number;
    duplicateStatement: number;
    duplicateLedger: number;
  };
}

export interface EngineResult {
  matches: EngineMatch[];
  summary: EngineSummary;
}
