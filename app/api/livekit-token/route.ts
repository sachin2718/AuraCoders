import { NextRequest, NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, displayName } = body || {};

    if (!code || typeof code !== "string") {
      return NextResponse.json(
        { error: "Meeting code is required." },
        { status: 400 }
      );
    }

    if (!displayName || typeof displayName !== "string") {
      return NextResponse.json(
        { error: "Display name is required." },
        { status: 400 }
      );
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekitUrl =
      process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL;

    if (!apiKey || !apiSecret || !livekitUrl) {
      return NextResponse.json(
        {
          error:
            "LiveKit is not configured. Set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_URL (or NEXT_PUBLIC_LIVEKIT_URL) in your environment or .env.local file.",
        },
        { status: 500 }
      );
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity: displayName,
      name: displayName,
    });

    at.addGrant({
      roomJoin: true,
      room: code,
      canPublish: true,
      canSubscribe: true,
    });

    const token = await at.toJwt();

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
