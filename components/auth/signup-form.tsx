"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUpAction, type AuthState } from "@/app/actions/auth";
import { Alert, Button, FieldError, Input, Label } from "@/components/ui";

export function SignupForm() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    signUpAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && <Alert tone="error">{state.error}</Alert>}
      {state?.message && <Alert tone="success">{state.message}</Alert>}

      <div>
        <Label htmlFor="full_name" required>
          Full name
        </Label>
        <Input
          id="full_name"
          name="full_name"
          autoComplete="name"
          required
          placeholder="Jane Doe"
        />
        <FieldError errors={state?.fieldErrors?.full_name} />
      </div>

      <div>
        <Label htmlFor="email" required>
          Work email
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
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="At least 8 characters"
        />
        <FieldError errors={state?.fieldErrors?.password} />
      </div>

      <Button type="submit" loading={pending} className="w-full">
        Create account
      </Button>

      <p className="text-center text-xs text-zinc-500">
        Already registered?{" "}
        <Link href="/login" className="font-medium text-zinc-900 underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </form>
  );
}
