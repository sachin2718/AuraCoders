/**
 * POST /api/transcribe — server-side STT fallback for the Electron desktop app
 * Accepts multipart/form-data: {meetingId, speakerName, tMs, audio (binary)}
 * Stub: echoes back a canned transcript sentence without calling a real STT API.
 *
 * SECURITY:
 * - Requires a signed-in user (401).
 * - Input validated with Zod.
 * - Consistent 404 (meeting missing) vs 403 (user not participant/host).
 * - No stack traces or secrets leaked.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser, isMockMode } from "@/lib/auth";
import { getMeetingData } from "@/lib/db";
import { meetingsStore, FIXTURE_PARTICIPANTS } from "@/lib/mock-data";

const TranscribeFieldsSchema = z.object({
  meetingId: z.string().min(1, "meetingId is required"),
  speakerName: z.string().min(1, "speakerName is required").max(100),
  tMs: z.coerce.number().int().nonnegative("tMs must be a non-negative integer"),
});

const STUB_TRANSCRIPTIONS = [
  "This is a stub transcription from the server-side speech-to-text fallback.",
  "The Electron wrapper uses this endpoint when the Web Speech API is unavailable.",
  "Audio received and processed — stub returns canned text for now.",
  "Real implementation will call Gemini Audio or Whisper via the transcribe endpoint.",
];

let _idx = 0;

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

    // 2. Parse multipart form data
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json(
        { error: "Expected multipart/form-data" },
        { status: 400 }
      );
    }

    const meetingIdRaw = formData.get("meetingId");
    const speakerNameRaw = formData.get("speakerName");
    const tMsRaw = formData.get("tMs");
    const audio = formData.get("audio");

    const parsed = TranscribeFieldsSchema.safeParse({
      meetingId: meetingIdRaw,
      speakerName: speakerNameRaw,
      tMs: tMsRaw,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.issues },
        { status: 422 }
      );
    }

    if (!audio) {
      return NextResponse.json(
        { error: "Validation failed", issues: [{ path: ["audio"], message: "audio file is required" }] },
        { status: 422 }
      );
    }

    const { meetingId } = parsed.data;

    // 3. Lookup meeting (404 vs 403 consistency)
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

    const text = STUB_TRANSCRIPTIONS[_idx % STUB_TRANSCRIPTIONS.length];
    _idx++;

    return NextResponse.json({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
