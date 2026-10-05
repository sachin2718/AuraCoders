/**
 * POST /api/meetings  — create a new meeting
 * GET  /api/meetings  — list meetings for the authenticated user
 *
 * RULES:
 * - Requires a signed-in user.
 * - Supports switchable MOCK_MODE environment variable.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser, isMockMode } from "@/lib/auth";
import {
  createMeeting,
  listMeetingsForUser,
  upsertParticipant,
} from "@/lib/db";
import { meetingsStore, newId, nowIso, type Meeting } from "@/lib/mock-data";

const CreateMeetingSchema = z.object({
  title: z.string().min(1, "title is required").max(200),
});

// ── POST /api/meetings ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Require signed-in user
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized: signed-in user required" },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateMeetingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const { title } = parsed.data;

  // Real or mock DB helper handles storage based on config/mode
  const meeting = await createMeeting({
    title,
    hostId: user.id,
  });

  // Automatically register creator as host participant
  await upsertParticipant({
    meetingId: meeting.id,
    userId: user.id,
    displayName: "Host",
  });

  // Also sync to legacy in-memory meetingsStore if in mock mode
  if (isMockMode()) {
    const legacyItem: Meeting = {
      id: meeting.id,
      code: meeting.code,
      title: meeting.title,
      host_id: meeting.host_id,
      status: meeting.status,
      started_at: meeting.started_at,
      ended_at: meeting.ended_at,
    };
    meetingsStore.push(legacyItem);
  }

  return NextResponse.json(
    { id: meeting.id, code: meeting.code },
    { status: 201 }
  );
}

// ── GET /api/meetings ────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // 1. Require signed-in user
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized: signed-in user required" },
      { status: 401 }
    );
  }

  // 2. Fetch meetings for authenticated user
  const userMeetings = await listMeetingsForUser(user.id);

  // If in mock mode and no user-specific meetings found yet, provide accessible mock fixtures
  if (isMockMode() && userMeetings.length === 0) {
    const fallbackList = meetingsStore.map(
      ({ id, code, title, status, started_at }) => ({
        id,
        code,
        title,
        status,
        started_at,
      })
    );
    return NextResponse.json(fallbackList);
  }

  const list = userMeetings.map(
    ({ id, code, title, status, started_at }) => ({
      id,
      code,
      title,
      status,
      started_at,
    })
  );

  return NextResponse.json(list);
}
