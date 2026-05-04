
import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { base64ToBytes, bytesToBase64 } from "@/lib/crypto/encoding";
import { deriveX3DHRootKey } from "@/lib/crypto/kdf";
import { createSymmetricRatchetSession } from "@/lib/crypto/symmetricRatchet";
import { createClient } from "@/lib/supabase/client";
import {
  getLocalIdentityKeys,
  getLocalOneTimePrekeys,
  getLocalSignedPrekey,
} from "@/lib/storage/keyStore";
import {
  deleteX3DHSession,
  getX3DHSession,
  saveX3DHSession,
  type X3DHSession,
} from "@/lib/storage/sessionStore";

function randomPrivateKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

export type PublicPrekeyBundle = {
  userId: string;

  identityDhPublicKey: string;
  identitySigningPublicKey: string;

  signedPrekeyId: number;
  signedPrekeyPublicKey: string;
  signedPrekeySignature: string;

  oneTimePrekeyId: number | null;
  oneTimePrekeyPublicKey: string | null;
};

export type X3DHInitialHeader = {
  type: "x3dh_initial";

  senderIdentityDhPublicKey: string;
  senderEphemeralPublicKey: string;

  receiverSignedPrekeyId: number;
  receiverOneTimePrekeyId: number | null;
};

export type X3DHStoredMessage = {
  sender_id: string;
  receiver_id: string;
  ciphertext: string;
  nonce: string;
  header: Record<string, unknown>;
  message_type: string;
};

export async function fetchPrekeyBundle(
  peerUserId: string
): Promise<PublicPrekeyBundle> {
  const supabase = createClient();

  const { data: identityKey, error: identityError } = await supabase
    .from("identity_keys")
    .select("identity_dh_public_key, identity_signing_public_key")
    .eq("user_id", peerUserId)
    .single();

  if (identityError || !identityKey) {
    throw new Error("Could not fetch peer identity key");
  }

  const { data: signedPrekey, error: signedPrekeyError } = await supabase
    .from("signed_prekeys")
    .select("key_id, public_key, signature")
    .eq("user_id", peerUserId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (signedPrekeyError || !signedPrekey) {
    throw new Error("Could not fetch peer signed prekey");
  }

  return {
    userId: peerUserId,

    identityDhPublicKey: identityKey.identity_dh_public_key,
    identitySigningPublicKey: identityKey.identity_signing_public_key,

    signedPrekeyId: signedPrekey.key_id,
    signedPrekeyPublicKey: signedPrekey.public_key,
    signedPrekeySignature: signedPrekey.signature,

    // One-time prekeys are optional in X3DH. We disable claiming for now because
    // the current browser-local private key inventory can drift from the claimed
    // server row, which breaks receiver-side DH4 reconstruction.
    oneTimePrekeyId: null,
    oneTimePrekeyPublicKey: null,
  };
}

export function verifySignedPrekey(bundle: PublicPrekeyBundle): boolean {
  const signedPrekeyPublicKey = base64ToBytes(bundle.signedPrekeyPublicKey);
  const signature = base64ToBytes(bundle.signedPrekeySignature);
  const identitySigningPublicKey = base64ToBytes(
    bundle.identitySigningPublicKey
  );

  return ed25519.verify(
    signature,
    signedPrekeyPublicKey,
    identitySigningPublicKey
  );
}

export async function createX3DHSessionAsSender(
  peerUserId: string
): Promise<{
  session: X3DHSession;
  initialHeader: X3DHInitialHeader;
}> {
  const supabase = createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("User is not authenticated");
  }

  const existingSession = await getX3DHSession({
    userId: user.id,
    peerUserId,
  });

  if (existingSession) {
    throw new Error("Session already exists");
  }

  const myIdentityKeys = await getLocalIdentityKeys(user.id);

  if (!myIdentityKeys) {
    throw new Error("Local identity keys not found");
  }

  const peerBundle = await fetchPrekeyBundle(peerUserId);

  const isValidSignedPrekey = verifySignedPrekey(peerBundle);

  if (!isValidSignedPrekey) {
    throw new Error("Peer signed prekey signature is invalid");
  }

  const aliceIdentityPrivateKey = base64ToBytes(
    myIdentityKeys.identityDhPrivateKey
  );

  const bobIdentityPublicKey = base64ToBytes(peerBundle.identityDhPublicKey);
  const bobSignedPrekeyPublicKey = base64ToBytes(
    peerBundle.signedPrekeyPublicKey
  );

  const aliceEphemeralPrivateKey = randomPrivateKey();
  const aliceEphemeralPublicKey = x25519.getPublicKey(
    aliceEphemeralPrivateKey
  );

  const dh1 = x25519.getSharedSecret(
    aliceIdentityPrivateKey,
    bobSignedPrekeyPublicKey
  );

  const dh2 = x25519.getSharedSecret(
    aliceEphemeralPrivateKey,
    bobIdentityPublicKey
  );

  const dh3 = x25519.getSharedSecret(
    aliceEphemeralPrivateKey,
    bobSignedPrekeyPublicKey
  );

  const dhOutputs = [dh1, dh2, dh3];

  if (peerBundle.oneTimePrekeyPublicKey) {
    const bobOneTimePrekeyPublicKey = base64ToBytes(
      peerBundle.oneTimePrekeyPublicKey
    );

    const dh4 = x25519.getSharedSecret(
      aliceEphemeralPrivateKey,
      bobOneTimePrekeyPublicKey
    );

    dhOutputs.push(dh4);
  }

  const rootKey = await deriveX3DHRootKey(dhOutputs);

  const session = await createSymmetricRatchetSession({
    peerUserId,
    rootKey,
    myIdentityDhPublicKey: myIdentityKeys.identityDhPublicKey,
    peerIdentityDhPublicKey: peerBundle.identityDhPublicKey,
    role: "sender",
    createdAt: new Date().toISOString(),
  });

  const initialHeader: X3DHInitialHeader = {
    type: "x3dh_initial",

    senderIdentityDhPublicKey: myIdentityKeys.identityDhPublicKey,
    senderEphemeralPublicKey: bytesToBase64(aliceEphemeralPublicKey),

    receiverSignedPrekeyId: peerBundle.signedPrekeyId,
    receiverOneTimePrekeyId: peerBundle.oneTimePrekeyId,
  };

  session.pendingInitialHeader = initialHeader;

  await saveX3DHSession({
    userId: user.id,
    peerUserId,
    session,
  });

  return {
    session,
    initialHeader,
  };
}

