"use client";

import { useActionState } from "react";
import { updateProfileAction } from "@/app/actions/settings";
import { updateOrganizationAction } from "@/app/actions/suppliers";
import { Alert, Button, FieldError, Input, Label, Select } from "@/components/ui";

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "AUD", "CAD", "CHF", "JPY", "SGD", "AED"];
const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

export function OrganizationForm({
  org,
}: {
  org: { name: string; default_currency: string; timezone: string };
}) {
  const [state, action, pending] = useActionState(updateOrganizationAction, null);

  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert tone="error">{state.error}</Alert>}
      <div>
        <Label htmlFor="org-name" required>
          Organization name
        </Label>
        <Input id="org-name" name="name" defaultValue={org.name} required />
        <FieldError errors={state?.fieldErrors?.name} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="org-currency">Default currency</Label>
          <Select
            id="org-currency"
            name="default_currency"
            defaultValue={org.default_currency}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="org-tz">Timezone</Label>
          <Select id="org-tz" name="timezone" defaultValue={org.timezone}>
            {TIMEZONES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <Button type="submit" loading={pending}>
        Save organization
      </Button>
    </form>
  );
}

export function ProfileForm({ fullName }: { fullName: string }) {
  const [state, action, pending] = useActionState(updateProfileAction, null);

  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert tone="error">{state.error}</Alert>}
      <div>
        <Label htmlFor="profile-name" required>
          Your name
        </Label>
        <Input id="profile-name" name="full_name" defaultValue={fullName} required />
        <FieldError errors={state?.fieldErrors?.full_name} />
      </div>
      <Button type="submit" loading={pending} variant="secondary">
        Save profile
      </Button>
    </form>
  );
}
