"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  parseFile,
  ParseError,
  type RawTable,
} from "@/lib/parse";
import {
  normalizeTable,
  suggestMapping,
  type ValidationReport,
} from "@/lib/parse/mapping";
import type { ColumnMapping, NormalizationOptions } from "@/lib/validation";
import { saveDatasetAction, runReconciliationAction, recordMappingReuseAction } from "@/app/actions/reconciliations";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { formatMoney } from "@/lib/format";

const DATE_FORMAT_OPTIONS = [
  { value: "auto", label: "Auto-detect" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
  { value: "DD-MM-YYYY", label: "DD-MM-YYYY" },
  { value: "MM-DD-YYYY", label: "MM-DD-YYYY" },
  { value: "DD-Mon-YYYY", label: "DD-Mon-YYYY (15-Jan-2025)" },
];

const FIELD_OPTIONS = [
  { key: "", label: "— not mapped —" },
  { key: "reference", label: "Invoice / Reference Number" },
  { key: "transaction_date", label: "Transaction / Invoice Date" },
  { key: "due_date", label: "Due Date" },
  { key: "amount", label: "Amount" },
  { key: "debit", label: "Debit Amount" },
  { key: "credit", label: "Credit Amount" },
  { key: "balance", label: "Balance" },
  { key: "currency", label: "Currency" },
  { key: "transaction_type", label: "Transaction Type" },
  { key: "description", label: "Description" },
];

type DatasetState = {
  table: RawTable | null;
  mapping: ColumnMapping;
  options: NormalizationOptions;
  report: ValidationReport | null;
  savedRowCount: number | null;
};

type Side = "statement" | "ledger";

/* ---------- Unsaved-draft recovery (PRD §57) ---------- */

const DRAFT_VERSION = 1;
// localStorage caps (~5MB); stay well under so big-but-reasonable files survive.
const DRAFT_MAX_CHARS = 2_000_000;

function draftKey(reconciliationId: string, side: Side): string {
  return `recon-wizard-draft:v${DRAFT_VERSION}:${reconciliationId}:${side}`;
}

function loadDraft(reconciliationId: string, side: Side): DatasetState | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(draftKey(reconciliationId, side));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      table?: RawTable;
      mapping?: ColumnMapping;
      options?: NormalizationOptions;
    };
    if (
      !parsed?.table ||
      !Array.isArray(parsed.table.headers) ||
      !Array.isArray(parsed.table.rows)
    ) {
      return null;
    }
    return {
      table: parsed.table,
      mapping: parsed.mapping ?? {},
      options: { dateFormat: "auto", ...(parsed.options ?? {}) },
      report: null,
      savedRowCount: null,
    };
  } catch {
    return null;
  }
}

function persistDraft(reconciliationId: string, side: Side, s: DatasetState): void {
  try {
    if (typeof window === "undefined") return;
    const key = draftKey(reconciliationId, side);
    // Nothing unsaved, or already committed server-side — drop the draft.
    if (!s.table || s.savedRowCount !== null) {
      window.localStorage.removeItem(key);
      return;
    }
    const raw = JSON.stringify({ table: s.table, mapping: s.mapping, options: s.options });
    if (raw.length > DRAFT_MAX_CHARS) return;
    window.localStorage.setItem(key, raw);
  } catch {
    // Quota or private mode — wizard keeps working without recovery.
  }
}

function clearDrafts(reconciliationId: string): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(draftKey(reconciliationId, "statement"));
    window.localStorage.removeItem(draftKey(reconciliationId, "ledger"));
  } catch {
    // ignore
  }
}

const EMPTY: DatasetState = {
  table: null,
  mapping: {},
  options: { dateFormat: "auto", defaultCurrency: undefined },
  report: null,
  savedRowCount: null,
};

const STEP_LABELS = [
  "Upload statement",
  "Map statement",
  "Preview statement",
  "Upload ledger",
  "Map ledger",
  "Preview ledger",
  "Review & run",
];

