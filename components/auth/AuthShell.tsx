"use client";

import type { ReactNode } from "react";

type AuthShellProps = {
  title: string;
  footer: ReactNode;
  children: ReactNode;
};

export default function AuthShell({ title, footer, children }: AuthShellProps) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-xl">
        <h2 className="mb-6 text-center text-3xl font-bold text-white">{title}</h2>
        <div className="rounded-2xl bg-blue-900/50 p-8 shadow-2xl backdrop-blur-sm">
          {children}
          <div className="mt-6 text-center text-sm text-white/80">{footer}</div>
        </div>
      </div>
    </main>
  );
}
