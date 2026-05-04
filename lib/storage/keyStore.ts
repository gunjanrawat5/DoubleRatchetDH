import { createStore, get, set } from "idb-keyval";

export type LocalIdentityKeys = {
  identityDhPrivateKey: string;
  identityDhPublicKey: string;

  identitySigningPrivateKey: string;
  identitySigningPublicKey: string;
};

export type LocalSignedPrekey = {
  keyId: number;
  privateKey: string;
  publicKey: string;
  signature: string;
};

export type LocalOneTimePrekey = {
  keyId: number;
  privateKey: string;
  publicKey: string;
};

const keyStore = createStore("secure-chat-keys", "keys");

function identityKeyName(userId: string) {
  return `identity:${userId}`;
}

function signedPrekeyName(userId: string) {
  return `signed-prekey:${userId}`;
}

function oneTimePrekeysName(userId: string) {
  return `one-time-prekeys:${userId}`;
}

export async function saveLocalIdentityKeys(
  userId: string,
  keys: LocalIdentityKeys
) {
  await set(identityKeyName(userId), keys, keyStore);
}

export async function getLocalIdentityKeys(userId: string) {
  return await get<LocalIdentityKeys>(identityKeyName(userId), keyStore);
}

export async function saveLocalSignedPrekey(
  userId: string,
  signedPrekey: LocalSignedPrekey
) {
  await set(signedPrekeyName(userId), signedPrekey, keyStore);
}

export async function getLocalSignedPrekey(userId: string) {
  return await get<LocalSignedPrekey>(signedPrekeyName(userId), keyStore);
}

export async function saveLocalOneTimePrekeys(
  userId: string,
  prekeys: LocalOneTimePrekey[]
) {
  await set(oneTimePrekeysName(userId), prekeys, keyStore);
}

export async function getLocalOneTimePrekeys(userId: string) {
  return await get<LocalOneTimePrekey[]>(
    oneTimePrekeysName(userId),
    keyStore
  );
}