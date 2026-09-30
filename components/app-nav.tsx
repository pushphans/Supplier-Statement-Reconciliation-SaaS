"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/actions/auth";
import { cn } from "@/components/ui";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/reconciliations", label: "Reconciliations" },
  { href: "/suppliers", label: "Suppliers" },
  { href: "/settings", label: "Settings" },
];

export function AppNav({
  orgName,
  userName,
  userEmail,
  role,
}: {
  orgName: string;
  userName: string;
  userEmail: string;
  role: string;
}) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/settings"
      ? pathname.startsWith("/settings")
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-900 text-xs font-bold text-white">
              SR
            </span>
            <span className="hidden text-sm font-semibold text-zinc-900 sm:inline">
              Supplier Recon
            </span>
          </Link>
          <nav className="flex items-center gap-1" aria-label="Primary">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive(item.href)
                    ? "bg-zinc-100 text-zinc-900"
                    : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <div className="text-xs font-medium text-zinc-900">{userName}</div>
            <div className="text-[11px] text-zinc-500">
              {orgName} · {role}
            </div>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
      <div className="border-t border-zinc-100 bg-zinc-50/70 px-4 py-1 text-[11px] text-zinc-500 sm:px-6">
        Signed in as {userEmail} — files are parsed in your browser; raw values are always preserved.
      </div>
    </header>
  );
}
