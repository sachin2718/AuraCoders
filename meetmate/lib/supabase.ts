/**
 * lib/supabase.ts
 * Supabase client configurations:
 * - Browser client: uses NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
 * - Server client: uses SUPABASE_SERVICE_ROLE_KEY (never exposed to browser bundles)
 *
 * SECURITY CONSTRAINTS:
 * - Server client must NEVER be called or instantiated in browser/client components.
 * - API keys must NEVER be logged or leaked into client bundles or console output.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Cached client singletons
let cachedBrowserClient: SupabaseClient | null = null;
let cachedServerClient: SupabaseClient | null = null;

/**
 * Returns true if real Supabase environment variables are configured.
 * Never logs keys or secrets.
 */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || (!serviceKey && !anonKey)) return false;
  if (url.includes("your-project.supabase.co")) return false;
  if (serviceKey && serviceKey.includes("your_supabase_service_role_key")) return false;
  if (anonKey && anonKey.includes("your_supabase_anon_key")) return false;

  return true;
}

/**
 * Browser-safe Supabase client using public anon key.
 * Can be safely called in browser components.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (cachedBrowserClient) {
    return cachedBrowserClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase browser client error: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing."
    );
  }

  cachedBrowserClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });

  return cachedBrowserClient;
}

/**
 * Server-only Supabase client using SUPABASE_SERVICE_ROLE_KEY.
 * Bypasses Row Level Security (RLS) for server-side processing & DB operations.
 * Throws immediately if invoked in a browser environment.
 */
export function getSupabaseServerClient(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error(
      "Security Error: getSupabaseServerClient() cannot be called in a client/browser environment. Service role key is server-only."
    );
  }

  if (cachedServerClient) {
    return cachedServerClient;
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase server client error: SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing."
    );
  }

  cachedServerClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedServerClient;
}

/**
 * Convenient handles for browser and server clients
 */
export const supabaseBrowser = {
  get client(): SupabaseClient {
    return getSupabaseBrowserClient();
  },
};

export const supabaseServer = {
  get client(): SupabaseClient {
    return getSupabaseServerClient();
  },
};
