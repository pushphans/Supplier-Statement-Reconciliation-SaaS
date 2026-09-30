"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { createOrganizationAction, acceptInviteAction } from "@/app/actions/org";
import { Alert, Button, FieldError, Input, Label, Select } from "@/components/ui";

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "AUD", "CAD", "CHF", "JPY", "SGD", "AED"];

export function OnboardingForms({ invites }: { invites: { id: string; email: string; orgName?: string }[] }) {
  const router = useRouter();
  const [orgState, orgAction, orgPending] = useActionState(createOrganizationAction, null);
  const [busyInvite, setBusyInvite] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {invites.length > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h2 className="text-sm font-semibold text-blue-900">Pending invites</h2>
          <p className="mt-1 text-xs text-blue-700">
            Accept an invite to join an existing organization, or create your own below.
          </p>
          {inviteError && (
            <div className="mt-3">
              <Alert tone="error">{inviteError}</Alert>
            </div>
          )}
          <div className="mt-3 space-y-2">
            {invites.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between rounded-md border border-blue-200 bg-white px-3 py-2"
              >
                <span className="text-xs text-zinc-700">
                  {inv.orgName ?? "Organization"} — {inv.email}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busyInvite === inv.id}
                  onClick={async () => {
                    setBusyInvite(inv.id);
                    setInviteError(null);
                    const result = await acceptInviteAction(inv.id);
                    setBusyInvite(null);
                    if (result.ok) {
                      router.push("/dashboard");
                      router.refresh();
                    } else {
                      setInviteError(result.error);
                    }
                  }}
                >
                  Accept
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <form action={orgAction} className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Create your organization</h2>
        <p className="mt-1 text-xs text-zinc-500">
          You will be the owner. You can invite teammates from Settings → Team.
        </p>

        {orgState?.error && (
          <div className="mt-3">
            <Alert tone="error">{orgState.error}</Alert>
          </div>
        )}

        <div className="mt-4 space-y-4">
          <div>
            <Label htmlFor="name" required>
              Organization name
            </Label>
            <Input id="name" name="name" required placeholder="Acme Corp" />
            <FieldError errors={orgState?.fieldErrors?.name} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="default_currency">Default currency</Label>
              <Select id="default_currency" name="default_currency" defaultValue="USD">
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="timezone">Timezone</Label>
              <Select id="timezone" name="timezone" defaultValue="UTC">
                <option value="UTC">UTC</option>
                <option value="America/New_York">America/New_York</option>
                <option value="America/Chicago">America/Chicago</option>
                <option value="Europe/London">Europe/London</option>
                <option value="Europe/Berlin">Europe/Berlin</option>
                <option value="Asia/Kolkata">Asia/Kolkata</option>
                <option value="Asia/Singapore">Asia/Singapore</option>
                <option value="Australia/Sydney">Australia/Sydney</option>
              </Select>
            </div>
          </div>
        </div>

        <Button type="submit" loading={orgPending} className="mt-5">
          Create organization
        </Button>
      </form>
    </div>
  );
}
