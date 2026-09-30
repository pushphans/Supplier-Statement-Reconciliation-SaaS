import { SettingsTab as SettingsTabClient } from "./settings-tab";

const TABS = [
  { href: "/settings", label: "Organization" },
  { href: "/settings/team", label: "Team" },
  { href: "/settings/billing", label: "Billing" },
  { href: "/settings/data", label: "Data & privacy" },
];

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900">Settings</h1>
        <p className="text-xs text-zinc-500">
          Organization profile, team access, billing, and data controls.
        </p>
      </div>
      <nav className="flex gap-1 border-b border-zinc-200" aria-label="Settings">
        {TABS.map((t) => (
          <SettingsTabClient key={t.href} href={t.href} label={t.label} />
        ))}
      </nav>
      {children}
    </div>
  );
}
