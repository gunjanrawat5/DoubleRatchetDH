import { ensureIdentityKeysForCurrentUser } from "@/lib/crypto/identity";
import { ensurePrekeysForCurrentUser } from "@/lib/crypto/prekeys";
import { createClient } from "@/lib/supabase/client";
import { clearX3DHSessionsForUser } from "@/lib/storage/sessionStore";

const SESSION_STATE_VERSION = "x3dh-dr-live-v1";

function sessionStateKey(userId: string) {
  return `secure-chat-session-state:${userId}`;
}

export async function ensureCryptoSetupForCurrentUser() {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("User is not authenticated");
  }

  await ensureIdentityKeysForCurrentUser();
  await ensurePrekeysForCurrentUser();

  if (typeof window !== "undefined") {
    const key = sessionStateKey(user.id);
    const storedVersion = window.localStorage.getItem(key);

    if (storedVersion !== SESSION_STATE_VERSION) {
      await clearX3DHSessionsForUser(user.id);
      window.localStorage.setItem(key, SESSION_STATE_VERSION);
      console.log("[crypto] reset local ratchet sessions", {
        userId: user.id,
        version: SESSION_STATE_VERSION,
      });
    }
  }
}
