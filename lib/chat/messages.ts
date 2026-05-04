import { base64ToBytes } from "@/lib/crypto/encoding";
import { performReceivingDHRatchet, performSendingDHRatchet } from "@/lib/crypto/dhRatchet";
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

type DoubleRatchetHeader = {
  type: "double_ratchet";
  dhPublicKey: string;
  pn: number;
  n: number;
};

type DoubleRatchetInitialHeader = {
  type: "double_ratchet_initial";
  x3dh: X3DHInitialHeader;
  dhPublicKey: string;
  pn: number;
  n: number;
};

function isX3DHInitialHeader(header: Record<string, unknown>): header is X3DHInitialHeader {
  return (
    header.type === "x3dh_initial" &&
    typeof header.senderIdentityDhPublicKey === "string" &&
    typeof header.senderEphemeralPublicKey === "string" &&
    typeof header.receiverSignedPrekeyId === "number"
  );
}

function isDoubleRatchetInitialHeader(
  header: Record<string, unknown>,
): header is DoubleRatchetInitialHeader {
  return (
    header.type === "double_ratchet_initial" &&
    typeof header.dhPublicKey === "string" &&
    typeof header.pn === "number" &&
    typeof header.n === "number" &&
    typeof header.x3dh === "object" &&
    header.x3dh !== null &&
    isX3DHInitialHeader(header.x3dh as Record<string, unknown>)
  );
}

function getHeaderDhPublicKey(header: Record<string, unknown>) {
  return typeof header.dhPublicKey === "string" ? header.dhPublicKey : null;
}

function buildDoubleRatchetHeader(session: SymmetricRatchetSession): DoubleRatchetHeader {
  return {
    type: "double_ratchet",
    dhPublicKey: session.myRatchetPublicKey,
    pn: session.previousSendingChainLength,
    n: session.sendMessageNumber,
  };
}

function shortKey(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return `${value.slice(0, 12)}...`;
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
  persist = true,
) {
  if (!isDoubleRatchetInitialHeader(message.header)) {
    throw new Error("Missing double ratchet initial header for receiver session creation");
  }

  const session = await createX3DHSessionAsReceiver({
    senderUserId: message.sender_id,
    header: message.header.x3dh,
    force,
  });

  const updatedSession: SymmetricRatchetSession = {
    ...session,
    theirRatchetPublicKey: message.header.dhPublicKey,
  };

  if (persist) {
    await saveX3DHSession({
      userId: currentUserId,
      peerUserId: message.sender_id,
      session: updatedSession,
    });
  }

  return updatedSession;
}

