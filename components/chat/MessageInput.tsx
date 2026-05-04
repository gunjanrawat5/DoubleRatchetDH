"use client";

import type { FormEvent } from "react";
import { useState } from "react";

type MessageInputProps = {
  disabled?: boolean;
  isSending?: boolean;
  onSend?: (value: string) => Promise<boolean> | boolean;
};

export default function MessageInput({
  disabled = false,
  isSending = false,
  onSend,
}: MessageInputProps) {
  const [value, setValue] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedValue = value.trim();

    if (!trimmedValue || disabled || isSending) {
      return;
    }

    const didSend = await onSend?.(trimmedValue);

    if (didSend !== false) {
      setValue("");
    }
  }

  return (
    <div className="border-t border-white/10 p-5">
      <form className="flex flex-col gap-3 md:flex-row" onSubmit={handleSubmit}>
        <input
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={disabled ? "Select a user to start chatting..." : "Type a message..."}
          disabled={disabled || isSending}
          className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-slate-400 outline-none disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={disabled || isSending || !value.trim()}
          className="rounded-2xl bg-cyan-400 px-6 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSending ? "Sending..." : "Send"}
        </button>
      </form>
    </div>
  );
}
