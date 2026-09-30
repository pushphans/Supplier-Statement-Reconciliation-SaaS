import { SignupForm } from "@/components/auth/signup-form";

export const metadata = { title: "Create account" };

export default function SignupPage() {
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
          <h1 className="mb-1 text-lg font-semibold text-zinc-900">Create your account</h1>
          <p className="mb-5 text-xs text-zinc-500">
            14-day trial · No credit card required.
          </p>
          <SignupForm />
        </div>
      </div>
    </div>
  );
}