export function SetupWizard({
  reconciliationId,
  defaultCurrency,
  initialStep,
  existing,
  profiles,
}: {
  reconciliationId: string;
  defaultCurrency: string;
  initialStep: number;
  existing: {
    statement: { filename: string; rowCount: number } | null;
    ledger: { filename: string; rowCount: number } | null;
  };
  profiles: {
    id: string;
    name: string;
    source_type: "statement" | "ledger";
    mapping: Record<string, string>;
    normalization_options: Record<string, unknown>;
  }[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(() => resolveInitialStep(initialStep, existing));
  const [statement, setStatement] = useState<DatasetState>(existing.statement ? { ...EMPTY, savedRowCount: existing.statement.rowCount } : EMPTY);
  const [ledger, setLedger] = useState<DatasetState>(existing.ledger ? { ...EMPTY, savedRowCount: existing.ledger.rowCount } : EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveProfile, setSaveProfile] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [runResult, setRunResult] = useState<string | null>(null);
  const [restoredNote, setRestoredNote] = useState<string | null>(null);

  // Restore unsaved drafts after mount (avoids SSR hydration mismatch).
  // Intentional mount-time sync from external store (localStorage).
  useEffect(() => {
    const restored: string[] = [];
    if (!existing.statement) {
      const d = loadDraft(reconciliationId, "statement");
      if (d) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setStatement(d);
        restored.push("statement");
      }
    }
    if (!existing.ledger) {
      const d = loadDraft(reconciliationId, "ledger");
      if (d) {
        setLedger(d);
        restored.push("ledger");
      }
    }
    if (restored.length > 0) {
      setRestoredNote(`Unsaved ${restored.join(" + ")} draft restored from this browser.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist unsaved sides (debounced) so refresh doesn't lose work.
  useEffect(() => {
    const t = setTimeout(() => persistDraft(reconciliationId, "statement", statement), 500);
    return () => clearTimeout(t);
  }, [reconciliationId, statement]);
  useEffect(() => {
    const t = setTimeout(() => persistDraft(reconciliationId, "ledger", ledger), 500);
    return () => clearTimeout(t);
  }, [reconciliationId, ledger]);

  const side: Side = step <= 2 ? "statement" : "ledger";
  const state = side === "statement" ? statement : ledger;
  const setState = side === "statement" ? setStatement : setLedger;

  async function handleFile(file: File | null) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const table = await parseFile(file);
      const suggested = suggestMapping(table.headers);
      const applied = applyProfile(suggested, profiles, side);
      setState((s) => ({
        ...s,
        table,
        mapping: applied.mapping,
        options: { ...s.options, defaultCurrency: s.options.defaultCurrency ?? defaultCurrency },
        report: null,
      }));
      setStep(side === "statement" ? 1 : 4);
      if (applied.profileId) {
        // Best-effort analytics — a failed audit must never block the upload.
        await recordMappingReuseAction(applied.profileId);
      }
    } catch (e) {
      if (e instanceof ParseError) setError(e.message);
      else setError("Could not parse this file. Try CSV or XLSX.");
    } finally {
      setBusy(false);
    }
  }

  function recompute(s: DatasetState): DatasetState {
    if (!s.table) return s;
    const report = normalizeTable(s.table, s.mapping, {
      ...s.options,
      defaultCurrency: s.options.defaultCurrency ?? defaultCurrency,
    });
    return { ...s, report };
  }

  function updateMapping(key: string, columnIndex: string) {
    setState((s) => {
      const next = { ...s, mapping: { ...s.mapping } } as DatasetState;
      if (columnIndex === "") {
        delete (next.mapping as Record<string, string>)[key];
      } else {
        (next.mapping as Record<string, string>)[key] = columnIndex;
      }
      return recompute(next);
    });
  }

  function updateOptions(patch: Partial<NormalizationOptions>) {
    setState((s) => recompute({ ...s, options: { ...s.options, ...patch } }));
  }

  async function saveSideAndContinue(targetSide: Side) {
    const s = targetSide === "statement" ? statement : ledger;
    if (!s.table) return;
    setError(null);

    const report = normalizeTable(s.table, s.mapping, {
      ...s.options,
      defaultCurrency: s.options.defaultCurrency ?? defaultCurrency,
    });
    if (report.blocking.length > 0) {
      if (targetSide === "statement") setStatement({ ...s, report });
      else setLedger({ ...s, report });
      setError("Fix blocking issues before continuing.");
      return;
    }

    setBusy(true);
    try {
      const payload = {
        type: targetSide === "statement" ? ("supplier_statement" as const) : ("ap_ledger" as const),
        original_filename: s.table.filename,
        mapping: s.mapping,
        normalization_options: {
          ...s.options,
          defaultCurrency: s.options.defaultCurrency ?? defaultCurrency,
        },
        transactions: report.rows.map((r) => ({
          rowNumber: r.rowNumber,
          rawReference: r.rawReference,
          normalizedReference: r.normalizedReference,
          transactionDate: r.transactionDate,
          amount: r.amount === "" ? "0" : r.amount,
          currency: r.currency,
          transactionType: r.transactionType,
          rawData: r.rawData,
        })),
        save_profile: saveProfile && profileName.trim().length > 0,
        profile_name: profileName.trim() || undefined,
      };

      const result = await saveDatasetAction(reconciliationId, JSON.stringify(payload));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const saved = { ...s, report, savedRowCount: result.data?.rowCount ?? report.rows.length };
      if (targetSide === "statement") setStatement(saved);
      else setLedger(saved);
      setSaveProfile(false);
      setProfileName("");

      if (targetSide === "statement") setStep(3);
      else setStep(6);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    setError(null);
    setRunResult(null);
    setBusy(true);
    try {
      const result = await runReconciliationAction(reconciliationId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRunResult(`Matched ${result.data?.matchCount ?? 0} rows. Opening results…`);
      clearDrafts(reconciliationId);
      router.push(`/reconciliations/${reconciliationId}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const progress = Math.round(((step + 1) / STEP_LABELS.length) * 100);

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <div>
        <div className="flex flex-wrap gap-1.5">
          {STEP_LABELS.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                if (i < step) setStep(i);
                else if (i === step) return;
                else if (canAdvance(i, step, statement, ledger)) setStep(i);
              }}
              className={
                i === step
                  ? "rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-white"
                  : i < step || canAdvance(i, step, statement, ledger)
                    ? "rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200"
                    : "rounded-full bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-400"
              }
            >
              {i + 1}. {label}
            </button>
          ))}
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200">
          <div className="h-full bg-zinc-900 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {runResult && <Alert tone="success">{runResult}</Alert>}
      {restoredNote && <Alert tone="info">{restoredNote}</Alert>}

      {/* Step content */}
      {step === 0 || step === 3 ? (
        <UploadStep
          side={step === 0 ? "statement" : "ledger"}
          state={state}
          existing={step === 0 ? existing.statement : existing.ledger}
          busy={busy}
          onFile={handleFile}
          onSkipSaved={() => setStep(step === 0 ? 2 : 5)}
          canSkipSaved={Boolean(step === 0 ? existing.statement : existing.ledger)}
        />
      ) : null}

      {step === 1 || step === 4 ? (
        <MappingStep
          side={side}
          state={state}
          profiles={profiles}
          onUpdateMapping={updateMapping}
          onUpdateOptions={updateOptions}
          onBack={() => setStep(step - 1)}
          onNext={() => setStep(step + 1)}
          saveProfile={saveProfile}
          setSaveProfile={setSaveProfile}
          profileName={profileName}
          setProfileName={setProfileName}
        />
      ) : null}

      {step === 2 || step === 5 ? (
        <PreviewStep
          side={side}
          state={state}
          currency={defaultCurrency}
          onBack={() => setStep(step - 1)}
          onNext={async () => {
            if (side === "statement") await saveSideAndContinue("statement");
            else await saveSideAndContinue("ledger");
          }}
          busy={busy}
        />
      ) : null}

      {step === 6 ? (
        <ReviewStep
          statement={statement}
          ledger={ledger}
          currency={defaultCurrency}
          onBack={() => setStep(5)}
          onRun={run}
          busy={busy}
        />
      ) : null}
    </div>
  );
}

