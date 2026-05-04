import { redirect } from "next/navigation";
import ChatRoom from "@/components/chat/ChatRoom";
import ConversationList, { type ChatContact } from "@/components/chat/ConversationList";
import type { ActiveChat, DbMessage } from "@/components/chat/types";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/supabase/profile";

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
};

type ChatPageProps = {
  searchParams: Promise<{
    contact?: string;
  }>;
};

function getProfileName(profile: ProfileRow) {
  return profile.display_name || profile.username || "Unknown user";
}

export default async function ChatPage({ searchParams }: ChatPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  await ensureProfile(supabase, user);

  const params = await searchParams;
  const [{ data: profiles }, { data: rawMessages }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, display_name")
      .neq("id", user.id)
      .order("display_name", { ascending: true }),
    supabase
      .from("messages")
      .select(
        "id, sender_id, receiver_id, ciphertext, nonce, header, message_type, created_at, delivered_at, read_at",
      )
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order("created_at", { ascending: true }),
  ]);

  const contacts: ChatContact[] = (profiles ?? []).map((profile) => ({
    id: profile.id,
    name: getProfileName(profile),
    status: profile.username ? `@${profile.username}` : "Available",
  }));

  const activeContactId =
    params.contact && contacts.some((contact) => contact.id === params.contact)
      ? params.contact
      : contacts[0]?.id;

  const activeProfile = (profiles ?? []).find((profile) => profile.id === activeContactId);
  const activeChat: ActiveChat | undefined = activeProfile
    ? {
        id: activeProfile.id,
        name: getProfileName(activeProfile),
        email: activeProfile.username ? `@${activeProfile.username}` : null,
      }
    : undefined;

  const messages: DbMessage[] = ((rawMessages ?? []) as DbMessage[])
    .filter((message) => {
      if (!activeContactId) {
        return false;
      }

      return (
        (message.sender_id === user.id && message.receiver_id === activeContactId) ||
        (message.sender_id === activeContactId && message.receiver_id === user.id)
      );
    });

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-white md:p-6">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-7xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-2xl md:min-h-[calc(100vh-3rem)] md:flex-row">
        <ConversationList contacts={contacts} activeContactId={activeContactId} />
        <ChatRoom
          currentUserId={user.id}
          activeChat={activeChat}
          initialMessages={messages}
        />
      </div>
    </main>
  );
}