export async function createX3DHSessionAsReceiver({
  senderUserId,
  header,
  force = false,
}: {
  senderUserId: string;
  header: X3DHInitialHeader;
  force?: boolean;
}): Promise<X3DHSession> {
  const supabase = createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("User is not authenticated");
  }

  if (!force) {
    const existingSession = await getX3DHSession({
      userId: user.id,
      peerUserId: senderUserId,
    });

    if (existingSession) {
      return existingSession;
    }
  } else {
    await deleteX3DHSession({
      userId: user.id,
      peerUserId: senderUserId,
    });
  }

  const myIdentityKeys = await getLocalIdentityKeys(user.id);

  if (!myIdentityKeys) {
    throw new Error("Local identity keys not found");
  }

  const mySignedPrekey = await getLocalSignedPrekey(user.id);

  if (!mySignedPrekey) {
    throw new Error("Local signed prekey not found");
  }

  if (mySignedPrekey.keyId !== header.receiverSignedPrekeyId) {
    throw new Error("Signed prekey ID mismatch");
  }

  const myIdentityPrivateKey = base64ToBytes(
    myIdentityKeys.identityDhPrivateKey
  );

  const mySignedPrekeyPrivateKey = base64ToBytes(mySignedPrekey.privateKey);

  const senderIdentityPublicKey = base64ToBytes(
    header.senderIdentityDhPublicKey
  );

  const senderEphemeralPublicKey = base64ToBytes(
    header.senderEphemeralPublicKey
  );

  const dh1 = x25519.getSharedSecret(
    mySignedPrekeyPrivateKey,
    senderIdentityPublicKey
  );

  const dh2 = x25519.getSharedSecret(
    myIdentityPrivateKey,
    senderEphemeralPublicKey
  );

  const dh3 = x25519.getSharedSecret(
    mySignedPrekeyPrivateKey,
    senderEphemeralPublicKey
  );

  const dhOutputs = [dh1, dh2, dh3];

  if (header.receiverOneTimePrekeyId !== null) {
    const myOneTimePrekeys = await getLocalOneTimePrekeys(user.id);

    const matchingOneTimePrekey = myOneTimePrekeys?.find(
      (prekey) => prekey.keyId === header.receiverOneTimePrekeyId
    );

    if (!matchingOneTimePrekey) {
      throw new Error(
        `Matching one-time prekey private key not found for key_id ${header.receiverOneTimePrekeyId}`,
      );
    }

    const myOneTimePrekeyPrivateKey = base64ToBytes(
      matchingOneTimePrekey.privateKey
    );

    const dh4 = x25519.getSharedSecret(
      myOneTimePrekeyPrivateKey,
      senderEphemeralPublicKey
    );

    dhOutputs.push(dh4);
  }

  const rootKey = await deriveX3DHRootKey(dhOutputs);

  const session = await createSymmetricRatchetSession({
    peerUserId: senderUserId,
    rootKey,
    myIdentityDhPublicKey: myIdentityKeys.identityDhPublicKey,
    peerIdentityDhPublicKey: header.senderIdentityDhPublicKey,
    role: "receiver",
    createdAt: new Date().toISOString(),
  });

  await saveX3DHSession({
    userId: user.id,
    peerUserId: senderUserId,
    session,
  });

  return session;
}

export async function getOrCreateX3DHSessionAsSender(peerUserId: string) {
  const supabase = createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("User is not authenticated");
  }

  const existingSession = await getX3DHSession({
    userId: user.id,
    peerUserId,
  });

  if (existingSession) {
    const pendingInitialHeader =
      existingSession.pendingInitialHeader &&
      typeof existingSession.pendingInitialHeader === "object" &&
      isStoredInitialHeader(existingSession.pendingInitialHeader)
        ? existingSession.pendingInitialHeader
        : null;

    return {
      session: existingSession,
      initialHeader: pendingInitialHeader,
    };
  }

  return await createX3DHSessionAsSender(peerUserId);
}

function isStoredInitialHeader(header: Record<string, unknown>): header is X3DHInitialHeader {
  return (
    header.type === "x3dh_initial" &&
    typeof header.senderIdentityDhPublicKey === "string" &&
    typeof header.senderEphemeralPublicKey === "string" &&
    typeof header.receiverSignedPrekeyId === "number" &&
    (typeof header.receiverOneTimePrekeyId === "number" ||
      header.receiverOneTimePrekeyId === null)
  );
}
