import { createClient } from "@supabase/supabase-js";

export type LiveKitCredentials = { token: string; url: string };

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  return createClient(supabaseUrl, supabaseAnonKey);
}

export async function getSignedInDisplayName(): Promise<string> {
  const { data: { user }, error } = await getSupabaseClient().auth.getUser();
  if (error) throw new Error(`Could not read the signed-in user: ${error.message}`);
  if (!user) throw new Error("Sign in before joining this meeting.");

  const metadataName = user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.user_metadata?.display_name;
  const displayName = typeof metadataName === "string" && metadataName.trim()
    ? metadataName.trim()
    : user.email?.trim();
  if (!displayName) throw new Error("Your signed-in account has no display name.");
  return displayName;
}

export async function getLiveKitCredentials(code: string, displayName: string): Promise<LiveKitCredentials> {
  const response = await fetch("/api/livekit-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, displayName }),
  });

  if (response.ok) {
    const value: unknown = await response.json();
    if (
      typeof value === "object" && value !== null &&
      "token" in value && typeof value.token === "string" &&
      "url" in value && typeof value.url === "string" &&
      value.token.length > 0 && value.url.length > 0
    ) {
      return { token: value.token, url: value.url };
    }
    throw new Error("The LiveKit token endpoint returned an invalid response; expected { token, url }.");
  }

  // The demo token fallback is only for a not-yet-implemented endpoint (404).
  if (response.status !== 404) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Could not obtain a LiveKit token (${response.status})${detail ? `: ${detail}` : ""}`);
  }

  const token = process.env.NEXT_PUBLIC_DEV_LIVEKIT_TOKEN;
  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  if (!token || !url) {
    throw new Error("POST /api/livekit-token is not available. For local development, set NEXT_PUBLIC_DEV_LIVEKIT_TOKEN and NEXT_PUBLIC_LIVEKIT_URL.");
  }
  return { token, url };
}
