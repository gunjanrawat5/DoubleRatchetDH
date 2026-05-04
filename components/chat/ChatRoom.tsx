"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ChatWindow from "@/components/chat/ChatWindow";
import type { ActiveChat, ChatMessage } from "@/components/chat/types";
import { createClient } from "@/lib/supabase/client";

type MessageRecord = {
  id: string;
  sender_id: string;
  receiver_id: string;
  ciphertext: string;
  nonce: string;
  header: Record<string, unknown>;
  message_type: string;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
};

type ChatRoomProps = {
  currentUserId: string;
  activeChat?: ActiveChat;
  initialMessages: ChatMessage[];
};

function messageFromRecord(
  record: MessageRecord,
  currentUserId: string,
  activeChat?: ActiveChat,
): ChatMessage {
  return {
    id: record.id,
    sender: record.sender_id === currentUserId ? "You" : activeChat?.name ?? "Contact",
    text:
      record.message_type === "text"
        ? record.ciphertext
        : `Encrypted ${record.message_type ?? "message"} payload`,
    own: record.sender_id === currentUserId,
    timestamp: record.created_at,
  };
}

export default function ChatRoom({
  currentUserId,
  activeChat,
  initialMessages,
}: ChatRoomProps) {
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState(initialMessages);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const seenMessageIdsRef = useRef(new Set(initialMessages.map((message) => message.id)));

  useEffect(() => {
    setMessages(initialMessages);
    setSendError(null);
    seenMessageIdsRef.current = new Set(initialMessages.map((message) => message.id));
  }, [initialMessages]);

  useEffect(() => {
    if (!activeChat) {
      return;
    }

    const channel = supabase
      .channel(`chat-room-${currentUserId}-${activeChat.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const message = payload.new as MessageRecord;
          const isConversationMessage =
            (message.sender_id === currentUserId && message.receiver_id === activeChat.id) ||
            (message.sender_id === activeChat.id && message.receiver_id === currentUserId);

          if (!isConversationMessage || seenMessageIdsRef.current.has(message.id)) {
            return;
          }

          console.log("[realtime] message received", {
            channel: `chat-room-${currentUserId}-${activeChat.id}`,
            messageId: message.id,
            senderId: message.sender_id,
            receiverId: message.receiver_id,
          });

          seenMessageIdsRef.current.add(message.id);
          setMessages((currentMessages) => [
            ...currentMessages,
            messageFromRecord(message, currentUserId, activeChat),
          ]);
        },
      )
      .subscribe((status, error) => {
        console.log("[realtime] subscription status", {
          channel: `chat-room-${currentUserId}-${activeChat.id}`,
          status,
          error: error?.message ?? null,
          table: "public.messages",
        });
      });

    return () => {
      console.log("[realtime] removing channel", {
        channel: `chat-room-${currentUserId}-${activeChat.id}`,
        table: "public.messages",
      });
      void supabase.removeChannel(channel);
    };
  }, [activeChat, currentUserId, supabase]);

  async function handleSend(value: string) {
    if (!activeChat) {
      return false;
    }

    setIsSending(true);
    setSendError(null);

    const { data, error } = await supabase
      .from("messages")
      .insert({
        sender_id: currentUserId,
        receiver_id: activeChat.id,
        ciphertext: value,
        nonce: crypto.randomUUID(),
        header: {},
        message_type: "text",
      })
      .select(
        "id, sender_id, receiver_id, ciphertext, nonce, header, message_type, created_at, delivered_at, read_at",
      )
      .single();

    if (error) {
      setSendError(error.message);
      setIsSending(false);
      return false;
    }

    const insertedMessage = data as MessageRecord;

    if (!seenMessageIdsRef.current.has(insertedMessage.id)) {
      seenMessageIdsRef.current.add(insertedMessage.id);
      setMessages((currentMessages) => [
        ...currentMessages,
        messageFromRecord(insertedMessage, currentUserId, activeChat),
      ]);
    }

    setIsSending(false);
    return true;
  }

  return (
    <ChatWindow
      activeChat={activeChat}
      messages={messages}
      sendError={sendError}
      isSending={isSending}
      onSend={handleSend}
    />
  );
}
