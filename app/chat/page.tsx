const users = [
  { name: "Aarav Shah", status: "Online" },
  { name: "Maya Patel", status: "Typing..." },
  { name: "Jordan Lee", status: "Last seen 2m ago" },
  { name: "Sofia Chen", status: "Online" },
  { name: "Noah Kim", status: "Last seen 1h ago" },
];

const messages = [
  {
    sender: "Maya Patel",
    text: "I finished the handshake flow. Want me to walk you through the message exchange next?",
    own: false,
  },
  {
    sender: "You",
    text: "Yes please. I want to make sure the UI is ready for the encrypted chat states.",
    own: true,
  },
  {
    sender: "Maya Patel",
    text: "Perfect. We can map the active user on the left and keep the full conversation on the right.",
    own: false,
  },
];

export default function ChatPage() {
  return (
    <main className="min-h-screen bg-slate-950 p-4 text-white md:p-6">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-7xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-2xl md:min-h-[calc(100vh-3rem)] md:flex-row">
        <aside className="w-full border-b border-white/10 bg-slate-900/90 md:w-1/4 md:border-r md:border-b-0">
          <div className="border-b border-white/10 px-5 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300/80">
              Contacts
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-white">Users</h1>
          </div>

          <div className="space-y-2 p-3">
            {users.map((user, index) => (
              <button
                key={user.name}
                type="button"
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition ${
                  index === 1
                    ? "bg-cyan-500/20 ring-1 ring-cyan-400/40"
                    : "bg-white/5 hover:bg-white/10"
                }`}
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-700 text-sm font-semibold text-cyan-200">
                  {user.name
                    .split(" ")
                    .map((part) => part[0])
                    .join("")}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium text-white">{user.name}</p>
                  <p className="truncate text-sm text-slate-300">{user.status}</p>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="flex min-h-[60vh] flex-1 flex-col bg-slate-950">
          <header className="flex items-center justify-between border-b border-white/10 px-5 py-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300/80">
                Active Chat
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">Maya Patel</h2>
            </div>
            <div className="rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-medium text-emerald-300">
              Secure session
            </div>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-6">
            {messages.map((message, index) => (
              <div
                key={`${message.sender}-${index}`}
                className={`flex ${message.own ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-2xl rounded-3xl px-4 py-3 shadow-lg ${
                    message.own
                      ? "bg-cyan-400 text-slate-950"
                      : "bg-white/8 text-white ring-1 ring-white/10"
                  }`}
                >
                  <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] opacity-70">
                    {message.sender}
                  </p>
                  <p className="text-sm leading-6">{message.text}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-white/10 p-5">
            <form className="flex flex-col gap-3 md:flex-row">
              <input
                type="text"
                placeholder="Type a message..."
                className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-slate-400 outline-none"
              />
              <button
                type="submit"
                className="rounded-2xl bg-cyan-400 px-6 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300"
              >
                Send
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
