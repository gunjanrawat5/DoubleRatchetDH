import { ensureIdentityKeysForCurrentUser } from "@/lib/crypto/identity";
import { ensurePrekeysForCurrentUser } from "@/lib/crypto/prekeys";
import { createClient } from "@/lib/supabase/client";
import { clearX3DHSessionsForUser } from "@/lib/storage/sessionStore";

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
  await clearX3DHSessionsForUser(user.id);
}
