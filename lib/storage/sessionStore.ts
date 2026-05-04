
import { createStore, del, get, keys, set } from "idb-keyval";

export type SymmetricRatchetSession = {
  peerUserId: string;
  rootKey: string;

  sendingChainKey: string | null;
  receivingChainKey: string | null;

  myRatchetPrivateKey: string;
  myRatchetPublicKey: string;
  theirRatchetPublicKey: string | null;

  sendMessageNumber: number;
  receiveMessageNumber: number;
  previousSendingChainLength: number;

  myIdentityDhPublicKey: string;
  peerIdentityDhPublicKey: string;

  role: "sender" | "receiver";

  createdAt: string;
};

export type X3DHSession = SymmetricRatchetSession;

const sessionStore = createStore("secure-chat-sessions", "sessions");

function sessionKeyName(userId: string, peerUserId: string) {
  return `x3dh-session:${userId}:${peerUserId}`;
}

export async function saveX3DHSession({
  userId,
  peerUserId,
  session,
}: {
  userId: string;
  peerUserId: string;
  session: SymmetricRatchetSession;
}) {
  await set(sessionKeyName(userId, peerUserId), session, sessionStore);
}

export async function getX3DHSession({
  userId,
  peerUserId,
}: {
  userId: string;
  peerUserId: string;
}) {
  return await get<SymmetricRatchetSession>(
    sessionKeyName(userId, peerUserId),
    sessionStore
  );
}

export async function deleteX3DHSession({
  userId,
  peerUserId,
}: {
  userId: string;
  peerUserId: string;
}) {
  await del(sessionKeyName(userId, peerUserId), sessionStore);
}

export async function clearX3DHSessionsForUser(userId: string) {
  const allKeys = await keys(sessionStore);
  const prefix = `x3dh-session:${userId}:`;

  await Promise.all(
    allKeys
      .filter((key): key is string => typeof key === "string")
      .filter((key) => key.startsWith(prefix))
      .map((key) => del(key, sessionStore)),
  );
}
