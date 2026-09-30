import { requireOrg } from "@/lib/dal";
import { AppNav } from "@/components/app-nav";
import { billingWriteAccess } from "@/lib/billing/access";
import Link from "next/link";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireOrg();
  const billing = await billingWriteAccess(ctx.organization.id);

  return (
    <div className="flex min-h-screen flex-col">
      <AppNav
        orgName={ctx.organization.name}
        userName={(ctx.user.user_metadata?.full_name as string) || ctx.user.email || "User"}
        userEmail={ctx.user.email ?? ""}
        role={ctx.role}
      />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        {!billing.allowed && (
          <div role="alert" className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {billing.message} <Link href="/settings/billing" className="font-semibold underline">Manage billing</Link>
          </div>
        )}
        {children}
      </main>
      <footer className="border-t border-zinc-200 bg-white py-4">
        <div className="mx-auto max-w-7xl px-4 text-[11px] text-zinc-500 sm:px-6">
          Deterministic matching · No AI auto-accept · Append-only audit trail
        </div>
      </footer>
    </div>
  );
}
