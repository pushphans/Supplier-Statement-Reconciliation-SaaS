"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

export function SettingsTab({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = href === "/settings" ? pathname === "/settings" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={cn(
        "border-b-2 px-3 py-2 text-sm font-medium",
        active
          ? "border-zinc-900 text-zinc-900"
          : "border-transparent text-zinc-500 hover:text-zinc-800",
      )}
    >
      {label}
    </Link>
  );
}
