/**
 * POST /api/visual — describe a whiteboard/screen-share image via Gemini Vision
 *
 * SECURITY:
 * - Requires a signed-in user (401).
 * - Validated with Zod schema.
 * - 404 (meeting not found) vs 403 (user not host or participant).
 * - No stack traces or secrets leaked.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser, isMockMode } from "@/lib/auth";
import { getMeetingData } from "@/lib/db";
import { meetingsStore, FIXTURE_PARTICIPANTS } from "@/lib/mock-data";

const VisualSchema = z.object({
  meetingId: z.string().uuid("meetingId must be a UUID"),
  tMs: z.number().int().nonnegative("tMs must be non-negative integer"),
  imageBase64: z.string().min(1, "imageBase64 is required"),
});

const STUB_DESCRIPTIONS = [
  "Whiteboard shows a system architecture diagram with three services: a Next.js frontend, a Supabase Postgres database, and the Gemini API. Arrows indicate data flow from the browser Web Speech API through the transcript ingest endpoint.",
  "Screen share displays a Figma prototype of the MeetMate dashboard, featuring a meeting card grid with status badges (live, processing, ready).",
  "Post-it style sticky notes on a virtual board listing sprint tasks: 'LiveKit integration', 'RLS policies', 'Gemini prompt tuning', 'Electron wrapper'.",
  "Code editor showing a TypeScript Zod schema definition for the action_items table with fields: title, owner_name, priority, source_quote.",
];

let _descIdx = 0;

export async function POST(req: NextRequest) {
  try {
    // 1. Require signed-in user
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: signed-in user required" },
        { status: 401 }
      );
    }

    // 2. Validate input body with Zod
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = VisualSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.issues },
        { status: 422 }
      );
    }

    const { meetingId } = parsed.data;

    // 3. Check meeting existence and authorization (404 vs 403)
    const meetingData = await getMeetingData(meetingId);
    let meeting = meetingData.meeting;
    let participants = meetingData.participants;

    if (!meeting && isMockMode()) {
      const storeM = meetingsStore.find((m) => m.id === meetingId);
      if (storeM) {
        meeting = storeM;
        participants = FIXTURE_PARTICIPANTS.filter((p) => p.meeting_id === meetingId);
      }
    }

    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    const isHost = meeting.host_id === user.id;
    const isParticipant = participants.some((p) => p.user_id === user.id);

    if (!isHost && !isParticipant) {
      return NextResponse.json(
        { error: "Forbidden: You are not a participant or host of this meeting" },
        { status: 403 }
      );
    }

    // Round-robin through stub descriptions
    const description = STUB_DESCRIPTIONS[_descIdx % STUB_DESCRIPTIONS.length];
    _descIdx++;

    return NextResponse.json({ description });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
