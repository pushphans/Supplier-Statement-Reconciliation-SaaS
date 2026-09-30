"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { loginSchema, signupSchema } from "@/lib/validation";
import { checkRateLimit, clientIp, rateLimitError } from "@/lib/rate-limit";

export type AuthState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  message?: string;
} | null;

function flatten(zodError: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of zodError.issues) {
    const key = String(issue.path[0] ?? "form");
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

export async function signUpAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    full_name: formData.get("full_name"),
  });
  if (!parsed.success) return { fieldErrors: flatten(parsed.error) };

  const limited = checkRateLimit(`signup:${clientIp(await headers())}`, {
    limit: 5,
    windowMs: 10 * 60 * 1000,
  });
  if (!limited.ok) return { error: rateLimitError(limited.retryAfterSec) };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.full_name },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });

  if (error) return { error: error.message };

  revalidatePath("/", "layout");

  if (!data.session) {
    return { message: "Check your email to confirm your account, then sign in." };
  }

  redirect("/onboarding");
}

export async function signInAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { fieldErrors: flatten(parsed.error) };

  const limited = checkRateLimit(`signin:${clientIp(await headers())}`, {
    limit: 10,
    windowMs: 60 * 1000,
  });
  if (!limited.ok) return { error: rateLimitError(limited.retryAfterSec) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) return { error: "Invalid email or password." };

  revalidatePath("/", "layout");
  // Return to the originally requested page when safe (same-origin path only).
  const requested = formData.get("next");
  const dest =
    typeof requested === "string" && requested.startsWith("/") && !requested.startsWith("//")
      ? requested
      : "/dashboard";
  redirect(dest);
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
