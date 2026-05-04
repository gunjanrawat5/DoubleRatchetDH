
import {
  base64ToBytes,
  bytesToBase64,
  bytesToText,
  textToBytes,
} from "@/lib/crypto/encoding";

export type EncryptedPayload = {
  ciphertext: string;
  nonce: string;
};

async function importAesKey(rawKey: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    rawKey,
    {
      name: "AES-GCM",
    },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function createDevSharedKey(): Promise<Uint8Array> {
  const seed = textToBytes("temporary-dev-chat-key-do-not-use-in-production");

  const hash = await crypto.subtle.digest("SHA-256", seed);

  return new Uint8Array(hash);
}

export async function encryptText(
  plaintext: string,
  rawKey: Uint8Array,
): Promise<EncryptedPayload> {
  const key = await importAesKey(rawKey);

  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const plaintextBytes = textToBytes(plaintext);

  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: nonce,
    },
    key,
    plaintextBytes,
  );

  return {
    ciphertext: bytesToBase64(new Uint8Array(encryptedBuffer)),
    nonce: bytesToBase64(nonce),
  };
}

export async function decryptText(
  payload: EncryptedPayload,
  rawKey: Uint8Array,
): Promise<string> {
  const key = await importAesKey(rawKey);

  const ciphertextBytes = base64ToBytes(payload.ciphertext);
  const nonceBytes = base64ToBytes(payload.nonce);

  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: nonceBytes,
    },
    key,
    ciphertextBytes,
  );

  return bytesToText(new Uint8Array(decryptedBuffer));
}
