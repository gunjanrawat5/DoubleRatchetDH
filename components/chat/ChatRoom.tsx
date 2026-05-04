"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ChatWindow from "@/components/chat/ChatWindow";
import type { ActiveChat, ChatMessage, DbMessage } from "@/components/chat/types";
import { createDevSharedKey, decryptText, encryptText } from "@/lib/crypto/encryption";
import { createClient } from "@/lib/supabase/client";

type ChatRoomProps = {
  currentUserId: string;
  activeChat?: ActiveChat;
  initialMessages: DbMessage[];
};

async function messageFromRecord(
  record: DbMessage,
  currentUserId: string,
  activeChat?: ActiveChat,
): Promise<ChatMessage> {
  let text = `Encrypted ${record.message_type} payload`;

  if (record.message_type === "dev_encrypted") {
    try {
      const devKey = await createDevSharedKey();
      text = await decryptText(
        {
          ciphertext: record.ciphertext,
          nonce: record.nonce,
        },
        devKey,
      );
    } catch {
      text = "[Unable to decrypt message]";
    }
  } else if (record.message_type === "text") {
    text = record.ciphertext;
  }

  return {
    id: record.id,
    sender: record.sender_id === currentUserId ? "You" : activeChat?.name ?? "Contact",
    text,
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const seenMessageIdsRef = useRef(new Set(initialMessages.map((message) => message.id)));

  useEffect(() => {
    setSendError(null);
    seenMessageIdsRef.current = new Set(initialMessages.map((message) => message.id));

    let isCancelled = false;

    async function loadInitialMessages() {
      const decryptedMessages = await Promise.all(
        initialMessages.map((message) => messageFromRecord(message, currentUserId, activeChat)),
      );

      if (!isCancelled) {
        setMessages(decryptedMessages);
      }
    }

    void loadInitialMessages();

    return () => {
      isCancelled = true;
    };
  }, [activeChat, currentUserId, initialMessages]);

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
        async (payload) => {
          const message = payload.new as DbMessage;
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
          const decryptedMessage = await messageFromRecord(message, currentUserId, activeChat);

          setMessages((currentMessages) => [...currentMessages, decryptedMessage]);
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

    try {
      const devKey = await createDevSharedKey();
      const encrypted = await encryptText(value, devKey);

      const { data, error } = await supabase
        .from("messages")
        .insert({
          sender_id: currentUserId,
          receiver_id: activeChat.id,
          ciphertext: encrypted.ciphertext,
          nonce: encrypted.nonce,
          header: {},
          message_type: "dev_encrypted",
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

      const insertedMessage = data as DbMessage;

      if (!seenMessageIdsRef.current.has(insertedMessage.id)) {
        seenMessageIdsRef.current.add(insertedMessage.id);
        const decryptedMessage = await messageFromRecord(
          insertedMessage,
          currentUserId,
          activeChat,
        );

        setMessages((currentMessages) => [...currentMessages, decryptedMessage]);
      }

      setIsSending(false);
      return true;
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Encryption failed.");
      setIsSending(false);
      return false;
    }
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
