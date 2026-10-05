import { NextRequest, NextResponse } from "next/server";
import { createMeeting, listMeetings } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const title = body?.title?.trim() || "Untitled Meeting";
    const meeting = await createMeeting({ title });
    return NextResponse.json({ id: meeting.id, code: meeting.code });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create meeting" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const meetings = await listMeetings();
    return NextResponse.json(
      meetings.map((m) => ({
        id: m.id,
        code: m.code,
        title: m.title,
        status: m.status,
        started_at: m.started_at,
      }))
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list meetings" },
      { status: 500 }
    );
  }
}
