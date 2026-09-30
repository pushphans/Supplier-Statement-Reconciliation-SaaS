"use client";

import { useActionState } from "react";
import { deleteAccountDataAction } from "@/app/actions/settings";
import { Alert, Button, FieldError, Input, Label } from "@/components/ui";

export function DeleteDataForm({ orgName }: { orgName: string }) {
  const [state, action, pending] = useActionState(deleteAccountDataAction, null);

  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert tone="error">{state.error}</Alert>}
      <Alert tone="warning">
        This permanently deletes <strong>{orgName}</strong> and every supplier, reconciliation,
        transaction, match, and audit row inside it.
      </Alert>
      <div>
        <Label htmlFor="confirm_name" required>
          Type <code className="text-xs">{orgName}</code> to confirm
        </Label>
        <Input id="confirm_name" name="confirm_name" required placeholder={orgName} />
        <FieldError errors={state?.fieldErrors?.confirm_name} />
      </div>
      <Button type="submit" variant="danger" loading={pending}>
        Delete all workspace data
      </Button>
    </form>
  );
}
