import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const callbackError = params.error === "auth_callback_failed";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-900 text-xs font-bold text-white">
            SR
          </span>
          <span className="text-sm font-semibold text-zinc-900">Supplier Recon</span>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
          <h1 className="mb-1 text-lg font-semibold text-zinc-900">Sign in</h1>
          <p className="mb-5 text-xs text-zinc-500">
            Reconcile supplier statements against your AP ledger.
          </p>
          {callbackError && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              Email confirmation link was invalid or expired. Try signing in instead.
            </div>
          )}
          <LoginForm nextPath={next} />
        </div>
      </div>
    </div>
  );
}
