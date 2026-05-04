import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { base64ToBytes, bytesToBase64 } from "@/lib/crypto/encoding";
import { createClient } from "@/lib/supabase/client";
import {
  getLocalIdentityKeys,
  getLocalOneTimePrekeys,
  getLocalSignedPrekey,
  saveLocalOneTimePrekeys,
  saveLocalSignedPrekey,
  type LocalOneTimePrekey,
  type LocalSignedPrekey,
} from "@/lib/storage/keyStore";

function randomPrivateKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

function makeKeyId(): number {
  return Math.floor(Date.now() % 2147483647);
}

export async function generateSignedPrekey(
  userId: string
): Promise<LocalSignedPrekey> {
  const identityKeys = await getLocalIdentityKeys(userId);

  if (!identityKeys) {
    throw new Error("Identity keys must be created before signed prekey");
  }

  const keyId = makeKeyId();

  const privateKey = randomPrivateKey();
  const publicKey = x25519.getPublicKey(privateKey);

  const signingPrivateKey = base64ToBytes(
    identityKeys.identitySigningPrivateKey
  );

  const signature = ed25519.sign(publicKey, signingPrivateKey);

  return {
    keyId,
    privateKey: bytesToBase64(privateKey),
    publicKey: bytesToBase64(publicKey),
    signature: bytesToBase64(signature),
  };
}

export function generateOneTimePrekeys(count = 50): LocalOneTimePrekey[] {
  const keys: LocalOneTimePrekey[] = [];

  const baseKeyId = Math.floor(Date.now() % 1000000000);

  for (let i = 0; i < count; i++) {
    const privateKey = randomPrivateKey();
    const publicKey = x25519.getPublicKey(privateKey);

    keys.push({
      keyId: baseKeyId + i,
      privateKey: bytesToBase64(privateKey),
      publicKey: bytesToBase64(publicKey),
    });
  }

  return keys;
}

export async function uploadSignedPrekey({
  userId,
  signedPrekey,
}: {
  userId: string;
  signedPrekey: LocalSignedPrekey;
}) {
  const supabase = createClient();

  const { error } = await supabase.from("signed_prekeys").upsert(
    {
      user_id: userId,
      key_id: signedPrekey.keyId,
      public_key: signedPrekey.publicKey,
      signature: signedPrekey.signature,
    },
    {
      onConflict: "user_id,key_id",
    }
  );

  if (error) {
    throw error;
  }
}

export async function uploadOneTimePrekeys({
  userId,
  prekeys,
}: {
  userId: string;
  prekeys: LocalOneTimePrekey[];
}) {
  const supabase = createClient();

  const rows = prekeys.map((prekey) => ({
    user_id: userId,
    key_id: prekey.keyId,
    public_key: prekey.publicKey,
    used: false,
  }));

  const { error } = await supabase.from("one_time_prekeys").upsert(rows, {
    onConflict: "user_id,key_id",
  });

  if (error) {
    throw error;
  }
}

export async function ensurePrekeysForCurrentUser() {
  const supabase = createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("User is not authenticated");
  }

  let signedPrekey = await getLocalSignedPrekey(user.id);

  if (!signedPrekey) {
    signedPrekey = await generateSignedPrekey(user.id);
    await saveLocalSignedPrekey(user.id, signedPrekey);
    await uploadSignedPrekey({
      userId: user.id,
      signedPrekey,
    });
  }

  let oneTimePrekeys = await getLocalOneTimePrekeys(user.id);

  if (!oneTimePrekeys || oneTimePrekeys.length === 0) {
    oneTimePrekeys = generateOneTimePrekeys(50);
    await saveLocalOneTimePrekeys(user.id, oneTimePrekeys);
    await uploadOneTimePrekeys({
      userId: user.id,
      prekeys: oneTimePrekeys,
    });
  }

  return {
    signedPrekey,
    oneTimePrekeys,
  };
}