"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signInAction, type AuthState } from "@/app/actions/auth";
import { Alert, Button, FieldError, Input, Label } from "@/components/ui";

export function LoginForm({ nextPath }: { nextPath?: string }) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    signInAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && <Alert tone="error">{state.error}</Alert>}
      {state?.message && <Alert tone="success">{state.message}</Alert>}

      <div>
        <Label htmlFor="email" required>
          Email
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@company.com"
        />
        <FieldError errors={state?.fieldErrors?.email} />
      </div>

      <div>
        <Label htmlFor="password" required>
          Password
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
        />
        <FieldError errors={state?.fieldErrors?.password} />
      </div>

      {nextPath && <input type="hidden" name="next" value={nextPath} />}

      <Button type="submit" loading={pending} className="w-full">
        Sign in
      </Button>

      <p className="text-center text-xs text-zinc-500">
        No account?{" "}
        <Link href="/signup" className="font-medium text-zinc-900 underline underline-offset-2">
          Create one
        </Link>
      </p>
    </form>
  );
}
