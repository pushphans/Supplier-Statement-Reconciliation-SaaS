"use client";

import { useActionState, useState } from "react";
import { createReconciliationAction } from "@/app/actions/reconciliations";
import { Alert, Button, FieldError, Input, Label, Select } from "@/components/ui";

export function NewReconciliationForm({
  suppliers,
  defaultCurrency,
}: {
  suppliers: { id: string; name: string; default_currency: string }[];
  defaultCurrency: string;
}) {
  const [state, action, pending] = useActionState(createReconciliationAction, null);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");

  if (suppliers.length === 0) {
    return (
      <Alert tone="warning">
        Add a supplier first —{" "}
        <a href="/suppliers" className="font-medium underline underline-offset-2">
          go to Suppliers
        </a>
        .
      </Alert>
    );
  }

  const selected = suppliers.find((s) => s.id === supplierId);

  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert tone="error">{state.error}</Alert>}

      <div>
        <Label htmlFor="supplier_id" required>
          Supplier
        </Label>
        <Select
          id="supplier_id"
          name="supplier_id"
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          required
        >
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <FieldError errors={state?.fieldErrors?.supplier_id} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="period_start">Period start</Label>
          <Input id="period_start" name="period_start" type="date" />
        </div>
        <div>
          <Label htmlFor="period_end">Period end</Label>
          <Input id="period_end" name="period_end" type="date" />
        </div>
      </div>

      <div>
        <Label htmlFor="currency">Currency</Label>
        <Select
          id="currency"
          name="currency"
          defaultValue={selected?.default_currency ?? defaultCurrency}
        >
          {[selected?.default_currency, defaultCurrency, "USD", "EUR", "GBP", "INR"]
            .filter((c): c is string => Boolean(c))
            .filter((c, i, arr) => arr.indexOf(c) === i)
            .map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
        </Select>
      </div>

      <Button type="submit" loading={pending} className="w-full">
        Continue to file upload
      </Button>
    </form>
  );
}
