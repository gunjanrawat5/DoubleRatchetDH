"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthShell from "@/components/auth/AuthShell";
import { ensureCryptoSetupForCurrentUser } from "@/lib/crypto/setup";
import { createClient } from "@/lib/supabase/client";

type LoginFormProps = {
  message?: string;
};

export default function LoginForm({ message }: LoginFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const supabase = createClient();

    setIsLoading(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
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
  }

  return (
    <AuthShell
      title="Welcome to the DDRH Interaction!"
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-semibold text-white underline underline-offset-4">
            Sign up
          </Link>
        </>
      }
    >
      <form className="flex flex-col gap-4" action={handleSubmit}>
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
          placeholder="Password"
          autoComplete="current-password"
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
          {isLoading ? "Logging in..." : "Log In"}
        </button>
      </form>
    </AuthShell>
  );
}
