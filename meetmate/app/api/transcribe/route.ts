/**
 * POST /api/transcribe — server-side STT fallback for the Electron desktop app
 * Accepts multipart/form-data: {meetingId, speakerName, tMs, audio (binary)}
 * Stub: echoes back a canned transcript sentence without calling a real STT API.
 */

import { NextRequest, NextResponse } from "next/server";
import { meetingsStore } from "@/lib/mock-data";

const STUB_TRANSCRIPTIONS = [
  "This is a stub transcription from the server-side speech-to-text fallback.",
  "The Electron wrapper uses this endpoint when the Web Speech API is unavailable.",
  "Audio received and processed — stub returns canned text for now.",
  "Real implementation will call Gemini Audio or Whisper via the transcribe endpoint.",
];

let _idx = 0;

export async function POST(req: NextRequest) {
  // Parse multipart form data
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data" },
      { status: 400 }
    );
  }

  const meetingId = formData.get("meetingId");
  const speakerName = formData.get("speakerName");
  const tMs = formData.get("tMs");
  const audio = formData.get("audio");

  // Manual validation (Zod doesn't handle FormData natively)
  if (!meetingId || typeof meetingId !== "string") {
    return NextResponse.json({ error: "meetingId is required" }, { status: 422 });
  }
  if (!speakerName || typeof speakerName !== "string") {
    return NextResponse.json({ error: "speakerName is required" }, { status: 422 });
  }
  if (!tMs) {
    return NextResponse.json({ error: "tMs is required" }, { status: 422 });
  }
  if (!audio) {
    return NextResponse.json({ error: "audio file is required" }, { status: 422 });
  }

  const meeting = meetingsStore.find((m) => m.id === meetingId);
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  const text = STUB_TRANSCRIPTIONS[_idx % STUB_TRANSCRIPTIONS.length];
  _idx++;

  return NextResponse.json({ text });
}
