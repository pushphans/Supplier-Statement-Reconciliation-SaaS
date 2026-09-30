"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  acceptMatchAction,
  rejectMatchAction,
  resolveExceptionAction,
  manualMatchAction,
} from "@/app/actions/matches";
import {
  completeReconciliationAction,
  reopenReconciliationAction,
} from "@/app/actions/reconciliations";
import { formatMoney, MATCH_TYPE_LABELS, matchTypeBadgeClass } from "@/lib/format";
import { Alert, Badge, Button, Select, Td } from "@/components/ui";

export type MatchRow = {
  id: string;
  match_type: string;
  confidence_score: string | null;
  reason: string;
  difference_amount: string | null;
  user_confirmed: boolean;
  statement:
    | {
        id: string;
        source_row_number: number;
        raw_reference: string;
        normalized_reference: string;
        transaction_date: string | null;
        amount: string;
        currency: string | null;
      }
    | null;
  ledger:
    | {
        id: string;
        source_row_number: number;
        raw_reference: string;
        normalized_reference: string;
        transaction_date: string | null;
        amount: string;
        currency: string | null;
      }
    | null;
  resolution: { status: string; note: string | null } | null;
};

export function MatchActions({
  match,
  status,
}: {
  match: MatchRow;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState(match.resolution?.note ?? "");
  const [showResolve, setShowResolve] = useState(false);

  const isCompleted = status === "completed";
  const isProbable = match.match_type === "probable_match" && !match.user_confirmed;
  const isException = [
    "amount_mismatch",
    "missing_in_ledger",
    "missing_on_statement",
    "duplicate_statement",
    "duplicate_ledger",
  ].includes(match.match_type);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? "Action failed.");
      else router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex flex-wrap items-center gap-1.5 justify-end">
        {isProbable && !isCompleted && (
          <>
            <Button
              size="sm"
              loading={pending}
              onClick={() => run(() => acceptMatchAction(match.id))}
            >
              Accept
            </Button>
            <Button
              size="sm"
              variant="secondary"
              loading={pending}
              onClick={() => run(() => rejectMatchAction(match.id))}
            >
              Reject
            </Button>
          </>
        )}
        {isException && !isCompleted && (
          <Button size="sm" variant="ghost" onClick={() => setShowResolve((v) => !v)}>
            {match.resolution ? "Update resolution" : "Resolve"}
          </Button>
        )}
        {match.resolution && (
          <Badge
            className={
              match.resolution.status === "resolved"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : match.resolution.status === "ignored"
                  ? "border-zinc-200 bg-zinc-100 text-zinc-600"
                  : "border-amber-200 bg-amber-50 text-amber-700"
            }
          >
            {match.resolution.status.replace("_", " ")}
          </Badge>
        )}
      </div>

      {showResolve && !isCompleted && (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <div className="flex flex-wrap gap-2">
            <Select
              className="w-44"
              value={match.resolution?.status ?? "needs_investigation"}
              onChange={(e) => setNote(e.target.value)}
              id={`res-${match.id}`}
            >
              <option value="needs_investigation">Needs investigation</option>
              <option value="resolved">Resolved</option>
              <option value="ignored">Ignored</option>
            </Select>
            <input
              className="h-8 flex-1 rounded-md border border-zinc-300 px-2 text-xs"
              placeholder="Resolution note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button
              size="sm"
              loading={pending}
              onClick={() => {
                const statusSelect = document.getElementById(
                  `res-${match.id}`,
                ) as HTMLSelectElement | null;
                const chosen = (statusSelect?.value ?? "needs_investigation") as
                  | "resolved"
                  | "ignored"
                  | "needs_investigation";
                run(() =>
                  resolveExceptionAction({ matchId: match.id, status: chosen, note }),
                );
                setShowResolve(false);
              }}
            >
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ExportButtons({
  reconciliationId,
  orgName,
  supplierName,
  period,
  status,
  unresolved,
  exactCount,
  resolvedCount,
  ignoredCount,
}: {
  reconciliationId: string;
  orgName: string;
  supplierName: string;
  period: string;
  status: string;
  unresolved: number;
  exactCount: number;
  resolvedCount: number;
  ignoredCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const base = `/api/reconciliations/${reconciliationId}/export`;

  function complete() {
    setError(null);
    startTransition(async () => {
      const result = await completeReconciliationAction(reconciliationId);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function reopen() {
    setError(null);
    startTransition(async () => {
      const result = await reopenReconciliationAction(reconciliationId);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`${base}?type=matches`}
          className="inline-flex h-8 items-center rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
          download
        >
          Export matches CSV
        </a>
        <a
          href={`${base}?type=exceptions`}
          className="inline-flex h-8 items-center rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
          download
        >
          Export exceptions CSV
        </a>
        <a
          href={`${base}?type=summary`}
          className="inline-flex h-8 items-center rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
          download
        >
          Export summary CSV
        </a>
        <span className="text-[11px] text-zinc-500">Formula-injection safe</span>
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        {status !== "completed" ? (
          confirming ? (
            <div className="w-full rounded-md border border-zinc-300 bg-zinc-50 p-3">
              <p className="text-xs font-medium text-zinc-900">Completion summary</p>
              <p className="mt-1 text-xs tabular-nums text-zinc-700">
                Exact matches: {exactCount} · Resolved: {resolvedCount} · Ignored:{" "}
                {ignoredCount} · Unresolved: {unresolved}
              </p>
              {unresolved > 0 ? (
                <p className="mt-1 text-xs text-amber-700">
                  {unresolved} exception{unresolved === 1 ? "" : "s"} still need
                  {unresolved === 1 ? "s" : ""} review. Complete anyway?
                </p>
              ) : (
                <p className="mt-1 text-xs text-emerald-700">
                  Everything is resolved — safe to complete.
                </p>
              )}
              <div className="mt-2 flex gap-2">
                <Button size="sm" loading={pending} onClick={complete}>
                  {unresolved > 0 ? "Complete anyway" : "Confirm completion"}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setConfirming(false)}>
                  Keep reviewing
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" loading={pending} onClick={() => setConfirming(true)}>
              Complete reconciliation{unresolved > 0 ? ` (${unresolved} unresolved)` : ""}
            </Button>
          )
        ) : (
          <Button size="sm" variant="secondary" loading={pending} onClick={reopen}>
            Reopen for editing
          </Button>
        )}
        <span className="self-center text-[11px] text-zinc-500">
          {orgName} · {supplierName} · {period}
        </span>
      </div>
    </div>
  );
}

export function ManualMatchPanel({
  reconciliationId,
  statementCandidates,
  ledgerCandidates,
  disabled,
}: {
  reconciliationId: string;
  statementCandidates: { id: string; label: string }[];
  ledgerCandidates: { id: string; label: string }[];
  disabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [statementId, setStatementId] = useState("");
  const [ledgerId, setLedgerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (disabled) return null;
  if (statementCandidates.length === 0 || ledgerCandidates.length === 0) {
    return (
      <p className="text-xs text-zinc-500">
        Manual matching needs unmatched rows on both sides. When one side is fully matched,
        nothing to pair.
      </p>
    );
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <p className="mb-2 text-xs font-medium text-zinc-700">Manual match</p>
      {error && (
        <div className="mb-2">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      {success && (
        <div className="mb-2">
          <Alert tone="success">{success}</Alert>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-[11px] text-zinc-500" htmlFor="mm-stmt">
            Statement row
          </label>
          <Select
            id="mm-stmt"
            className="h-8 min-w-56 py-1 text-xs"
            value={statementId}
            onChange={(e) => setStatementId(e.target.value)}
          >
            <option value="">Select…</option>
            {statementCandidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="block text-[11px] text-zinc-500" htmlFor="mm-ledger">
            Ledger row
          </label>
          <Select
            id="mm-ledger"
            className="h-8 min-w-56 py-1 text-xs"
            value={ledgerId}
            onChange={(e) => setLedgerId(e.target.value)}
          >
            <option value="">Select…</option>
            {ledgerCandidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
        <Button
          size="sm"
          disabled={!statementId || !ledgerId}
          loading={pending}
          onClick={() => {
            setError(null);
            setSuccess(null);
            startTransition(async () => {
              const result = await manualMatchAction(statementId, ledgerId);
              if (!result.ok) setError(result.error);
              else {
                setSuccess("Manual match saved.");
                setStatementId("");
                setLedgerId("");
                router.refresh();
              }
            });
          }}
        >
          Match selected
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-zinc-500">
        Manual matches are recorded as <code>manually_matched</code> with a full audit event
        (id {reconciliationId.slice(0, 8)}…).
      </p>
    </div>
  );
}

export function TypeFilter({
  reconciliationId,
  current,
}: {
  reconciliationId: string;
  current: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  return (
    <select
      aria-label="Filter by match type"
      value={current}
      onChange={(e) => {
        const v = e.target.value;
        const next = new URLSearchParams(searchParams.toString());
        next.set("tab", "matches");
        next.delete("page");
        if (v) next.set("type", v);
        else next.delete("type");
        router.push(`/reconciliations/${reconciliationId}?${next.toString()}`);
      }}
      className="h-8 rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-800"
    >
      <option value="">All types</option>
      {[
        "exact_match",
        "probable_match",
        "manually_matched",
        "amount_mismatch",
        "missing_in_ledger",
        "missing_on_statement",
        "duplicate_statement",
        "duplicate_ledger",
      ].map((t) => (
        <option key={t} value={t}>
          {MATCH_TYPE_LABELS[t] ?? t}
        </option>
      ))}
    </select>
  );
}

export function ResultToolbar({
  reconciliationId,
  tab,
  q,
  sort,
  dir,
}: {
  reconciliationId: string;
  tab: string;
  q: string;
  sort: string;
  dir: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(q);

  function go(next: { q?: string; sort?: string; dir?: string }) {
    const params = new URLSearchParams();
    params.set("tab", tab);
    const nq = next.q ?? q;
    const ns = next.sort ?? sort;
    const nd = next.dir ?? dir;
    if (nq) params.set("q", nq);
    if (ns) {
      params.set("sort", ns);
      params.set("dir", nd || "asc");
    }
    router.push(`/reconciliations/${reconciliationId}?${params.toString()}`);
  }

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        go({ q: value.trim() });
      }}
    >
      <div>
        <label className="block text-[11px] font-medium text-zinc-500" htmlFor="match-search">
          Search reference
        </label>
        <input
          id="match-search"
          className="h-8 w-52 rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-900"
          placeholder="e.g. INV-1002"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-[11px] font-medium text-zinc-500" htmlFor="match-sort">
          Sort by
        </label>
        <Select
          id="match-sort"
          className="h-8 py-1 text-xs"
          value={sort}
          onChange={(e) => go({ sort: e.target.value })}
        >
          <option value="">Default order</option>
          <option value="ref">Reference</option>
          <option value="amount">Amount</option>
          <option value="date">Date</option>
        </Select>
      </div>
      {sort && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => go({ dir: dir === "desc" ? "asc" : "desc" })}
          aria-label={`Sort direction ${dir === "desc" ? "descending" : "ascending"}`}
        >
          {dir === "desc" ? "↓ Desc" : "↑ Asc"}
        </Button>
      )}
      <Button type="submit" size="sm" variant="secondary">
        Search
      </Button>
      {(q || sort) && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setValue("");
            router.push(`/reconciliations/${reconciliationId}?tab=${tab}`);
          }}
        >
          Clear
        </Button>
      )}
    </form>
  );
}

export function MatchTypeBadge({ type, confirmed }: { type: string; confirmed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Badge className={matchTypeBadgeClass(type)}>{MATCH_TYPE_LABELS[type] ?? type}</Badge>
      {type === "probable_match" && confirmed && (
        <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">confirmed</Badge>
      )}
    </span>
  );
}

export function MatchCells({ match, currency }: { match: MatchRow; currency: string }) {
  return (
    <>
      <Td>
        {match.statement ? (
          <div>
            <span className="font-mono text-xs">{match.statement.raw_reference || "—"}</span>
            <div className="text-[11px] text-zinc-500">
              row {match.statement.source_row_number}
              {match.statement.transaction_date ? ` · ${match.statement.transaction_date}` : ""}
            </div>
          </div>
        ) : (
          <span className="text-zinc-400">—</span>
        )}
      </Td>
      <Td className="text-right font-mono text-xs tabular-nums">
        {match.statement ? formatMoney(match.statement.amount, match.statement.currency ?? currency) : "—"}
      </Td>
      <Td>
        {match.ledger ? (
          <div>
            <span className="font-mono text-xs">{match.ledger.raw_reference || "—"}</span>
            <div className="text-[11px] text-zinc-500">
              row {match.ledger.source_row_number}
              {match.ledger.transaction_date ? ` · ${match.ledger.transaction_date}` : ""}
            </div>
          </div>
        ) : (
          <span className="text-zinc-400">—</span>
        )}
      </Td>
      <Td className="text-right font-mono text-xs tabular-nums">
        {match.ledger ? formatMoney(match.ledger.amount, match.ledger.currency ?? currency) : "—"}
      </Td>
      <Td className="text-right font-mono text-xs tabular-nums">
        {match.difference_amount !== null ? formatMoney(match.difference_amount) : "—"}
      </Td>
    </>
  );
}
