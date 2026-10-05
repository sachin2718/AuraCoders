/**
 * POST /api/meetings/:id/load-sample — seed a meeting with demo fixture data
 * Demo-mode safety valve: lets hackathon judges see a finished meeting without
 * running a real call.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  meetingsStore,
  FIXTURE_SUMMARY,
  FIXTURE_ACTION_ITEMS,
  MEETING_ID,
} from "@/lib/mock-data";
import { z } from "zod";

const LoadSampleSchema = z.object({
  sampleId: z.string().min(1).default("default"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const meeting = meetingsStore.find((m) => m.id === id);
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // body is optional
  }

  const parsed = LoadSampleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  // Force the meeting into "ready" state with fixture data
  meeting.status = "ready";
  meeting.ended_at = new Date().toISOString();

  return NextResponse.json({
    ok: true,
    loaded: {
      meetingId: id,
      sampleId: parsed.data.sampleId,
      summary: id === MEETING_ID ? FIXTURE_SUMMARY : { tldr: "Sample summary loaded." },
      action_items_count:
        id === MEETING_ID ? FIXTURE_ACTION_ITEMS.length : 0,
    },
  });
}
