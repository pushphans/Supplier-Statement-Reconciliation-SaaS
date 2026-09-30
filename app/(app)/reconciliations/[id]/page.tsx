import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { getExceptionCounts } from "@/lib/server/ops";
import {
  formatMoney,
  statusBadgeClass,
  STATUS_LABELS,
} from "@/lib/format";
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import {
  ExportButtons,
  ManualMatchPanel,
  MatchCells,
  MatchActions,
  MatchTypeBadge,
  ResultToolbar,
  TypeFilter,
  type MatchRow,
} from "@/components/results/match-actions";

export const metadata = { title: "Reconciliation results" };

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "matches", label: "All matches" },
  { key: "probable", label: "Probable review" },
  { key: "exceptions", label: "Exceptions" },
];

export default async function ReconciliationPage({
  params,
  searchParams,
}: PageProps<"/reconciliations/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" && TABS.some((t) => t.key === sp.tab) ? sp.tab : "overview";
  const matchTypeFilter = typeof sp.type === "string" ? sp.type : "";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const sortKey =
    sp.sort === "ref" || sp.sort === "amount" || sp.sort === "date"
      ? (sp.sort as "ref" | "amount" | "date")
      : null;
  const sortDir = sp.dir === "desc" ? "desc" : "asc";
  const wantsSearchSort = (q.length > 0 || sortKey !== null) && tab !== "overview";
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const pageSize = 25;
  // Search/sort need the full tab set in memory; cap keeps page loads bounded.
  const CLIENT_LIMIT = 5000;
  const searchSortParams = `${q ? `&q=${encodeURIComponent(q)}` : ""}${sortKey ? `&sort=${sortKey}&dir=${sortDir}` : ""}`;

  const ctx = await requireOrg();
  const supabase = await createClient();

  const { data: recon } = await supabase
    .from("reconciliations")
    .select(
      `id, organization_id, status, currency, period_start, period_end,
       statement_total, ledger_total, total_difference, created_at, completed_at,
       completed_by, created_by,
       suppliers(name)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (!recon || recon.organization_id !== ctx.organization.id) notFound();

  // RLS-safe attribution: fellow member names are not readable, only own id is.
  const completedByLabel =
    recon.completed_by == null
      ? null
      : recon.completed_by === ctx.user.id
        ? "by you"
        : "by a team member";

  const supplierName =
    (recon.suppliers as unknown as { name?: string } | null)?.name ?? "Supplier";

  const { counts } = await getExceptionCounts(supabase, id);

  const { data: datasets } = await supabase
    .from("source_datasets")
    .select("type, original_filename, row_count")
    .eq("reconciliation_id", id);

  // Summary counts by match type
  const { data: typeRows } = await supabase
    .from("reconciliation_matches")
    .select("match_type, user_confirmed")
    .eq("reconciliation_id", id);

  const typeCounts: Record<string, number> = {};
  for (const r of typeRows ?? []) {
    typeCounts[r.match_type] = (typeCounts[r.match_type] ?? 0) + 1;
  }

  // Matches query (tab + type filters shared by both fetch paths)
  function baseMatchQuery() {
    let matchQuery = supabase
      .from("reconciliation_matches")
      .select(
        `id, match_type, confidence_score, reason, difference_amount, user_confirmed,
         statement:source_transactions!reconciliation_matches_statement_transaction_id_fkey (
           id, source_row_number, raw_reference, normalized_reference, transaction_date, amount, currency
         ),
         ledger:source_transactions!reconciliation_matches_ledger_transaction_id_fkey (
           id, source_row_number, raw_reference, normalized_reference, transaction_date, amount, currency
         ),
         exception_resolutions(status, note)`,
        { count: "exact" },
      )
      .eq("reconciliation_id", id)
      .order("match_type");

    if (tab === "probable") {
      matchQuery = matchQuery.eq("match_type", "probable_match").eq("user_confirmed", false);
    } else if (tab === "exceptions") {
      matchQuery = matchQuery.in("match_type", [
        "amount_mismatch",
        "missing_in_ledger",
        "missing_on_statement",
        "duplicate_statement",
        "duplicate_ledger",
        "probable_match",
      ]);
    } else if (tab === "matches" && matchTypeFilter) {
      matchQuery = matchQuery.eq("match_type", matchTypeFilter);
    }
    return matchQuery;
  }

  let matches: MatchRow[] = [];
  let matchCount = 0;
  let tabTotal = 0;
  let clientNotice: string | null = null;

  if (tab === "overview") {
    matches = [];
    matchCount = 0;
  } else if (wantsSearchSort) {
    const { data: allData, count: allCount } = await baseMatchQuery().range(
      0,
      CLIENT_LIMIT - 1,
    );
    if ((allCount ?? 0) > CLIENT_LIMIT) {
      clientNotice = `Search & sorting cover the first ${CLIENT_LIMIT.toLocaleString()} rows — use tabs and type filters to narrow larger runs.`;
    }
    let rows = toMatchRows(allData);
    tabTotal = allCount ?? rows.length;
    if (q) {
      const needle = q.toLowerCase();
      rows = rows.filter((m) =>
        [
          m.statement?.raw_reference,
          m.statement?.normalized_reference,
          m.ledger?.raw_reference,
          m.ledger?.normalized_reference,
        ].some((v) => (v ?? "").toLowerCase().includes(needle)),
      );
    }
    if (sortKey) rows = sortMatchRows(rows, sortKey, sortDir);
    matchCount = rows.length;
    const safePage = Math.min(page, Math.max(1, Math.ceil(rows.length / pageSize)));
    matches = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  } else {
    const { data: matchData, count } = await baseMatchQuery().range(
      (page - 1) * pageSize,
      page * pageSize - 1,
    );
    matches = toMatchRows(matchData);
    matchCount = count ?? 0;
    tabTotal = matchCount;
  }

  // Unmatched candidates for manual matching
  const unmatched = tab === "exceptions" ? await loadUnmatched(supabase, id) : null;

  const totalPages = Math.max(1, Math.ceil((matchCount ?? 0) / pageSize));
  const period =
    recon.period_start || recon.period_end
      ? `${recon.period_start ?? "…"} → ${recon.period_end ?? "…"}`
      : "No period";

  const isCompleted = recon.status === "completed";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-zinc-900">{supplierName}</h1>
            <Badge className={statusBadgeClass(recon.status)}>
              {STATUS_LABELS[recon.status]}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-zinc-500">
            {period} · {recon.currency} · created{" "}
            {new Date(recon.created_at).toLocaleDateString()}
            {recon.completed_at
              ? ` · completed ${new Date(recon.completed_at).toLocaleDateString()}${completedByLabel ? ` ${completedByLabel}` : ""}`
              : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {recon.status === "draft" && (
            <Link
              href={`/reconciliations/${id}/setup`}
              className="inline-flex h-9 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Continue setup
            </Link>
          )}
          <ExportButtons
            reconciliationId={id}
            orgName={ctx.organization.name}
            supplierName={supplierName}
            period={period}
            status={recon.status}
            unresolved={counts.unresolved}
            exactCount={typeCounts.exact_match ?? 0}
            resolvedCount={counts.resolved}
            ignoredCount={counts.ignored}
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Statement total" value={formatMoney(recon.statement_total, recon.currency)} />
        <SummaryCard label="Ledger total" value={formatMoney(recon.ledger_total, recon.currency)} />
        <SummaryCard
          label="Difference"
          value={formatMoney(recon.total_difference, recon.currency)}
          accent={recon.total_difference !== null && recon.total_difference !== "0"}
        />
        <SummaryCard
          label="Open exceptions"
          value={`${counts.unresolved}`}
          accent={counts.unresolved > 0}
          sub={`${counts.probablePending} probable pending`}
        />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200">
        <nav className="flex gap-1" aria-label="Result tabs">
          {TABS.map((t) => {
            const active = tab === t.key;
            const badge =
              t.key === "probable" && counts.probablePending > 0
                ? counts.probablePending
                : t.key === "exceptions" && counts.exceptions > 0
                  ? counts.exceptions
                  : null;
            return (
              <Link
                key={t.key}
                href={`/reconciliations/${id}?tab=${t.key}${searchSortParams}`}
                className={
                  active
                    ? "border-b-2 border-zinc-900 px-3 py-2 text-sm font-medium text-zinc-900"
                    : "border-b-2 border-transparent px-3 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-800"
                }
              >
                {t.label}
                {badge !== null && (
                  <span className="ml-1.5 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] tabular-nums text-zinc-700">
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        {tab === "matches" && (
          <div className="pb-1">
            <TypeFilter reconciliationId={id} current={matchTypeFilter} />
          </div>
        )}
      </div>

      {/* Content */}
      {tab === "overview" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Match breakdown</CardTitle>
              <CardDescription>Every transaction appears in exactly one match.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <thead>
                  <tr>
                    <Th>Type</Th>
                    <Th className="text-right">Count</Th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(typeCounts)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([type, n]) => (
                      <Tr key={type}>
                        <Td>
                          <MatchTypeBadge type={type} />
                        </Td>
                        <Td className="text-right tabular-nums">{n}</Td>
                      </Tr>
                    ))}
                  {Object.keys(typeCounts).length === 0 && (
                    <Tr>
                      <Td colSpan={2} className="py-6 text-center text-zinc-500">
                        {recon.status === "draft"
                          ? "Not run yet — finish setup."
                          : "No matches."}
                      </Td>
                    </Tr>
                  )}
                </tbody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Source files</CardTitle>
            </CardHeader>
            <CardContent>
              {datasets && datasets.length > 0 ? (
                <ul className="divide-y divide-zinc-100">
                  {datasets.map((d) => (
                    <li key={d.type} className="flex items-center justify-between py-3">
                      <div>
                        <p className="text-sm font-medium text-zinc-900">
                          {d.type === "supplier_statement" ? "Supplier statement" : "AP ledger"}
                        </p>
                        <p className="text-xs text-zinc-500">{d.original_filename}</p>
                      </div>
                      <span className="text-xs tabular-nums text-zinc-600">
                        {d.row_count.toLocaleString()} rows
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-500">No files uploaded yet.</p>
              )}
              <p className="mt-4 rounded-md bg-zinc-50 px-3 py-2 text-[11px] leading-relaxed text-zinc-600">
                Reason strings on each match record exactly why it was classified — deterministic,
                reviewable, no model decisions.
              </p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-4">
          <ResultToolbar
            reconciliationId={id}
            tab={tab}
            q={q}
            sort={sortKey ?? ""}
            dir={sortDir}
          />
          {clientNotice && <Alert tone="info">{clientNotice}</Alert>}
          {tab === "exceptions" && unmatched && (
            <Card>
              <CardHeader>
                <CardTitle>Manual matching</CardTitle>
                <CardDescription>
                  Pair a statement row with a ledger row when neither automatic nor probable
                  matching applied.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ManualMatchPanel
                  reconciliationId={id}
                  statementCandidates={unmatched.statement}
                  ledgerCandidates={unmatched.ledger}
                  disabled={isCompleted}
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>
                  {TABS.find((t) => t.key === tab)?.label} (
                  {wantsSearchSort && matchCount !== tabTotal
                    ? `${matchCount} of ${tabTotal}`
                    : matchCount}
                  )
                </CardTitle>
                {tab === "probable" && (
                  <CardDescription>
                    Probable matches are never auto-accepted — accept or reject each one.
                  </CardDescription>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {matches.length === 0 ? (
                <EmptyState
                  title="Nothing here"
                  description={
                    tab === "probable"
                      ? "No probable matches awaiting review."
                      : tab === "exceptions"
                        ? "No exceptions — everything matched exactly."
                        : "No matches for this filter."
                  }
                />
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Type</Th>
                      <Th>Statement ref</Th>
                      <Th className="text-right">Statement amt</Th>
                      <Th>Ledger ref</Th>
                      <Th className="text-right">Ledger amt</Th>
                      <Th className="text-right">Diff</Th>
                      <Th>Reason</Th>
                      <Th className="text-right">Actions</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.map((m) => (
                      <Tr key={m.id}>
                        <Td>
                          <MatchTypeBadge type={m.match_type} confirmed={m.user_confirmed} />
                          {m.confidence_score && (
                            <div className="mt-0.5 text-[11px] tabular-nums text-zinc-500">
                              conf {Number(m.confidence_score).toFixed(2)}
                            </div>
                          )}
                        </Td>
                        <MatchCells match={m} currency={recon.currency} />
                        <Td className="max-w-56">
                          <span className="line-clamp-2 text-[11px] leading-snug text-zinc-500">
                            {m.reason}
                          </span>
                          {m.resolution?.note && (
                            <span className="mt-0.5 block line-clamp-2 text-[11px] italic text-zinc-400">
                              note: {m.resolution.note}
                            </span>
                          )}
                        </Td>
                        <Td>
                          <MatchActions match={m} status={recon.status} />
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </CardContent>
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-zinc-600">
              <span>
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link
                    href={`/reconciliations/${id}?tab=${tab}&page=${page - 1}${matchTypeFilter ? `&type=${matchTypeFilter}` : ""}${searchSortParams}`}
                    className="rounded border border-zinc-300 px-3 py-1 hover:bg-zinc-50"
                  >
                    Previous
                  </Link>
                )}
                {page < totalPages && (
                  <Link
                    href={`/reconciliations/${id}?tab=${tab}&page=${page + 1}${matchTypeFilter ? `&type=${matchTypeFilter}` : ""}${searchSortParams}`}
                    className="rounded border border-zinc-300 px-3 py-1 hover:bg-zinc-50"
                  >
                    Next
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function toMatchRows(matchData: unknown): MatchRow[] {
  return ((matchData ?? []) as Record<string, unknown>[]).map((m) => {
    const statement = Array.isArray(m.statement) ? m.statement[0] : m.statement;
    const ledger = Array.isArray(m.ledger) ? m.ledger[0] : m.ledger;
    const resolution = Array.isArray(m.exception_resolutions)
      ? m.exception_resolutions[0]
      : m.exception_resolutions;
    return {
      id: m.id as string,
      match_type: m.match_type as string,
      confidence_score: m.confidence_score as string | null,
      reason: (m.reason as string) ?? "",
      difference_amount: m.difference_amount as string | null,
      user_confirmed: Boolean(m.user_confirmed),
      statement: statement as MatchRow["statement"],
      ledger: ledger as MatchRow["ledger"],
      resolution: (resolution as MatchRow["resolution"]) ?? null,
    };
  });
}

function sortMatchRows(
  rows: MatchRow[],
  sortKey: "ref" | "amount" | "date",
  sortDir: "asc" | "desc",
): MatchRow[] {
  const dir = sortDir === "desc" ? -1 : 1;
  const refOf = (m: MatchRow) =>
    (m.statement?.raw_reference || m.ledger?.raw_reference || "").toLowerCase();
  const amountOf = (m: MatchRow) =>
    Number(m.statement?.amount ?? m.ledger?.amount ?? 0) || 0;
  const dateOf = (m: MatchRow) => m.statement?.transaction_date || m.ledger?.transaction_date || "";
  return [...rows].sort((a, b) => {
    if (sortKey === "ref") return refOf(a).localeCompare(refOf(b)) * dir;
    if (sortKey === "amount") return (amountOf(a) - amountOf(b)) * dir;
    return dateOf(a).localeCompare(dateOf(b)) * dir;
  });
}

function SummaryCard({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: string;
  accent?: boolean;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="py-5">
        <p className="text-xs font-medium text-zinc-500">{label}</p>
        <p
          className={
            accent
              ? "mt-1 text-xl font-semibold tabular-nums text-red-600"
              : "mt-1 text-xl font-semibold tabular-nums text-zinc-900"
          }
        >
          {value}
        </p>
        {sub && <p className="mt-0.5 text-[11px] text-zinc-500">{sub}</p>}
      </CardContent>
    </Card>
  );
}

async function loadUnmatched(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reconciliationId: string,
) {
  const { data: matches } = await supabase
    .from("reconciliation_matches")
    .select("statement_transaction_id, ledger_transaction_id")
    .eq("reconciliation_id", reconciliationId);

  const matchedS = new Set<string>();
  const matchedL = new Set<string>();
  for (const m of matches ?? []) {
    if (m.statement_transaction_id) matchedS.add(m.statement_transaction_id);
    if (m.ledger_transaction_id) matchedL.add(m.ledger_transaction_id);
  }

  const { data: txns } = await supabase
    .from("source_transactions")
    .select(
      "id, dataset_id, source_row_number, raw_reference, amount, source_datasets(type)",
    )
    .eq("reconciliation_id", reconciliationId);

  const statement: { id: string; label: string }[] = [];
  const ledger: { id: string; label: string }[] = [];

  for (const t of txns ?? []) {
    const ds = Array.isArray(t.source_datasets)
      ? (t.source_datasets as { type?: string }[])[0]
      : (t.source_datasets as { type?: string } | null);
    const side = ds?.type;
    const label = `row ${t.source_row_number} · ${t.raw_reference || "(no ref)"} · ${t.amount}`;
    if (side === "supplier_statement" && !matchedS.has(t.id)) {
      statement.push({ id: t.id, label });
    } else if (side === "ap_ledger" && !matchedL.has(t.id)) {
      ledger.push({ id: t.id, label });
    }
  }

  return { statement: statement.slice(0, 200), ledger: ledger.slice(0, 200) };
}
