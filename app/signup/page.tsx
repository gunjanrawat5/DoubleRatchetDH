import Link from "next/link";

export default function SignupPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-xl">
        <h2 className="mb-6 text-center text-3xl font-bold text-white">
          Create your account
        </h2>
        <div className="rounded-2xl bg-blue-900/50 p-8 shadow-2xl backdrop-blur-sm">
          <form className="flex flex-col gap-4">
            <input
              type="text"
              placeholder="Full name"
              className="rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 outline-none"
            />
            <input
              type="email"
              placeholder="Email"
              className="rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 outline-none"
            />
            <input
              type="password"
              placeholder="Set a password"
              className="rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 outline-none"
            />
            <button
              type="submit"
              className="mt-2 rounded-lg bg-white px-4 py-3 font-semibold text-blue-950 transition hover:bg-slate-100"
            >
              Sign Up
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-white/80">
            Already have an account?{" "}
            <Link href="/" className="font-semibold text-white underline underline-offset-4">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