function resolveInitialStep(
  initialStep: number,
  existing: { statement: unknown; ledger: unknown },
): number {
  if (initialStep >= 0 && initialStep <= 6) {
    // Jump past already-uploaded sides, but never past review.
    if (initialStep >= 6) return 6;
    if (initialStep >= 3 && !existing.statement) return 0;
    return initialStep;
  }
  if (!existing.statement) return 0;
  if (!existing.ledger) return 3;
  return 6;
}

function canAdvance(
  target: number,
  current: number,
  statement: DatasetState,
  ledger: DatasetState,
): boolean {
  if (target <= current) return true;
  if (target <= 2) return Boolean(statement.table) || Boolean(statement.savedRowCount);
  if (target <= 5 && target >= 3) return Boolean(statement.savedRowCount ?? statement.table);
  if (target === 6) {
    return Boolean(statement.savedRowCount ?? statement.table) && Boolean(ledger.savedRowCount ?? ledger.table);
  }
  return false;
}

function applyProfile(
  suggested: Partial<ColumnMapping>,
  profiles: { id: string; source_type: string; mapping: Record<string, string>; normalization_options: Record<string, unknown> }[],
  side: Side,
): { mapping: ColumnMapping; profileId: string | null } {
  const match = profiles.find((p) => p.source_type === (side === "statement" ? "statement" : "ledger"));
  if (match) {
    return {
      mapping: {
        ...(match.mapping as ColumnMapping),
      } as ColumnMapping,
      profileId: match.id,
    };
  }
  return {
    mapping: {
      reference: suggested.reference ?? "",
      amount: suggested.amount ?? "",
      transaction_date: suggested.transaction_date ?? "",
      debit: suggested.debit ?? "",
      credit: suggested.credit ?? "",
      currency: suggested.currency ?? "",
      transaction_type: suggested.transaction_type ?? "",
      description: suggested.description ?? "",
      due_date: suggested.due_date ?? "",
      balance: suggested.balance ?? "",
      ...Object.fromEntries(Object.entries(suggested).filter(([, v]) => v)),
    } as ColumnMapping,
    profileId: null,
  };
}

