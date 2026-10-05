/**
 * lib/auth.ts
 *
 * Centralized authentication and mock-mode handling for MeetMate API routes.
 *
 * BEHAVIOUR:
 * - Supports real Supabase Auth (Bearer JWT or SSR auth cookies).
 * - Honors MOCK_MODE environment variable switch (MOCK_MODE=true).
 * - Allows seamless local development/test headers (x-user-id) when unauthenticated or in mock mode.
 * - Never logs keys or secret tokens.
 */

import { NextRequest } from "next/server";
import { createServerClient, getSupabaseServerClient, isSupabaseConfigured } from "./supabase";

export interface AuthUser {
  id: string;
  email?: string;
}

/**
 * Returns true if mock mode is explicitly forced or Supabase is not configured.
 */
export function isMockMode(): boolean {
  if (
    process.env.MOCK_MODE === "true" ||
    process.env.NEXT_PUBLIC_MOCK_MODE === "true" ||
    process.env.NEXT_PUBLIC_MOCK === "true"
  ) {
    return true;
  }
  return !isSupabaseConfigured();
}

/**
 * Extracts and verifies the authenticated user from the incoming NextRequest.
 * Returns AuthUser if valid, or null if unauthenticated.
 */
export async function getAuthUser(req: NextRequest): Promise<AuthUser | null> {
  // Check demo user cookie first
  const demoCookie = req.cookies.get("meetmate_demo_user")?.value;
  if (demoCookie) {
    try {
      const parsed = JSON.parse(decodeURIComponent(demoCookie));
      if (parsed?.id) {
        return {
          id: parsed.id,
          email: parsed.email,
        };
      }
    } catch {}
  }

  const authHeader = req.headers.get("authorization");
  let bearerToken: string | null = null;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    bearerToken = authHeader.substring(7).trim();
  }

  // Check auth cookies if no bearer token
  if (!bearerToken) {
    const cookieToken =
      req.cookies.get("sb-access-token")?.value ||
      req.cookies.get("supabase-auth-token")?.value;
    if (cookieToken) {
      bearerToken = cookieToken;
    }
  }

  // 1. Verify against Supabase Auth if not in mock mode and Supabase is configured
  if (!isMockMode() && bearerToken && isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseServerClient();
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(bearerToken);

      if (!error && user?.id) {
        return {
          id: user.id,
          email: user.email,
        };
      }
    } catch {
      // Fall through to dev/mock check
    }
  }

  // Supabase SSR stores refreshed sessions in project-scoped, sometimes chunked
  // cookies. Let the SSR client decode those instead of guessing cookie names.
  if (!isMockMode() && isSupabaseConfigured()) {
    try {
      const supabase = await createServerClient();
      const { data: { user }, error } = await supabase.auth.getUser();
      if (!error && user?.id) return { id: user.id, email: user.email };
    } catch {
      // Continue to the development/mock identity checks below.
    }
  }

  // 2. Dev & Mock mode support: accept bearer token directly as user ID if not empty
  if (isMockMode() && bearerToken) {
    return { id: bearerToken };
  }

  // 3. Dev / Test header (x-user-id)
  const devUserId = req.headers.get("x-user-id") || req.headers.get("x-mock-user-id");
  if (devUserId) {
    return { id: devUserId.trim() };
  }

  return null;
}
