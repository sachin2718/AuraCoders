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
  if (process.env.NEXT_PUBLIC_MOCK === "true") return false;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || (!serviceKey && !SUPABASE_ANON)) return false;
  if (SUPABASE_URL.includes("your-project.supabase.co")) return false;
  if (SUPABASE_URL.includes("placeholder")) return false;
  if (serviceKey && serviceKey.includes("your_supabase_service_role_key")) return false;
  if (SUPABASE_ANON && SUPABASE_ANON.includes("your_supabase_anon_key")) return false;
  if (SUPABASE_ANON && SUPABASE_ANON.includes("placeholder")) return false;

  return true;
}

export interface DemoUser {
  id: string;
  email: string;
  user_metadata: {
    display_name: string;
    full_name: string;
    avatar_url?: string;
  };
}

export const DEMO_USERS: Record<string, DemoUser> = {
  priya: {
    id: "user-priya-01",
    email: "priya@meetmate.ai",
    user_metadata: {
      display_name: "Priya Sharma",
      full_name: "Priya Sharma",
    },
  },
  arjun: {
    id: "user-arjun-02",
    email: "arjun@meetmate.ai",
    user_metadata: {
      display_name: "Arjun Mehta",
      full_name: "Arjun Mehta",
    },
  },
  meera: {
    id: "user-meera-03",
    email: "meera@meetmate.ai",
    user_metadata: {
      display_name: "Meera Patel",
      full_name: "Meera Patel",
    },
  },
  sam: {
    id: "user-sam-04",
    email: "sam@meetmate.ai",
    user_metadata: {
      display_name: "Sam Wilson",
      full_name: "Sam Wilson",
    },
  },
};

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

let cachedStubClient: any = null;

export function createBrowserClient() {
  if (!isSupabaseConfigured()) {
    if (cachedStubClient) {
      return cachedStubClient;
    }

    const getStoredUser = (): DemoUser | null => {
      if (typeof window === "undefined") return null;
      try {
        const match = document.cookie.match(/(?:^|;\s*)meetmate_demo_user=([^;]+)/);
        if (match) return JSON.parse(decodeURIComponent(match[1]));
        const ls = localStorage.getItem("meetmate_demo_user");
        if (ls) return JSON.parse(ls);
      } catch {}
      return null;
    };

    const saveUser = (u: DemoUser) => {
      if (typeof window !== "undefined") {
        document.cookie = `meetmate_demo_user=${encodeURIComponent(JSON.stringify(u))}; path=/; max-age=2592000; SameSite=Lax`;
        try {
          localStorage.setItem("meetmate_demo_user", JSON.stringify(u));
        } catch {}
      }
    };

    const clearUser = () => {
      if (typeof window !== "undefined") {
        document.cookie = "meetmate_demo_user=; path=/; max-age=0";
        try {
          localStorage.removeItem("meetmate_demo_user");
        } catch {}
      }
    };

    const stub = {
      auth: {
        getUser: async () => ({ data: { user: getStoredUser() }, error: null }),
        getSession: async () => {
          const user = getStoredUser();
          return { data: { session: user ? { user, access_token: "demo-token" } : null }, error: null };
        },
        onAuthStateChange: (callback: (event: string, session: { user?: DemoUser | null } | null) => void) => {
          const user = getStoredUser();
          if (user) {
            setTimeout(() => callback("SIGNED_IN", { user }), 0);
          }
          return { data: { subscription: { unsubscribe: () => {} } } };
        },
        signInWithOtp: async ({ email }: { email: string }) => {
          const prefix = (email || "demo").split("@")[0].toLowerCase();
          const matched = DEMO_USERS[prefix] || {
            id: `user-${prefix || "demo"}`,
            email: email || "demo@meetmate.ai",
            user_metadata: {
              display_name: (email || "demo").split("@")[0] || "Demo User",
              full_name: (email || "demo").split("@")[0] || "Demo User",
            },
          };
          saveUser(matched);
          return { data: { user: matched }, error: null };
        },
        signInWithPassword: async ({ email }: { email: string }) => {
          const prefix = (email || "demo").split("@")[0].toLowerCase();
          const matched = DEMO_USERS[prefix] || {
            id: `user-${prefix || "demo"}`,
            email: email || "demo@meetmate.ai",
            user_metadata: {
              display_name: (email || "demo").split("@")[0] || "Demo User",
              full_name: (email || "demo").split("@")[0] || "Demo User",
            },
          };
          saveUser(matched);
          return { data: { user: matched }, error: null };
        },
        signUp: async ({ email }: { email: string }) => {
          const prefix = (email || "demo").split("@")[0].toLowerCase();
          const matched = {
            id: `user-${prefix || "demo"}`,
            email: email || "demo@meetmate.ai",
            user_metadata: {
              display_name: (email || "demo").split("@")[0] || "Demo User",
              full_name: (email || "demo").split("@")[0] || "Demo User",
            },
          };
          saveUser(matched);
          return { data: { user: matched }, error: null };
        },
        signOut: async () => {
          clearUser();
          return { error: null };
        },
      },
    };
    cachedStubClient = stub;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return cachedStubClient as any;
  }

  if (cachedBrowserClient) return cachedBrowserClient;
  cachedBrowserClient = _browser(SUPABASE_URL, SUPABASE_ANON!);
  return cachedBrowserClient;
}

export async function createServerClient() {
  if (!isSupabaseConfigured()) {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const demoCookie = cookieStore.get("meetmate_demo_user")?.value;
    let storedUser: DemoUser | null = null;
    if (demoCookie) {
      try {
        storedUser = JSON.parse(decodeURIComponent(demoCookie));
      } catch {}
    }

    return {
      auth: {
        getUser: async () => ({ data: { user: storedUser }, error: null }),
        getSession: async () => ({
          data: { session: storedUser ? { user: storedUser, access_token: "demo-token" } : null },
          error: null,
        }),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();

  return _server(SUPABASE_URL, SUPABASE_ANON!, {
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
