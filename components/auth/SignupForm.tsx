"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthShell from "@/components/auth/AuthShell";
import { ensureCryptoSetupForCurrentUser } from "@/lib/crypto/setup";
import { createClient } from "@/lib/supabase/client";
import { ensureProfile } from "@/lib/supabase/profile";

type SignupFormProps = {
  message?: string;
};

export default function SignupForm({ message }: SignupFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const supabase = createClient();

    setIsLoading(true);
    setError(null);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: name,
          full_name: name,
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setIsLoading(false);
      return;
    }

    if (data.user && data.session) {
      const { error: profileError } = await ensureProfile(supabase, data.user, name);

      if (profileError) {
        setError(profileError.message);
        setIsLoading(false);
        return;
      }

      try {
        await ensureCryptoSetupForCurrentUser();
      } catch (cryptoError) {
        setError(cryptoError instanceof Error ? cryptoError.message : "Key setup failed.");
        setIsLoading(false);
        return;
      }

      router.push("/chat");
      router.refresh();
      return;
    }

    const params = new URLSearchParams({
      message: "Check your email to confirm your account, then log in.",
    });

    router.push(`/?${params.toString()}`);
    router.refresh();
  }

  return (
    <AuthShell
      title="Create your account"
      footer={
        <>
          Already have an account?{" "}
          <Link href="/" className="font-semibold text-white underline underline-offset-4">
            Log in
          </Link>
        </>
      }
    >
      <form className="flex flex-col gap-4" action={handleSubmit}>
        <input
          type="text"
          name="name"
          placeholder="Full name"
          autoComplete="name"
          required
          className="rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 outline-none"
        />
        <input
          type="email"
          name="email"
          placeholder="Email"
          autoComplete="email"
          required
          className="rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 outline-none"
        />
        <input
          type="password"
          name="password"
          placeholder="Set a password"
          autoComplete="new-password"
          minLength={8}
          required
          className="rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 outline-none"
        />
        {message ? <p className="text-sm text-cyan-100">{message}</p> : null}
        {error ? <p className="text-sm text-rose-200">{error}</p> : null}
        <button
          type="submit"
          disabled={isLoading}
          className="mt-2 rounded-lg bg-white px-4 py-3 font-semibold text-blue-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isLoading ? "Creating account..." : "Sign Up"}
        </button>
      </form>
    </AuthShell>
  );
}
