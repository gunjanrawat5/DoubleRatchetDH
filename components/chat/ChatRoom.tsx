"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ChatWindow from "@/components/chat/ChatWindow";
import type { ActiveChat, ChatMessage, DbMessage } from "@/components/chat/types";
import {
  decryptConversationMessages,
  decryptIncomingMessage,
  encryptMessageForPeer,
} from "@/lib/chat/messages";
import { ensureCryptoSetupForCurrentUser } from "@/lib/crypto/setup";
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
  text?: string,
): Promise<ChatMessage> {
  return {
    id: record.id,
    sender: record.sender_id === currentUserId ? "You" : activeChat?.name ?? "Contact",
    text: text ?? "[Unable to decrypt message]",
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
  const [isCryptoReady, setIsCryptoReady] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const seenMessageIdsRef = useRef(new Set(initialMessages.map((message) => message.id)));

  useEffect(() => {
    let isCancelled = false;

    async function setupCrypto() {
      try {
        await ensureCryptoSetupForCurrentUser();

        if (!isCancelled) {
          setIsCryptoReady(true);
        }
      } catch (error) {
        console.error("[crypto] setup failed", error);

        if (!isCancelled) {
          setSendError(error instanceof Error ? error.message : "Crypto setup failed.");
        }
      }
    }

    void setupCrypto();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isCryptoReady) {
      return;
    }

    setSendError(null);
    seenMessageIdsRef.current = new Set(initialMessages.map((message) => message.id));

    let isCancelled = false;

    async function loadInitialMessages() {
      const plaintexts = await decryptConversationMessages({
        currentUserId,
        peerUserId: activeChat?.id ?? "",
        messages: initialMessages,
      });

      const decryptedMessages = await Promise.all(
        initialMessages.map((message, index) =>
          messageFromRecord(message, currentUserId, activeChat, plaintexts[index]),
        ),
      );

      if (!isCancelled) {
        setMessages(decryptedMessages);
      }
    }

    void loadInitialMessages();

    return () => {
      isCancelled = true;
    };
  }, [activeChat, currentUserId, initialMessages, isCryptoReady]);

  useEffect(() => {
    if (!activeChat || !isCryptoReady) {
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
          let text = "[Unable to decrypt message]";

          if (message.message_type === "text") {
            text = message.ciphertext;
          } else if (message.message_type === "dev_encrypted") {
            text = "[Legacy dev-encrypted message]";
          } else if (message.sender_id !== currentUserId) {
            try {
              text = await decryptIncomingMessage({
                currentUserId,
                message,
              });
            } catch (error) {
              console.error("[x3dh] decrypt failed", {
                messageId: message.id,
                messageType: message.message_type,
                senderId: message.sender_id,
                receiverId: message.receiver_id,
                header: message.header,
                error,
              });
            }
          }

          const decryptedMessage = await messageFromRecord(
            message,
            currentUserId,
            activeChat,
            text,
          );

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
  }, [activeChat, currentUserId, isCryptoReady, supabase]);

  async function handleSend(value: string) {
    if (!activeChat || !isCryptoReady) {
      return false;
    }

    setIsSending(true);
    setSendError(null);

    try {
      const encrypted = await encryptMessageForPeer({
        peerUserId: activeChat.id,
        plaintext: value,
      });

      const { data, error } = await supabase
        .from("messages")
        .insert({
          sender_id: currentUserId,
          receiver_id: activeChat.id,
          ciphertext: encrypted.ciphertext,
          nonce: encrypted.nonce,
          header: encrypted.header,
          message_type: encrypted.messageType,
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
        setMessages((currentMessages) => [
          ...currentMessages,
          {
            id: insertedMessage.id,
            sender: "You",
            text: value,
            own: true,
            timestamp: insertedMessage.created_at,
          },
        ]);
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
      isCryptoReady={isCryptoReady}
      onSend={handleSend}
    />
  );
}
