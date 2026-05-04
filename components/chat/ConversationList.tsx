import Link from "next/link";

export type ChatContact = {
  id: string;
  name: string;
  status: string;
};

type ConversationListProps = {
  contacts: ChatContact[];
  activeContactId?: string;
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function ConversationList({
  contacts,
  activeContactId,
}: ConversationListProps) {
  return (
    <aside className="w-full border-b border-white/10 bg-slate-900/90 md:w-1/4 md:border-r md:border-b-0">
      <div className="border-b border-white/10 px-5 py-5">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300/80">
          Contacts
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Users</h1>
      </div>

      <div className="space-y-2 p-3">
        {contacts.length === 0 ? (
          <div className="rounded-2xl bg-white/5 px-4 py-4 text-sm text-slate-300">
            No other users are available yet.
          </div>
        ) : null}

        {contacts.map((contact) => {
          const isActive = contact.id === activeContactId;

          return (
            <Link
              key={contact.id}
              href={`/chat?contact=${contact.id}`}
              className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition ${
                isActive
                  ? "bg-cyan-500/20 ring-1 ring-cyan-400/40"
                  : "bg-white/5 hover:bg-white/10"
              }`}
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-700 text-sm font-semibold text-cyan-200">
                {getInitials(contact.name)}
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium text-white">{contact.name}</p>
                <p className="truncate text-sm text-slate-300">{contact.status}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
