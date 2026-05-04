import { base64ToBytes, bytesToBase64 } from "@/lib/crypto/encoding";
import { hkdfSha256 } from "@/lib/crypto/kdf";
import type { SymmetricRatchetSession } from "@/lib/storage/sessionStore";

async function hmacSha256(key: Uint8Array, data: string) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(data),
  );

  return new Uint8Array(signature);
}

async function deriveChainKey(rootKey: string, info: string) {
  const chainKey = await hkdfSha256({
    inputKeyMaterial: base64ToBytes(rootKey),
    salt: new Uint8Array(32),
    info,
    lengthBytes: 32,
  });

  return bytesToBase64(chainKey);
}

export async function createSymmetricRatchetSession(params: {
  peerUserId: string;
  rootKey: string;
  myIdentityDhPublicKey: string;
  peerIdentityDhPublicKey: string;
  role: "sender" | "receiver";
  createdAt: string;
}): Promise<SymmetricRatchetSession> {
  const sendingChainKey =
    params.role === "sender"
      ? await deriveChainKey(params.rootKey, "alice-sending-chain")
      : await deriveChainKey(params.rootKey, "bob-sending-chain");

  const receivingChainKey =
    params.role === "sender"
      ? await deriveChainKey(params.rootKey, "bob-sending-chain")
      : await deriveChainKey(params.rootKey, "alice-sending-chain");

  return {
    ...params,
    sendingChainKey,
    receivingChainKey,
    sendMessageNumber: 0,
    receiveMessageNumber: 0,
  };
}

export async function advanceSendingChain(session: SymmetricRatchetSession) {
  const currentChainKey = base64ToBytes(session.sendingChainKey);
  const messageKey = await hmacSha256(currentChainKey, "message-key");
  const nextChainKey = await hmacSha256(currentChainKey, "chain-key");

  return {
    messageKey: bytesToBase64(messageKey),
    nextSession: {
      ...session,
      sendingChainKey: bytesToBase64(nextChainKey),
      sendMessageNumber: session.sendMessageNumber + 1,
    },
  };
}

export async function advanceReceivingChain(session: SymmetricRatchetSession) {
  const currentChainKey = base64ToBytes(session.receivingChainKey);
  const messageKey = await hmacSha256(currentChainKey, "message-key");
  const nextChainKey = await hmacSha256(currentChainKey, "chain-key");

  return {
    messageKey: bytesToBase64(messageKey),
    nextSession: {
      ...session,
      receivingChainKey: bytesToBase64(nextChainKey),
      receiveMessageNumber: session.receiveMessageNumber + 1,
    },
  };
}

export async function resetSymmetricRatchetSession(session: SymmetricRatchetSession) {
  return await createSymmetricRatchetSession({
    peerUserId: session.peerUserId,
    rootKey: session.rootKey,
    myIdentityDhPublicKey: session.myIdentityDhPublicKey,
    peerIdentityDhPublicKey: session.peerIdentityDhPublicKey,
    role: session.role,
    createdAt: session.createdAt,
  });
}
