/**
 * POST /api/transcript — ingest transcript utterance
 *
 * RULES:
 * - Requires a signed-in user.
 * - Simple per-user rate limiting (max 120 requests/minute) in memory.
 * - Accepts {meetingId, speakerName, text, tMs}.
 * - Trims text.
 * - Ignores empty lines.
 * - Ignores duplicate-within-2s lines for the same speaker.
 * - Rejects text > 2000 chars (422).
 * - Only works while status = "live" (409 otherwise).
 * - Supports switchable MOCK_MODE environment variable.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser, isMockMode } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { getMeetingData, insertSegment } from "@/lib/db";
import { meetingsStore, transcriptStore, newId } from "@/lib/mock-data";

const TranscriptSchema = z.object({
  meetingId: z.string().uuid("meetingId must be a UUID"),
  speakerName: z.string().min(1, "speakerName is required").max(100),
  text: z.string().max(2000, "text must be at most 2000 characters"),
  tMs: z.number().int().nonnegative("tMs must be a non-negative integer"),
});

// Cache for detecting duplicate utterances within 2 seconds
interface RecentUtterance {
  text: string;
  tMs: number;
  timestamp: number;
}
const recentUtterances = new Map<string, RecentUtterance>();

export async function POST(req: NextRequest) {
  // 1. Require signed-in user
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized: signed-in user required" },
      { status: 401 }
    );
  }

  // 2. Per-user rate limiting: max 120 requests/minute
  const rateLimit = checkRateLimit(user.id, 120, 60000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Rate limit exceeded (max 120 requests per minute)",
        retryAfterMs: rateLimit.resetMs,
      },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // 3. Schema validation (rejects text > 2000 chars)
  const parsed = TranscriptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const { meetingId, speakerName, text: rawText, tMs } = parsed.data;

  // 4. Trim text
  const text = rawText.trim();

  // 5. Ignore empty text
  if (text.length === 0) {
    return NextResponse.json({ ok: true, ignored: "empty" });
  }

  // 6. Meeting lookup and status check (only works while status = "live")
  const meetingData = await getMeetingData(meetingId);
  let meeting = meetingData.meeting;

  if (!meeting && isMockMode()) {
    meeting = meetingsStore.find((m) => m.id === meetingId) || null;
  }

  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  if (meeting.status !== "live") {
    return NextResponse.json(
      {
        error: `Cannot post transcript: meeting status is '${meeting.status}' (must be 'live')`,
      },
      { status: 409 }
    );
  }

  // Check authorization: must be host or participant
  const isHost = meeting.host_id === user.id;
  const isParticipant = meetingData.participants.some((p) => p.user_id === user.id);
  if (!isHost && !isParticipant) {
    return NextResponse.json(
      { error: "Forbidden: You are not a participant or host of this meeting" },
      { status: 403 }
    );
  }

  // 7. Ignore duplicate lines within 2 seconds
  const dedupKey = `${meetingId}:${speakerName.toLowerCase()}`;
  const prev = recentUtterances.get(dedupKey);
  const now = Date.now();

  if (
    prev &&
    prev.text === text &&
    (Math.abs(tMs - prev.tMs) <= 2000 || now - prev.timestamp <= 2000)
  ) {
    return NextResponse.json({ ok: true, ignored: "duplicate_within_2s" });
  }

  recentUtterances.set(dedupKey, { text, tMs, timestamp: now });

  // 8. Ingest segment into DB
  await insertSegment({
    meetingId,
    speakerId: user.id,
    speakerName,
    text,
    tMs,
  });

  // Also sync to legacy mock transcript store if in mock mode
  if (isMockMode()) {
    transcriptStore.push({
      id: newId(),
      meeting_id: meetingId,
      speaker_id: user.id,
      speaker_name: speakerName,
      text,
      t_ms: tMs,
    });
  }

  return NextResponse.json({ ok: true });
}
