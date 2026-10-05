/**
 * lib/supabase.ts
 * Exports two helpers:
 *  - createBrowserClient()  → use in Client Components / browser hooks
 *  - createServerClient()   → use in Server Components, Route Handlers, middleware
 *
 * IMPORTANT: next/headers is imported lazily inside createServerClient so that
 * this file is safe to import from Client Components (createBrowserClient only).
 */

import { createBrowserClient as _browser } from "@supabase/ssr";
import {
  createServerClient as _server,
  type CookieOptions,
} from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ── Browser client (singleton-safe; call inside 'use client' components) ─────
export function createBrowserClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    // Return a no-op stub so the login page renders even without .env.local.
    // Every auth call will reject with a clear console message.
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
    console.warn(
      "[MeetMate] Supabase env vars not set. Copy .env.local.example → .env.local"
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return stub as any;
  }
  return _browser(SUPABASE_URL, SUPABASE_ANON);
}

// ── Server client (call inside Server Components / Route Handlers) ────────────
// next/headers is imported here (not at module top-level) so the client bundle
// never tries to resolve it.
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
