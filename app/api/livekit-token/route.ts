import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AccessToken } from "livekit-server-sdk";
import { getAuthUser, isMockMode } from "@/lib/auth";
import { getMeetingByCode, upsertParticipant } from "@/lib/db";

const TokenRequestSchema = z.object({
  code: z.string().trim().min(1).max(100),
  displayName: z.string().trim().min(1).max(100),
  // Optional stable client ID so the same browser tab always gets the same identity
  clientId: z.string().trim().max(128).optional(),
});

/**
 * Derives a stable, deterministic user identity from displayName + room code.
 * This ensures the same participant is recognised consistently across reconnects
 * and across server restarts, without needing Supabase auth.
 */
function deriveStableIdentity(displayName: string, code: string, extra?: string): string {
  const base = `${displayName.toLowerCase().replace(/\s+/g, "-")}-${code.toLowerCase()}`;
  if (extra) return `${base}-${extra.substring(0, 8)}`;
  return base;
}

export async function POST(req: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = TokenRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.issues },
        { status: 422 },
      );
    }
    const { code, displayName, clientId } = parsed.data;

    // Determine user identity
    let user = await getAuthUser(req);
    if (!user) {
      if (isMockMode() || process.env.NODE_ENV !== "production") {
        // Use stable identity based on display name + room code so same person
        // is recognized across reconnects. clientId (from localStorage) makes
        // it unique when the same name is used by two different people.
        const stableId = deriveStableIdentity(displayName, code, clientId);
        user = { id: stableId, email: "guest@meetmate.dev" };
      } else {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const meeting = await getMeetingByCode(code);
    if (!meeting && !isMockMode() && process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }
    if (meeting && meeting.status !== "live" && process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Meeting is not live" }, { status: 409 });
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekitUrl =
      process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL;

    // Local development can use a token generated from the same LiveKit
    // project without exposing the server secret. Production always requires
    // LIVEKIT_API_KEY and LIVEKIT_API_SECRET so tokens are signed server-side.
    const developmentToken = process.env.NEXT_PUBLIC_DEV_LIVEKIT_TOKEN?.trim();
    if (
      process.env.NODE_ENV !== "production" &&
      developmentToken &&
      livekitUrl &&
      !developmentToken.startsWith("mock-")
    ) {
      return NextResponse.json({ token: developmentToken, url: livekitUrl });
    }

    if (!apiKey || !apiSecret || !livekitUrl) {
      if (isMockMode() || process.env.NODE_ENV !== "production") {
        return NextResponse.json({
          token: "mock-jwt-token-livekit-meetmate-dev",
          url: "wss://meetmate-demo.livekit.cloud",
        });
      }
      return NextResponse.json(
        {
          error:
            "LiveKit is not configured. Set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_URL (or NEXT_PUBLIC_LIVEKIT_URL) in your environment or .env.local file.",
        },
        { status: 500 }
      );
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity: user.id,
      name: displayName,
      ttl: "2h",
    });

    at.addGrant({
      roomJoin: true,
      room: code,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    if (meeting) {
      await upsertParticipant({
        meetingId: meeting.id,
        userId: user.id,
        displayName,
      });
    }

    return NextResponse.json({
      token,
      url: livekitUrl,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate LiveKit token.",
      },
      { status: 500 }
    );
  }
}
