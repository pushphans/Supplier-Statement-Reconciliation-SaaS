import { requireOrg } from "@/lib/dal";
import { AppNav } from "@/components/app-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireOrg();

  return (
    <div className="flex min-h-screen flex-col">
      <AppNav
        orgName={ctx.organization.name}
        userName={(ctx.user.user_metadata?.full_name as string) || ctx.user.email || "User"}
        userEmail={ctx.user.email ?? ""}
        role={ctx.role}
      />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">{children}</main>
      <footer className="border-t border-zinc-200 bg-white py-4">
        <div className="mx-auto max-w-7xl px-4 text-[11px] text-zinc-500 sm:px-6">
          Deterministic matching · No AI auto-accept · Append-only audit trail
        </div>
      </footer>
    </div>
  );
}
