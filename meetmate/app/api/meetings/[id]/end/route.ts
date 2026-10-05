import { NextRequest, NextResponse } from "next/server";
import { processEndOfMeeting } from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id: meetingId } = await params;
    if (!meetingId) {
      return NextResponse.json({ error: "Missing meeting ID" }, { status: 400 });
    }

    void processEndOfMeeting(meetingId).catch((err) => {
      console.error(`[end-meeting] Error processing meeting ${meetingId}:`, err);
    });

    return NextResponse.json({ status: "processing" });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to end meeting" },
      { status: 500 }
    );
  }
}
