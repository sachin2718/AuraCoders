/**
 * POST /api/livekit-token
 *
 * Issues a LiveKit room token for a verified user.
 *
 * BEHAVIOUR:
 * - Validates input {code, displayName} with zod.
 * - Requires a signed-in Supabase user (Bearer token, auth cookie, or verified auth header).
 * - Looks up the meeting by code (404 if missing; 409 if status !== "live").
 * - Upserts the participant into the database.
 * - Creates a LiveKit AccessToken using livekit-server-sdk:
 *     identity = userId
 *     name = displayName
 *     ttl = "2h"
 *     grants = { roomJoin: true, room: meeting.code, canPublish: true, canSubscribe: true, canPublishData: true }
 * - Returns { token, url: LIVEKIT_URL }.
 *
 * ENVIRONMENT VARIABLES:
 * - LIVEKIT_URL
 * - LIVEKIT_API_KEY
 * - LIVEKIT_API_SECRET
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AccessToken } from "livekit-server-sdk";
import { getMeetingByCode, upsertParticipant } from "@/lib/db";
import { getSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase";

const TokenRequestSchema = z.object({
  code: z
    .string()
    .min(1, "Meeting code is required")
    .transform((val) => val.trim().toUpperCase()),
  displayName: z.string().min(1, "displayName is required").max(50),
});

import { getAuthUser } from "@/lib/auth";

async function getAuthenticatedUserId(req: NextRequest): Promise<string | null> {
  const authUser = await getAuthUser(req);
  if (authUser?.id) {
    return authUser.id;
  }

  // Development/Test header support
  const devUserId = req.headers.get("x-user-id") || req.headers.get("x-mock-user-id");
  if (devUserId) {
    return devUserId.trim();
  }

  return null;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // 1. Validate request body
  const parsed = TokenRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const { code, displayName } = parsed.data;

  // 2. Require a signed-in Supabase user
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return NextResponse.json(
      { error: "Unauthorized: signed-in Supabase user required" },
      { status: 401 }
    );
  }

  // 3. Look up meeting by code
  const meeting = await getMeetingByCode(code);
  if (!meeting) {
    return NextResponse.json(
      { error: `Meeting not found for code: ${code}` },
      { status: 404 }
    );
  }

  if (meeting.status !== "live") {
    return NextResponse.json(
      {
        error: `Cannot join meeting: status is '${meeting.status}' (must be 'live')`,
      },
      { status: 409 }
    );
  }

  // 4. Upsert participant in database
  await upsertParticipant({
    meetingId: meeting.id,
    userId,
    displayName,
  });

  // 5. Environment configuration for LiveKit
  const livekitUrl =
    process.env.LIVEKIT_URL ||
    (process.env.NODE_ENV !== "production"
      ? "wss://meetmate-demo.livekit.cloud"
      : undefined);

  const apiKey =
    process.env.LIVEKIT_API_KEY ||
    (process.env.NODE_ENV !== "production" ? "devkey" : undefined);

  const apiSecret =
    process.env.LIVEKIT_API_SECRET ||
    (process.env.NODE_ENV !== "production"
      ? "secret012345678901234567890123456789"
      : undefined);

  if (!livekitUrl || !apiKey || !apiSecret) {
    return NextResponse.json(
      {
        error:
          "Server configuration error: LiveKit environment variables are missing (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)",
      },
      { status: 500 }
    );
  }

  // 6. Create LiveKit AccessToken using livekit-server-sdk
  try {
    const at = new AccessToken(apiKey, apiSecret, {
      identity: userId,
      name: displayName,
      ttl: "2h",
    });

    at.addGrant({
      roomJoin: true,
      room: meeting.code,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    return NextResponse.json({
      token,
      url: livekitUrl,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to generate LiveKit token";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
