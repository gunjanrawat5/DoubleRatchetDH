import type { SupabaseClient, User } from "@supabase/supabase-js";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 18);
}

export function buildProfile(user: User, preferredName?: string) {
  const emailPrefix = user.email?.split("@")[0] ?? "user";
  const displayName =
    preferredName ||
    user.user_metadata.display_name ||
    user.user_metadata.full_name ||
    emailPrefix;

  const baseUsername =
    user.user_metadata.username || slugify(displayName) || slugify(emailPrefix) || "user";

  return {
    id: user.id,
    username: `${baseUsername}_${user.id.slice(0, 8)}`,
    display_name: displayName,
  };
}

export async function ensureProfile(
  supabase: SupabaseClient,
  user: User,
  preferredName?: string,
) {
  const profile = buildProfile(user, preferredName);

  return supabase.from("profiles").upsert(profile, { onConflict: "id" });
}
