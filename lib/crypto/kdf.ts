
import { bytesToBase64 } from "@/lib/crypto/encoding";

export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);

  let offset = 0;

  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }

  return result;
}

export async function hkdfSha256({
  inputKeyMaterial,
  salt,
  info,
  lengthBytes = 32,
}: {
  inputKeyMaterial: Uint8Array;
  salt: Uint8Array;
  info: string;
  lengthBytes?: number;
}): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    inputKeyMaterial,
    "HKDF",
    false,
    ["deriveBits"],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info: new TextEncoder().encode(info),
    },
    baseKey,
    lengthBytes * 8,
  );

  return new Uint8Array(bits);
}

export async function deriveX3DHRootKey(
  dhOutputs: Uint8Array[],
): Promise<string> {
  const inputKeyMaterial = concatBytes(...dhOutputs);

  const salt = new Uint8Array(32);

  const rootKey = await hkdfSha256({
    inputKeyMaterial,
    salt,
    info: "secure-chat-x3dh-root-key-v1",
    lengthBytes: 32,
  });

  return bytesToBase64(rootKey);
}