export async function encryptMessageForPeer({
  peerUserId,
  plaintext,
}: {
  peerUserId: string;
  plaintext: string;
}) {
  const currentUserId = await getCurrentUserId();
  const { session: currentSession, initialHeader } = await getOrCreateX3DHSessionAsSender(peerUserId);
  let session = currentSession;

  if (!session.sendingChainKey) {
    console.log("[dh-ratchet] performing sending ratchet", {
      currentUserId,
      peerUserId,
      myDhPublicKey: shortKey(session.myRatchetPublicKey),
      theirDhPublicKey: shortKey(session.theirRatchetPublicKey),
      previousRootKey: shortKey(session.rootKey),
    });

    session = await performSendingDHRatchet({
      session,
    });

    console.log("[dh-ratchet] sending ratchet complete", {
      currentUserId,
      peerUserId,
      myDhPublicKey: shortKey(session.myRatchetPublicKey),
      theirDhPublicKey: shortKey(session.theirRatchetPublicKey),
      newRootKey: shortKey(session.rootKey),
      sendMessageNumber: session.sendMessageNumber,
    });
  }

  const { messageKey, nextSession } = await advanceSendingChain(session);

  console.log("[dh-ratchet] send header", {
    currentUserId,
    peerUserId,
    type: initialHeader ? "double_ratchet_initial" : "double_ratchet",
    myDhPublicKey: shortKey(session.myRatchetPublicKey),
    theirDhPublicKey: shortKey(session.theirRatchetPublicKey),
    pn: session.previousSendingChainLength,
    n: session.sendMessageNumber,
  });

  await saveX3DHSession({
    userId: currentUserId,
    peerUserId,
    session: nextSession,
  });

  const encrypted = await encryptText(plaintext, base64ToBytes(messageKey));
  const doubleRatchetHeader = buildDoubleRatchetHeader(session);

  return {
    ciphertext: encrypted.ciphertext,
    nonce: encrypted.nonce,
    header: initialHeader
      ? {
          type: "double_ratchet_initial",
          x3dh: initialHeader,
          dhPublicKey: doubleRatchetHeader.dhPublicKey,
          pn: doubleRatchetHeader.pn,
          n: doubleRatchetHeader.n,
        }
      : doubleRatchetHeader,
    messageType: initialHeader ? "double_ratchet_initial" : "double_ratchet",
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
  } else if (message.message_type === "double_ratchet_initial") {
    session = await getOrCreateReceiverSession(currentUserId, message, true);
  }

  const receivedDhPublicKey = getHeaderDhPublicKey(message.header);

  console.log("[dh-ratchet] receive header", {
    currentUserId,
    peerUserId,
    messageId: message.id,
    type: message.message_type,
    receivedDhPublicKey: shortKey(receivedDhPublicKey),
    storedTheirDhPublicKey: shortKey(session.theirRatchetPublicKey),
    myDhPublicKey: shortKey(session.myRatchetPublicKey),
  });

  if (receivedDhPublicKey && session.theirRatchetPublicKey !== receivedDhPublicKey) {
    console.log("[dh-ratchet] performing receiving ratchet", {
      currentUserId,
      peerUserId,
      messageId: message.id,
      previousTheirDhPublicKey: shortKey(session.theirRatchetPublicKey),
      newTheirDhPublicKey: shortKey(receivedDhPublicKey),
      previousRootKey: shortKey(session.rootKey),
    });

    session = await performReceivingDHRatchet({
      session,
      receivedDhPublicKey,
    });

    console.log("[dh-ratchet] receiving ratchet complete", {
      currentUserId,
      peerUserId,
      messageId: message.id,
      newMyDhPublicKey: shortKey(session.myRatchetPublicKey),
      storedTheirDhPublicKey: shortKey(session.theirRatchetPublicKey),
      newRootKey: shortKey(session.rootKey),
      sendMessageNumber: session.sendMessageNumber,
      receiveMessageNumber: session.receiveMessageNumber,
    });

    await saveX3DHSession({
      userId: currentUserId,
      peerUserId,
      session,
    });
  }

  const { messageKey, nextSession } = await advanceReceivingChain(session);

  const finalizedSession: SymmetricRatchetSession = {
    ...nextSession,
    pendingInitialHeader: null,
  };

  await saveX3DHSession({
    userId: currentUserId,
    peerUserId,
    session: finalizedSession,
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
        message.message_type === "double_ratchet_initial",
    );

    if (firstIncomingInitial) {
      try {
        baseSession = await getOrCreateReceiverSession(
          currentUserId,
          firstIncomingInitial,
          true,
          false,
        );
      } catch (error) {
        console.warn("[history] could not bootstrap receiver session from stored initial message", {
          currentUserId,
          peerUserId,
          messageId: firstIncomingInitial.id,
          messageType: firstIncomingInitial.message_type,
          error: error instanceof Error ? error.message : String(error),
        });
      }
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
        if (message.message_type === "double_ratchet_initial") {
          replaySession = await getOrCreateReceiverSession(
            currentUserId,
            message,
            true,
            false,
          );
        }

        const receivedDhPublicKey = getHeaderDhPublicKey(message.header);

        if (
          receivedDhPublicKey &&
          replaySession.theirRatchetPublicKey !== receivedDhPublicKey
        ) {
          replaySession = await performReceivingDHRatchet({
            session: replaySession,
            receivedDhPublicKey,
          });
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

  return plaintexts;
}
