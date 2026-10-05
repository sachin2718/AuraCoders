import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AccessToken } from "livekit-server-sdk";
import { getAuthUser, isMockMode } from "@/lib/auth";
import { createMeeting, getMeetingByCode, upsertParticipant } from "@/lib/db";

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
      // Guest participants joining via shared meeting link
      const stableId = deriveStableIdentity(displayName, code, clientId);
      user = { id: stableId, email: "guest@meetmate.dev" };
    }

    let meeting = await getMeetingByCode(code);
    if (!meeting) {
      meeting = await createMeeting({
        title: `Meeting ${code.toUpperCase()}`,
        hostId: user.id,
      });
      meeting.code = code.toUpperCase();
    }

    let apiKey = process.env.LIVEKIT_API_KEY || "API3Wz5XabBNuKJ";
    if (!apiKey || apiKey.startsWith("devkey") || apiKey === "your-key") {
      apiKey = "API3Wz5XabBNuKJ";
    }

    let apiSecret = process.env.LIVEKIT_API_SECRET || "kcak09c7Ak6TbFZYolneoKPeSsfhLMrP8ZetGLgdnHXD";
    if (!apiSecret || apiSecret.startsWith("secret") || apiSecret === "your-secret") {
      apiSecret = "kcak09c7Ak6TbFZYolneoKPeSsfhLMrP8ZetGLgdnHXD";
    }

    let livekitUrl =
      process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL || "wss://auracoders-v1dllqxl.livekit.cloud";
    if (livekitUrl.includes("meetmate-demo") || livekitUrl.includes("your-project") || !livekitUrl.startsWith("wss://")) {
      livekitUrl = "wss://auracoders-v1dllqxl.livekit.cloud";
    }

    const normalizedRoom = code.trim().toUpperCase();

    const at = new AccessToken(apiKey, apiSecret, {
      identity: user.id,
      name: displayName,
      ttl: "4h",
    });

    at.addGrant({
      roomJoin: true,
      room: normalizedRoom,
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
