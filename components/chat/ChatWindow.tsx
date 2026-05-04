"use client";

import type { ActiveChat, ChatMessage } from "@/components/chat/types";
import SignOutButton from "@/components/auth/SignOutButton";
import MessageInput from "@/components/chat/MessageInput";

type ChatWindowProps = {
  activeChat?: ActiveChat;
  messages: ChatMessage[];
  onSend?: (value: string) => Promise<boolean> | boolean;
  isSending?: boolean;
  sendError?: string | null;
  isCryptoReady?: boolean;
};

function formatTimestamp(value?: string | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export default function ChatWindow({
  activeChat,
  messages,
  onSend,
  isSending = false,
  sendError,
  isCryptoReady = true,
}: ChatWindowProps) {
  return (
    <section className="flex min-h-[60vh] flex-1 flex-col bg-slate-950">
      <header className="flex items-center justify-between border-b border-white/10 px-5 py-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300/80">
            Active Chat
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            {activeChat?.name ?? "Select a user"}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            {activeChat?.email ?? "Choose a contact from the left panel to view messages."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-medium text-emerald-300">
            Secure session
          </div>
          <SignOutButton />
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-6">
        {!activeChat ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/3 px-6 py-10 text-center text-slate-300">
            Pick a user to open a conversation.
          </div>
        ) : null}

        {activeChat && messages.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/3 px-6 py-10 text-center text-slate-300">
            No messages yet. Once encrypted messages are stored, they&apos;ll appear here.
          </div>
        ) : null}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.own ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-2xl rounded-3xl px-4 py-3 shadow-lg ${
                message.own
                  ? "bg-cyan-400 text-slate-950"
                  : "bg-white/8 text-white ring-1 ring-white/10"
              }`}
            >
              <div className="mb-1 flex items-center justify-between gap-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-70">
                  {message.sender}
                </p>
                {message.timestamp ? (
                  <p className="text-[11px] opacity-60">{formatTimestamp(message.timestamp)}</p>
                ) : null}
              </div>
              <p className="text-sm leading-6">{message.text}</p>
            </div>
          </div>
        ))}
      </div>

      {sendError ? (
        <div className="border-t border-white/10 px-5 pt-4 text-sm text-rose-200">
          {sendError}
        </div>
      ) : null}

      <MessageInput
        disabled={!activeChat || !isCryptoReady}
        isSending={isSending}
        onSend={onSend}
        placeholder={
          !isCryptoReady
            ? "Preparing local encryption keys..."
            : "Type a message..."
        }
      />
    </section>
  );
}
