import { base64ToBytes } from "@/lib/crypto/encoding";
import { decryptText, encryptText } from "@/lib/crypto/encryption";
import {
  advanceReceivingChain,
  advanceSendingChain,
  resetSymmetricRatchetSession,
} from "@/lib/crypto/symmetricRatchet";
import {
  createX3DHSessionAsReceiver,
  getOrCreateX3DHSessionAsSender,
  type X3DHInitialHeader,
} from "@/lib/crypto/x3dh";
import { createClient } from "@/lib/supabase/client";
import {
  getX3DHSession,
  saveX3DHSession,
  type SymmetricRatchetSession,
} from "@/lib/storage/sessionStore";
import type { DbMessage } from "@/components/chat/types";

async function sha256Base64(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );

  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

function isX3DHInitialHeader(header: Record<string, unknown>): header is X3DHInitialHeader {
  return (
    header.type === "x3dh_initial" &&
    typeof header.senderIdentityDhPublicKey === "string" &&
    typeof header.senderEphemeralPublicKey === "string" &&
    typeof header.receiverSignedPrekeyId === "number"
  );
}

async function getCurrentUserId() {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("User is not authenticated");
  }

  return user.id;
}

async function getOrCreateReceiverSession(
  currentUserId: string,
  message: DbMessage,
  force = false,
) {
  if (!isX3DHInitialHeader(message.header)) {
    throw new Error("Missing X3DH initial header for receiver session creation");
  }

  return await createX3DHSessionAsReceiver({
    senderUserId: message.sender_id,
    header: message.header,
    force,
  });
}

export async function encryptMessageForPeer({
  peerUserId,
  plaintext,
}: {
  peerUserId: string;
  plaintext: string;
}) {
  const currentUserId = await getCurrentUserId();
  const { session, initialHeader } = await getOrCreateX3DHSessionAsSender(peerUserId);
  const { messageKey, nextSession } = await advanceSendingChain(session);

  console.log("[ratchet] send", {
    peerUserId,
    messageNumber: session.sendMessageNumber,
    nextMessageNumber: nextSession.sendMessageNumber,
    messageKeyFingerprint: await sha256Base64(messageKey),
  });

  await saveX3DHSession({
    userId: currentUserId,
    peerUserId,
    session: nextSession,
  });

  const encrypted = await encryptText(plaintext, base64ToBytes(messageKey));

  return {
    ciphertext: encrypted.ciphertext,
    nonce: encrypted.nonce,
    header: initialHeader ?? {},
    messageType: initialHeader ? "x3dh_initial" : "x3dh_message",
  };
}

export async function decryptIncomingMessage({
  currentUserId,
  message,
}: {
  currentUserId: string;
  message: DbMessage;
}) {
  const peerUserId = message.sender_id;
  let session = await getX3DHSession({
    userId: currentUserId,
    peerUserId,
  });

  if (!session) {
    session = await getOrCreateReceiverSession(currentUserId, message);
  } else if (message.message_type === "x3dh_initial") {
    session = await getOrCreateReceiverSession(currentUserId, message, true);
  }

  const { messageKey, nextSession } = await advanceReceivingChain(session);

  console.log("[ratchet] receive", {
    peerUserId,
    messageId: message.id,
    messageNumber: session.receiveMessageNumber,
    nextMessageNumber: nextSession.receiveMessageNumber,
    messageKeyFingerprint: await sha256Base64(messageKey),
  });

  await saveX3DHSession({
    userId: currentUserId,
    peerUserId,
    session: nextSession,
  });

  return await decryptText(
    {
      ciphertext: message.ciphertext,
      nonce: message.nonce,
    },
    base64ToBytes(messageKey),
  );
}

export async function decryptConversationMessages({
  currentUserId,
  peerUserId,
  messages,
}: {
  currentUserId: string;
  peerUserId: string;
  messages: DbMessage[];
}) {
  let baseSession = await getX3DHSession({
    userId: currentUserId,
    peerUserId,
  });

  if (!baseSession) {
    const firstIncomingInitial = messages.find(
      (message) =>
        message.sender_id === peerUserId &&
        message.receiver_id === currentUserId &&
        message.message_type === "x3dh_initial",
    );

    if (firstIncomingInitial) {
      baseSession = await getOrCreateReceiverSession(currentUserId, firstIncomingInitial, true);
    }
  }

  if (!baseSession) {
    return messages.map((message) => {
      if (message.message_type === "text") {
        return message.ciphertext;
      }

      if (message.message_type === "dev_encrypted") {
        return "[Legacy dev-encrypted message]";
      }

      return "[Unable to decrypt message]";
    });
  }

  let replaySession: SymmetricRatchetSession = await resetSymmetricRatchetSession(baseSession);
  const plaintexts: string[] = [];

  for (const message of messages) {
    if (message.message_type === "text") {
      plaintexts.push(message.ciphertext);
      continue;
    }

    if (message.message_type === "dev_encrypted") {
      plaintexts.push("[Legacy dev-encrypted message]");
      continue;
    }

    try {
      if (message.sender_id === currentUserId) {
        const { messageKey, nextSession } = await advanceSendingChain(replaySession);
        replaySession = nextSession;

        const text = await decryptText(
          {
            ciphertext: message.ciphertext,
            nonce: message.nonce,
          },
          base64ToBytes(messageKey),
        );

        plaintexts.push(text);
      } else {
        if (message.message_type === "x3dh_initial" && isX3DHInitialHeader(message.header)) {
          replaySession = await getOrCreateReceiverSession(currentUserId, message, true);
        }

        const { messageKey, nextSession } = await advanceReceivingChain(replaySession);
        replaySession = nextSession;

        const text = await decryptText(
          {
            ciphertext: message.ciphertext,
            nonce: message.nonce,
          },
          base64ToBytes(messageKey),
        );

        plaintexts.push(text);
      }
    } catch {
      plaintexts.push("[Unable to decrypt message]");
    }
  }

  await saveX3DHSession({
    userId: currentUserId,
    peerUserId,
    session: replaySession,
  });

  return plaintexts;
}
