import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AccessToken } from "livekit-server-sdk";
import { getAuthUser, isMockMode } from "@/lib/auth";
import { getMeetingByCode, upsertParticipant } from "@/lib/db";

const TokenRequestSchema = z.object({
  code: z.string().trim().min(1).max(100),
  displayName: z.string().trim().min(1).max(100),
});

export async function POST(req: NextRequest) {
  try {
    let user = await getAuthUser(req);
    if (!user) {
      if (isMockMode() || process.env.NODE_ENV !== "production") {
        user = { id: `user-${Math.random().toString(36).substring(2, 9)}`, email: "demo@meetmate.dev" };
      } else {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

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
    const { code, displayName } = parsed.data;

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
