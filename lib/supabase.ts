/**
 * lib/supabase.ts
 * Supabase client configurations:
 * - Browser client: uses NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
 * - Server client: uses SUPABASE_SERVICE_ROLE_KEY (never exposed to browser bundles)
 *
 * Exports helpers:
 * - createBrowserClient() for Client Components
 * - createServerClient() for Server Components / Route Handlers
 * - getSupabaseServerClient() for service-role server operations
 */

import { createBrowserClient as _browser } from "@supabase/ssr";
import {
  createServerClient as _server,
  type CookieOptions,
} from "@supabase/ssr";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let cachedBrowserClient: SupabaseClient | null = null;
let cachedServerClient: SupabaseClient | null = null;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Returns true if real Supabase environment variables are configured.
 * Never logs keys or secrets.
 */
export function isSupabaseConfigured(): boolean {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || (!serviceKey && !SUPABASE_ANON)) return false;
  if (SUPABASE_URL.includes("your-project.supabase.co")) return false;
  if (serviceKey && serviceKey.includes("your_supabase_service_role_key")) return false;
  if (SUPABASE_ANON && SUPABASE_ANON.includes("your_supabase_anon_key")) return false;

  return true;
}

/**
 * Browser-safe Supabase client using public anon key.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (cachedBrowserClient) {
    return cachedBrowserClient;
  }

  if (!SUPABASE_URL || !SUPABASE_ANON) {
    throw new Error(
      "Supabase browser client error: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing."
    );
  }

  cachedBrowserClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
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

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !serviceRoleKey) {
    throw new Error(
      "Supabase server client error: SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing."
    );
  }

  cachedServerClient = createClient(SUPABASE_URL, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedServerClient;
}

export function createBrowserClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    const stub = {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signInWithOtp: async () => ({ error: new Error("Supabase not configured — add .env.local") }),
        signInWithPassword: async () => ({ error: new Error("Supabase not configured — add .env.local") }),
        signUp: async () => ({ error: new Error("Supabase not configured — add .env.local") }),
        signOut: async () => {},
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return stub as any;
  }

  return _browser(SUPABASE_URL, SUPABASE_ANON);
}

export async function createServerClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    return {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
        getSession: async () => ({ data: { session: null }, error: null }),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();

  return _server(SUPABASE_URL, SUPABASE_ANON, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // set() throws in Server Components — safe to ignore here;
          // middleware handles the actual cookie write.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: "", ...options });
        } catch {
          // same as above
        }
      },
    },
  });
}

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
