import Link from "next/link";
import { getCurrentUser } from "@/lib/dal";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-900 text-xs font-bold text-white">
              SR
            </span>
            <span className="text-sm font-semibold">Supplier Recon</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Create account
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-16">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Supplier statement reconciliation
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
            Match supplier statements to your AP ledger — deterministically.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-zinc-600">
            Upload a supplier statement and your AP ledger. The engine runs exact,
            amount-mismatch, duplicate, probable, and missing-entry matching with
            full auditability — no AI guesswork, no float math, raw values preserved.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/signup"
              className="inline-flex h-11 items-center rounded-md bg-zinc-900 px-6 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Get started
            </Link>
            <Link
              href="/login"
              className="inline-flex h-11 items-center rounded-md border border-zinc-300 bg-white px-6 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
            >
              Sign in
            </Link>
          </div>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-3">
          {[
            {
              title: "Client-side parsing",
              body: "CSV, XLSX, and text-based PDFs are parsed in your browser. Files never leave your device unencrypted in transit to third parties.",
            },
            {
              title: "Deterministic engine",
              body: "Exact → amount mismatch → duplicates → probable (similarity + 30-day window) → missing on either side. Every transaction lands in exactly one match.",
            },
            {
              title: "Review & audit",
              body: "Probable matches are never auto-accepted. Exceptions, resolutions, manual matches, and CSV exports are recorded in an append-only audit trail.",
            },
          ].map((f) => (
            <div key={f.title} className="rounded-lg border border-zinc-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-zinc-900">{f.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">{f.body}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-zinc-500">
          Private pilot · Foundation pricing via manual billing · Row Level Security
          multi-tenant isolation.
        </div>
      </footer>
    </div>
  );
}
