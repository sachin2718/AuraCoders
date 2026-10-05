import { NextRequest, NextResponse } from "next/server";
import { getMeetingDetail } from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id: meetingId } = await params;
    if (!meetingId) {
      return NextResponse.json({ error: "Missing meeting ID" }, { status: 400 });
    }

    const detail = await getMeetingDetail(meetingId);
    if (!detail) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch meeting" },
      { status: 500 }
    );
  }
}
