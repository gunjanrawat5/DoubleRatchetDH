import { ensureIdentityKeysForCurrentUser } from "@/lib/crypto/identity";
import { ensurePrekeysForCurrentUser } from "@/lib/crypto/prekeys";

export async function ensureCryptoSetupForCurrentUser() {
  await ensureIdentityKeysForCurrentUser();
  await ensurePrekeysForCurrentUser();
}