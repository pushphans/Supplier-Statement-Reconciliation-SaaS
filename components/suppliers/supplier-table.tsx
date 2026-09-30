"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createSupplierAction,
  updateSupplierAction,
  deleteSupplierAction,
} from "@/app/actions/suppliers";
import { Alert, Button, FieldError, Input, Label, Select, Td, Tr } from "@/components/ui";

export type SupplierRow = {
  id: string;
  name: string;
  supplier_code: string | null;
  default_currency: string;
  notes: string | null;
  created_at: string;
  reconciliation_count?: number;
  profile_count?: number;
};

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "AUD", "CAD", "CHF", "JPY", "SGD", "AED"];

export function SupplierForm({ defaultCurrency }: { defaultCurrency: string }) {
  const [state, action, pending] = useActionState(createSupplierAction, null);

  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert tone="error">{state.error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="s-name" required>
            Supplier name
          </Label>
          <Input id="s-name" name="name" required placeholder="Acme Supplies Ltd" />
          <FieldError errors={state?.fieldErrors?.name} />
        </div>
        <div>
          <Label htmlFor="s-code">Supplier code</Label>
          <Input id="s-code" name="supplier_code" placeholder="SUP-001 (optional)" />
        </div>
        <div>
          <Label htmlFor="s-currency">Default currency</Label>
          <Select id="s-currency" name="default_currency" defaultValue={defaultCurrency}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="s-notes">Notes</Label>
          <Input id="s-notes" name="notes" placeholder="Payment terms, contacts…" />
        </div>
      </div>
      <Button type="submit" loading={pending}>
        Add supplier
      </Button>
    </form>
  );
}

export function SupplierActions({
  supplier,
  canDelete,
}: {
  supplier: SupplierRow;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (editing) {
    return (
      <tr className="bg-zinc-50">
        <td colSpan={7} className="border-b border-zinc-100 px-3 py-3">
          <SupplierEditForm
            supplier={supplier}
            onDone={() => {
              setEditing(false);
              router.refresh();
            }}
            onError={setError}
          />
          {error && <div className="mt-2"><Alert tone="error">{error}</Alert></div>}
        </td>
      </tr>
    );
  }

  return (
    <Tr>
      <Td className="font-medium text-zinc-900">{supplier.name}</Td>
      <Td className="font-mono text-xs">{supplier.supplier_code || "—"}</Td>
      <Td>{supplier.default_currency}</Td>
      <Td className="tabular-nums">{supplier.reconciliation_count ?? 0}</Td>
      <Td
        className="text-xs tabular-nums text-zinc-600"
        title="Saved column-mapping profiles auto-applied in the setup wizard"
      >
        {(supplier.profile_count ?? 0) > 0 ? `${supplier.profile_count} saved` : "—"}
      </Td>
      <Td className="text-xs text-zinc-500">
        {new Date(supplier.created_at).toLocaleDateString()}
      </Td>
      <Td>
        <div className="flex items-center gap-2 justify-end">
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-600 hover:bg-red-50"
            disabled={!canDelete}
            loading={busy}
            title={canDelete ? "Delete supplier" : "Supplier has reconciliations"}
            onClick={async () => {
              if (!confirm(`Delete "${supplier.name}"? This cannot be undone.`)) return;
              setBusy(true);
              const result = await deleteSupplierAction(supplier.id);
              setBusy(false);
              if (!result.ok) {
                setError(result.error);
              } else {
                router.refresh();
              }
            }}
          >
            Delete
          </Button>
        </div>
        {error && <div className="mt-2"><Alert tone="error">{error}</Alert></div>}
      </Td>
    </Tr>
  );
}

function SupplierEditForm({
  supplier,
  onDone,
  onError,
}: {
  supplier: SupplierRow;
  onDone: () => void;
  onError: (msg: string | null) => void;
}) {
  const boundUpdate = updateSupplierAction.bind(null, supplier.id);
  const [state, formAction, pending] = useActionState(boundUpdate, null);

  return (
    <form
      action={async (fd) => {
        onError(null);
        await formAction(fd);
        // useActionState result not directly readable here; server returns null on success
        onDone();
      }}
      className="grid gap-3 sm:grid-cols-4"
    >
      <div>
        <Label htmlFor={`e-name-${supplier.id}`}>Name</Label>
        <Input id={`e-name-${supplier.id}`} name="name" defaultValue={supplier.name} required />
      </div>
      <div>
        <Label htmlFor={`e-code-${supplier.id}`}>Code</Label>
        <Input
          id={`e-code-${supplier.id}`}
          name="supplier_code"
          defaultValue={supplier.supplier_code ?? ""}
        />
      </div>
      <div>
        <Label htmlFor={`e-cur-${supplier.id}`}>Currency</Label>
        <Select
          id={`e-cur-${supplier.id}`}
          name="default_currency"
          defaultValue={supplier.default_currency}
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex items-end gap-2">
        <Button type="submit" size="sm" loading={pending}>
          Save
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {state?.error && (
        <div className="sm:col-span-4">
          <Alert tone="error">{state.error}</Alert>
        </div>
      )}
      <input type="hidden" name="notes" defaultValue={supplier.notes ?? ""} />
    </form>
  );
}
