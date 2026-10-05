import { createClient } from "@supabase/supabase-js";

export type LiveKitCredentials = { token: string; url: string };
export type MeetingUser = { id: string | null; displayName: string };

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  return createClient(supabaseUrl, supabaseAnonKey);
}

export async function getSignedInDisplayName(localName?: string): Promise<string> {
  return (await getMeetingUser(localName)).displayName;
}

export async function getMeetingUser(localName?: string, suppliedUserId?: string): Promise<MeetingUser> {
  // 1. Check demo user cookie first
  if (typeof document !== "undefined") {
    const match = document.cookie.match(/meetmate_demo_user=([^;]+)/);
    if (match) {
      try {
        const parsed = JSON.parse(decodeURIComponent(match[1]));
        if (parsed?.id) {
          return {
            id: suppliedUserId?.trim() || parsed.id,
            displayName: localName?.trim() || parsed.name || parsed.email || "Priya Sharma",
          };
        }
      } catch {}
    }
  }

  // 2. Try Supabase Auth when configured with real credentials
  try {
    if (
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("mock") &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("example")
    ) {
      const { data: { user } } = await getSupabaseClient().auth.getUser();
      if (user) {
        const metadataName = user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.user_metadata?.display_name;
        const displayName = typeof metadataName === "string" && metadataName.trim()
          ? metadataName.trim()
          : user.email?.trim() || "Participant";
        return { id: suppliedUserId?.trim() || user.id, displayName };
      }
    }
  } catch {}

  // 3. Fallback default user
  return {
    id: suppliedUserId?.trim() || `user-${Math.floor(Math.random() * 9000) + 1000}`,
    displayName: localName?.trim() || "Priya Sharma",
  };
}

export async function getLiveKitCredentials(code: string, displayName: string): Promise<LiveKitCredentials> {
  const developmentToken = getDevelopmentTokenOverride();
  const developmentUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  if (developmentToken) {
    if (!developmentUrl) {
      throw new Error("Set NEXT_PUBLIC_LIVEKIT_URL to use the development ?token= override.");
    }
    return { token: developmentToken, url: developmentUrl };
  }

  try {
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
    }
  } catch {}

  // Safe fallback credentials for demo & offline modes
  return {
    token: "mock-jwt-token-livekit-meetmate-dev",
    url: process.env.NEXT_PUBLIC_LIVEKIT_URL || "wss://meetmate-demo.livekit.cloud",
  };
}

function getDevelopmentTokenOverride(): string | null {
  if (process.env.NODE_ENV === "production") return null;

  const currentUrl = new URL(window.location.href);
  const token = currentUrl.searchParams.get("token")?.trim();
  if (!token) return null;

  currentUrl.searchParams.delete("token");
  window.history.replaceState(
    window.history.state,
    "",
    `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
  );
  return token;
}

function parseDevelopmentTokens(value: string): string[] {
  let tokens: string[];
  try {
    const parsed: unknown = JSON.parse(value);
    tokens = Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string")
      ? parsed
      : value.split(/[\r\n,]+/);
  } catch {
    tokens = value.split(/[\r\n,]+/);
  }

  const cleanTokens = tokens.map((token) => token.trim()).filter(Boolean);
  if (cleanTokens.length === 0) {
    throw new Error("NEXT_PUBLIC_DEV_LIVEKIT_TOKEN must contain at least one token.");
  }
  return cleanTokens;
}