/* ------------------------------- Steps ------------------------------- */

function UploadStep({
  side,
  state,
  existing,
  busy,
  onFile,
  onSkipSaved,
  canSkipSaved,
}: {
  side: Side;
  state: DatasetState;
  existing: { filename: string; rowCount: number } | null;
  busy: boolean;
  onFile: (f: File | null) => void;
  onSkipSaved: () => void;
  canSkipSaved: boolean;
}) {
  const title = side === "statement" ? "Upload supplier statement" : "Upload AP ledger export";
  const hint =
    side === "statement"
      ? "CSV, XLSX, or text-based PDF. Up to 20 MB / 20,000 rows. Parsed entirely in your browser."
      : "Your accounts-payable ledger export (CSV/XLSX/PDF). Parsed entirely in your browser.";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{hint}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {existing && (
          <Alert tone="info">
            {existing.rowCount.toLocaleString()} rows already saved from{" "}
            <strong>{existing.filename}</strong>. Upload again to replace it.
          </Alert>
        )}
        {state.table && (
          <Alert tone="success">
            Loaded <strong>{state.table.filename}</strong> — {state.table.rows.length.toLocaleString()} rows,{" "}
            {state.table.headers.length} columns.
          </Alert>
        )}
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-zinc-300 bg-zinc-50 px-6 py-10 text-center hover:border-zinc-400 hover:bg-zinc-100">
          <input
            type="file"
            className="sr-only"
            accept=".csv,.xlsx,.xls,.pdf,text/csv,application/pdf"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
          <span className="text-sm font-medium text-zinc-900">
            {busy ? "Parsing…" : "Click to choose a file"}
          </span>
          <span className="mt-1 text-xs text-zinc-500">.csv · .xlsx · .xls · .pdf</span>
        </label>
        {canSkipSaved && (
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onSkipSaved}>
              Continue with saved file
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MappingStep({
  side,
  state,
  profiles,
  onUpdateMapping,
  onUpdateOptions,
  onBack,
  onNext,
  saveProfile,
  setSaveProfile,
  profileName,
  setProfileName,
}: {
  side: Side;
  state: DatasetState;
  profiles: { id: string; name: string; source_type: string }[];
  onUpdateMapping: (key: string, colIndex: string) => void;
  onUpdateOptions: (patch: Partial<NormalizationOptions>) => void;
  onBack: () => void;
  onNext: () => void;
  saveProfile: boolean;
  setSaveProfile: (v: boolean) => void;
  profileName: string;
  setProfileName: (v: string) => void;
}) {
  const table = state.table;

  const profileList = profiles.filter((p) => p.source_type === (side === "statement" ? "statement" : "ledger"));

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Map columns — {side === "statement" ? "supplier statement" : "AP ledger"}
        </CardTitle>
        <CardDescription>
          Match spreadsheet columns to reconciliation fields. Amount can be a single column or
          Debit + Credit. Reference matching is normalized (case/spacing/punctuation).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {profileList.length > 0 && (
          <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
            Saved mapping profiles for this side were auto-applied when present. Manage them in
            Settings.
          </div>
        )}

        {!table ? (
          <Alert tone="warning">No file loaded — go back to upload.</Alert>
        ) : (
          <>
            <div className="overflow-x-auto rounded-md border border-zinc-200">
              <Table>
                <thead>
                  <tr>
                    <Th>Field</Th>
                    <Th>Source column</Th>
                    <Th>Sample values</Th>
                  </tr>
                </thead>
                <tbody>
                  {FIELD_OPTIONS.filter((f) => f.key !== "").map((field) => {
                    const mappedIndex =
                      field.key in state.mapping && state.mapping[field.key as keyof ColumnMapping] !== ""
                        ? String(state.mapping[field.key as keyof ColumnMapping])
                        : "";
                    const sample = mappedIndex
                      ? table.rows
                          .slice(0, 3)
                          .map((r) => r[Number(mappedIndex)] ?? "")
                          .filter(Boolean)
                          .join(" · ")
                      : "";
                    const isRequired = field.key === "reference" || field.key === "amount";
                    return (
                      <Tr key={field.key}>
                        <Td className="font-medium">
                          {field.label}
                          {isRequired && <span className="text-red-500 ml-0.5">*</span>}
                        </Td>
                        <Td>
                          <Select
                            value={mappedIndex}
                            onChange={(e) => {
                              onUpdateMapping(field.key, e.target.value);
                            }}
                            className="min-w-48"
                          >
                            <option value="">— not mapped —</option>
                            {table.headers.map((h, i) => (
                              <option key={i} value={String(i)}>
                                {h} (col {i + 1})
                              </option>
                            ))}
                          </Select>
                        </Td>
                        <Td className="max-w-md truncate font-mono text-xs text-zinc-500">
                          {sample || "—"}
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="date-format">Date format</Label>
                <Select
                  id="date-format"
                  value={state.options.dateFormat ?? "auto"}
                  onChange={(e) => onUpdateOptions({ dateFormat: e.target.value as NormalizationOptions["dateFormat"] })}
                >
                  {DATE_FORMAT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="dec-sep">Decimal separator</Label>
                <Select
                  id="dec-sep"
                  value={state.options.decimalSeparator ?? ""}
                  onChange={(e) =>
                    onUpdateOptions({
                      decimalSeparator: (e.target.value || undefined) as "." | "," | undefined,
                    })
                  }
                >
                  <option value="">Auto</option>
                  <option value=".">Period (1234.56)</option>
                  <option value=",">Comma (1234,56)</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="thou-sep">Thousands separator</Label>
                <Select
                  id="thou-sep"
                  value={state.options.thousandsSeparator ?? ""}
                  onChange={(e) =>
                    onUpdateOptions({
                      thousandsSeparator: (e.target.value || undefined) as "," | "." | " " | undefined,
                    })
                  }
                >
                  <option value="">Auto</option>
                  <option value=",">Comma (1,234.56)</option>
                  <option value=".">Period (1.234,56)</option>
                  <option value=" ">Space (1 234,56)</option>
                </Select>
              </div>
            </div>

            <div className="flex items-end gap-4">
              <div className="flex-1">
                <Label htmlFor="profile-name">Save as mapping profile (optional)</Label>
                <Input
                  id="profile-name"
                  value={profileName}
                  onChange={(e) => {
                    setProfileName(e.target.value);
                    setSaveProfile(e.target.value.trim().length > 0);
                  }}
                  placeholder="e.g. Acme statement format"
                />
              </div>
              <label className="flex h-10 items-center gap-2 text-xs text-zinc-700">
                <input
                  type="checkbox"
                  checked={saveProfile}
                  onChange={(e) => setSaveProfile(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300"
                />
                Save profile
              </label>
            </div>
          </>
        )}

        <div className="flex justify-between">
          <Button variant="secondary" onClick={onBack}>
            Back
          </Button>
          <Button onClick={onNext} disabled={!table}>
            Continue to preview
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PreviewStep({
  side,
  state,
  currency,
  onBack,
  onNext,
  busy,
}: {
  side: Side;
  state: DatasetState;
  currency: string;
  onBack: () => void;
  onNext: () => void;
  busy: boolean;
}) {
  const report = useMemo(() => {
    if (!state.table) return null;
    return (
      state.report ??
      normalizeTable(state.table, state.mapping, {
        ...state.options,
        defaultCurrency: state.options.defaultCurrency ?? currency,
      })
    );
  }, [state, currency]);

  if (!report) {
    return (
      <Alert tone="warning">No file loaded — go back to upload.</Alert>
    );
  }

  const stats = report.stats;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>
            Preview & normalize — {side === "statement" ? "supplier statement" : "AP ledger"}
          </CardTitle>
          <CardDescription>
            Raw values are preserved alongside normalized fields. Blocking issues must be fixed
            before saving.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {report.blocking.length > 0 && (
            <Alert tone="error">
              <ul className="list-disc pl-4">
                {report.blocking.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </Alert>
          )}
          {report.warnings.length > 0 && (
            <Alert tone="warning">
              <ul className="list-disc pl-4">
                {report.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Alert>
          )}

          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Rows" value={stats.total.toLocaleString()} />
            <Stat label="Valid" value={stats.valid.toLocaleString()} tone={stats.valid === stats.total ? "good" : "warn"} />
            <Stat label="Warnings" value={(stats.missingReference + stats.missingDates + stats.ambiguousDates).toLocaleString()} />
            <Stat
              label="Currency"
              value={report.detectedCurrencies.join(", ") || state.options.defaultCurrency || currency}
            />
          </div>

          <div className="overflow-x-auto rounded-md border border-zinc-200">
            <Table>
              <thead>
                <tr>
                  <Th>Row</Th>
                  <Th>Raw ref</Th>
                  <Th>Normalized ref</Th>
                  <Th>Date</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Type</Th>
                  <Th>Flags</Th>
                </tr>
              </thead>
              <tbody>
                {report.preview.map((r) => (
                  <Tr key={r.rowNumber}>
                    <Td className="tabular-nums text-zinc-500">{r.rowNumber}</Td>
                    <Td className="font-mono text-xs">{r.rawReference || "—"}</Td>
                    <Td className="font-mono text-xs">{r.normalizedReference || "—"}</Td>
                    <Td className="text-xs">{r.transactionDate ?? "—"}</Td>
                    <Td className="text-right font-mono text-xs tabular-nums">
                      {r.amount === "" ? "—" : formatMoney(r.amount)}
                    </Td>
                    <Td className="text-xs">{r.transactionType}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {r.errors.map((e) => (
                          <Badge key={e} className="border-red-200 bg-red-50 text-red-700">
                            {e}
                          </Badge>
                        ))}
                        {r.warnings.map((w) => (
                          <Badge key={w} className="border-amber-200 bg-amber-50 text-amber-700">
                            {w}
                          </Badge>
                        ))}
                        {r.errors.length === 0 && r.warnings.length === 0 && (
                          <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
                            OK
                          </Badge>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
          {report.stats.total > report.preview.length && (
            <p className="text-xs text-zinc-500">
              Showing first {report.preview.length} of {report.stats.total.toLocaleString()} rows.
            </p>
          )}

          <div className="flex justify-between">
            <Button variant="secondary" onClick={onBack}>
              Back to mapping
            </Button>
            <Button onClick={onNext} loading={busy} disabled={report.blocking.length > 0}>
              Save {side === "statement" ? "statement" : "ledger"} & continue
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn";
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
      <p className="text-[11px] font-medium text-zinc-500">{label}</p>
      <p
        className={
          tone === "good"
            ? "text-sm font-semibold text-emerald-700 tabular-nums"
            : tone === "warn"
              ? "text-sm font-semibold text-amber-700 tabular-nums"
              : "text-sm font-semibold text-zinc-900 tabular-nums"
        }
      >
        {value}
      </p>
    </div>
  );
}

function ReviewStep({
  statement,
  ledger,
  currency,
  onBack,
  onRun,
  busy,
}: {
  statement: DatasetState;
  ledger: DatasetState;
  currency: string;
  onBack: () => void;
  onRun: () => void;
  busy: boolean;
}) {
  const sRows = statement.savedRowCount ?? statement.report?.stats.total ?? 0;
  const lRows = ledger.savedRowCount ?? ledger.report?.stats.total ?? 0;
  const ready = sRows > 0 && lRows > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review & run</CardTitle>
        <CardDescription>
          The engine runs deterministic passes: exact → amount mismatch → duplicates → probable
          (never auto-accepted) → missing on each side. Every transaction appears in exactly one
          match.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-zinc-200 p-4">
            <p className="text-xs font-medium text-zinc-500">Supplier statement</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-900">
              {sRows.toLocaleString()} rows
            </p>
            <p className="text-xs text-zinc-500">
              {statement.table?.filename ?? "Saved file"}
            </p>
          </div>
          <div className="rounded-md border border-zinc-200 p-4">
            <p className="text-xs font-medium text-zinc-500">AP ledger</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-900">
              {lRows.toLocaleString()} rows
            </p>
            <p className="text-xs text-zinc-500">{ledger.table?.filename ?? "Saved file"}</p>
          </div>
        </div>

        {!ready && (
          <Alert tone="warning">Both datasets must be saved before running.</Alert>
        )}

        <div className="flex justify-between">
          <Button variant="secondary" onClick={onBack}>
            Back
          </Button>
          <Button onClick={onRun} loading={busy} disabled={!ready}>
            Run reconciliation ({currency})
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
