"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inviteMemberAction, removeMemberAction } from "@/app/actions/org";
import { Alert, Badge, Button, FieldError, Input, Label, Td, Tr } from "@/components/ui";

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteMemberAction, null);
  const router = useRouter();

  return (
    <form
      action={async (fd) => {
        await action(fd);
        router.refresh();
      }}
      className="space-y-3"
    >
      {state?.error && <Alert tone="error">{state.error}</Alert>}
      {state?.message && <Alert tone="success">{state.message}</Alert>}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-56">
          <Label htmlFor="invite-email">Email address</Label>
          <Input
            id="invite-email"
            name="email"
            type="email"
            required
            placeholder="teammate@company.com"
          />
          <FieldError errors={state?.fieldErrors?.email} />
        </div>
        <Button type="submit" loading={pending}>
          Send invite
        </Button>
      </div>
      <p className="text-[11px] text-zinc-500">
        Invited users join as <strong>members</strong>. Email delivery requires a configured
        Supabase auth email provider; the invite row is always created.
      </p>
    </form>
  );
}

export function MemberRow({
  member,
  isSelf,
  canRemove,
}: {
  member: { user_id: string; role: string; full_name: string | null; email: string | null };
  isSelf: boolean;
  canRemove: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Tr>
        <Td className="font-medium text-zinc-900">
          {member.full_name || member.email || "User"}
          {isSelf && <span className="ml-1.5 text-[11px] text-zinc-400">(you)</span>}
        </Td>
        <Td className="text-xs text-zinc-500">{member.email ?? "—"}</Td>
        <Td>
          <Badge className={member.role === "owner" ? "border-zinc-300 bg-zinc-100" : ""}>
            {member.role}
          </Badge>
        </Td>
        <Td className="text-right">
          {canRemove && member.user_id !== "" && (
            <Button
              size="sm"
              variant="ghost"
              className="text-red-600 hover:bg-red-50"
              loading={pending}
              onClick={() => {
                if (!confirm(`Remove ${member.full_name ?? member.email}?`)) return;
                startTransition(async () => {
                  const result = await removeMemberAction(member.user_id);
                  if (!result.ok) setError(result.error);
                  else router.refresh();
                });
              }}
            >
              Remove
            </Button>
          )}
        </Td>
      </Tr>
      {error && (
        <tr>
          <td colSpan={4}>
            <Alert tone="error">{error}</Alert>
          </td>
        </tr>
      )}
    </>
  );
}
