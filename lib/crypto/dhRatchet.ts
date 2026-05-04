import { x25519 } from "@noble/curves/ed25519.js";
import { base64ToBytes, bytesToBase64 } from "@/lib/crypto/encoding";
import { deriveRootAndChainKey } from "@/lib/crypto/kdf";
import type { SymmetricRatchetSession } from "@/lib/storage/sessionStore";

export type RatchetKeyPair = {
  privateKey: string;
  publicKey: string;
};

export function generateRatchetKeyPair(): RatchetKeyPair {
  const privateKey = crypto.getRandomValues(new Uint8Array(32));
  const publicKey = x25519.getPublicKey(privateKey);

  return {
    privateKey: bytesToBase64(privateKey),
    publicKey: bytesToBase64(publicKey),
  };
}

export async function performReceivingDHRatchet({
  session,
  receivedDhPublicKey,
}: {
  session: SymmetricRatchetSession;
  receivedDhPublicKey: string;
}): Promise<SymmetricRatchetSession> {
  const currentRatchetPrivateKey = base64ToBytes(session.myRatchetPrivateKey);
  const theirPublicKey = base64ToBytes(receivedDhPublicKey);

  const receiveDhOutput = x25519.getSharedSecret(
    currentRatchetPrivateKey,
    theirPublicKey,
  );

  const { newRootKey, newChainKey: newReceivingChainKey } =
    await deriveRootAndChainKey({
      rootKey: session.rootKey,
      dhOutput: receiveDhOutput,
    });

  const nextRatchetKeyPair = generateRatchetKeyPair();
  const sendDhOutput = x25519.getSharedSecret(
    base64ToBytes(nextRatchetKeyPair.privateKey),
    theirPublicKey,
  );

  const { newRootKey: finalRootKey, newChainKey: newSendingChainKey } =
    await deriveRootAndChainKey({
      rootKey: newRootKey,
      dhOutput: sendDhOutput,
    });

  return {
    ...session,
    rootKey: finalRootKey,
    sendingChainKey: newSendingChainKey,
    receivingChainKey: newReceivingChainKey,
    myRatchetPrivateKey: nextRatchetKeyPair.privateKey,
    myRatchetPublicKey: nextRatchetKeyPair.publicKey,
    theirRatchetPublicKey: receivedDhPublicKey,
    previousSendingChainLength: session.sendMessageNumber,
    sendMessageNumber: 0,
    receiveMessageNumber: 0,
  };
}

export async function performSendingDHRatchet({
  session,
}: {
  session: SymmetricRatchetSession;
}): Promise<SymmetricRatchetSession> {
  if (!session.theirRatchetPublicKey) {
    throw new Error("Cannot perform sending DH ratchet without peer ratchet public key");
  }

  const myRatchetPrivateKey = base64ToBytes(session.myRatchetPrivateKey);
  const theirPublicKey = base64ToBytes(session.theirRatchetPublicKey);

  const sendDhOutput = x25519.getSharedSecret(
    myRatchetPrivateKey,
    theirPublicKey,
  );

  const { newRootKey, newChainKey } = await deriveRootAndChainKey({
    rootKey: session.rootKey,
    dhOutput: sendDhOutput,
  });

  return {
    ...session,
    rootKey: newRootKey,
    sendingChainKey: newChainKey,
    previousSendingChainLength: session.sendMessageNumber,
    sendMessageNumber: 0,
  };
}
