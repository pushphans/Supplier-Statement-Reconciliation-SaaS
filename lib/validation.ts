import "server-only";
import { z } from "zod";

export const DATE_FORMATS = [
  "auto",
  "YYYY-MM-DD",
  "DD/MM/YYYY",
  "MM/DD/YYYY",
  "DD-MM-YYYY",
  "MM-DD-YYYY",
  "DD-Mon-YYYY",
] as const;

export const TARGET_FIELDS = [
  "reference",
  "transaction_date",
  "due_date",
  "amount",
  "debit",
  "credit",
  "balance",
  "currency",
  "transaction_type",
  "description",
] as const;

export const mappingSchema = z.object({
  reference: z.string().optional(),
  transaction_date: z.string().optional(),
  due_date: z.string().optional(),
  amount: z.string().optional(),
  debit: z.string().optional(),
  credit: z.string().optional(),
  balance: z.string().optional(),
  currency: z.string().optional(),
  transaction_type: z.string().optional(),
  description: z.string().optional(),
});

export const normalizationOptionsSchema = z.object({
  dateFormat: z.enum(DATE_FORMATS).default("auto"),
  decimalSeparator: z.enum([".", ","]).optional(),
  thousandsSeparator: z.enum([",", ".", " "]).optional(),
  defaultCurrency: z.string().length(3).optional(),
});

export type ColumnMapping = z.infer<typeof mappingSchema>;
export type NormalizationOptions = z.infer<typeof normalizationOptionsSchema>;

export const supplierSchema = z.object({
  name: z.string().trim().min(1).max(300),
  supplier_code: z.string().trim().max(64).optional().or(z.literal("")),
  default_currency: z.string().length(3),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const createReconciliationSchema = z.object({
  supplier_id: z.string().uuid(),
  period_start: z.string().optional().or(z.literal("")),
  period_end: z.string().optional().or(z.literal("")),
  currency: z.string().length(3),
});

export const resolveExceptionSchema = z.object({
  match_id: z.string().uuid(),
  status: z.enum(["resolved", "ignored", "needs_investigation"]),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const manualMatchSchema = z.object({
  statement_transaction_id: z.string().uuid(),
  ledger_transaction_id: z.string().uuid(),
});

export const signupSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
  full_name: z.string().trim().min(2).max(200),
});

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(128),
});

export const organizationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  default_currency: z.string().length(3),
  timezone: z.string().trim().min(1).max(100),
});

export const inviteSchema = z.object({
  email: z.email(),
});

/** Normalized transaction payload the client sends after browser-side parsing. */
export const normalizedTxnSchema = z.object({
  rowNumber: z.number().int().min(1),
  rawReference: z.string().max(500),
  normalizedReference: z.string().max(500),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  amount: z.string().regex(/^-?\d+(\.\d+)?$/),
  currency: z.string().length(3).nullable(),
  transactionType: z.enum(["invoice", "credit", "unknown"]),
  rawData: z.record(z.string(), z.string()).default({}),
});

export const datasetPayloadSchema = z.object({
  type: z.enum(["supplier_statement", "ap_ledger"]),
  original_filename: z.string().min(1).max(300),
  mapping: mappingSchema,
  normalization_options: normalizationOptionsSchema,
  transactions: z.array(normalizedTxnSchema).min(1).max(50000),
  save_profile: z.boolean().default(false),
  profile_name: z.string().trim().max(200).optional(),
});

export type DatasetPayload = z.infer<typeof datasetPayloadSchema>;
