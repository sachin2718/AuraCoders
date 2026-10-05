/**
 * POST /api/meetings/:id/end — mark a meeting as processing (triggers AI pipeline)
 */

import { NextRequest, NextResponse } from "next/server";
import { meetingsStore, resetPollCounter, nowIso } from "@/lib/mock-data";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const meeting = meetingsStore.find((m) => m.id === id);
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  if (meeting.status !== "live") {
    return NextResponse.json(
      { error: `Cannot end a meeting with status '${meeting.status}'` },
      { status: 409 }
    );
  }

  // Update in-memory record
  meeting.status = "processing";
  meeting.ended_at = nowIso();

  // Reset poll counter so the client can observe processing → ready transition
  resetPollCounter(id);

  return NextResponse.json({ status: "processing" });
}
