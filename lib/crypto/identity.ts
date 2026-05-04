
import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { bytesToBase64 } from "@/lib/crypto/encoding";
import { createClient } from "@/lib/supabase/client";
import {
  getLocalIdentityKeys,
  saveLocalIdentityKeys,
  type LocalIdentityKeys,
} from "@/lib/storage/keyStore";

function randomPrivateKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

export async function generateIdentityKeys(): Promise<LocalIdentityKeys> {
  const identityDhPrivateKey = randomPrivateKey();
  const identityDhPublicKey = x25519.getPublicKey(identityDhPrivateKey);

  const identitySigningPrivateKey = ed25519.utils.randomSecretKey();
  const identitySigningPublicKey = ed25519.getPublicKey(
    identitySigningPrivateKey
  );

  return {
    identityDhPrivateKey: bytesToBase64(identityDhPrivateKey),
    identityDhPublicKey: bytesToBase64(identityDhPublicKey),

    identitySigningPrivateKey: bytesToBase64(identitySigningPrivateKey),
    identitySigningPublicKey: bytesToBase64(identitySigningPublicKey),
  };
}

export async function getOrCreateIdentityKeys(userId: string) {
  const existingKeys = await getLocalIdentityKeys(userId);

  if (existingKeys) {
    return existingKeys;
  }

  const newKeys = await generateIdentityKeys();

  await saveLocalIdentityKeys(userId, newKeys);

  return newKeys;
}

export async function uploadIdentityPublicKeys({
  userId,
  identityDhPublicKey,
  identitySigningPublicKey,
}: {
  userId: string;
  identityDhPublicKey: string;
  identitySigningPublicKey: string;
}) {
  const supabase = createClient();

  const { error } = await supabase.from("identity_keys").upsert(
    {
      user_id: userId,

      // Keep this for compatibility with your existing schema.
      identity_public_key: identityDhPublicKey,

      identity_dh_public_key: identityDhPublicKey,
      identity_signing_public_key: identitySigningPublicKey,
    },
    {
      onConflict: "user_id",
    }
  );

  if (error) {
    throw error;
  }
}

export async function ensureIdentityKeysForCurrentUser() {
  const supabase = createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("User is not authenticated");
  }

  const keys = await getOrCreateIdentityKeys(user.id);

  await uploadIdentityPublicKeys({
    userId: user.id,
    identityDhPublicKey: keys.identityDhPublicKey,
    identitySigningPublicKey: keys.identitySigningPublicKey,
  });

  return keys;
}