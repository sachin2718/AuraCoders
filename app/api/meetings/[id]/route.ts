/**
 * GET /api/meetings/:id — full meeting detail
 *
 * RULES:
 * - Requires a signed-in user.
 * - Returns {meeting, participants, summary?, action_items?}
 * - Returns 403 unless the user is a participant or the host.
 * - Supports switchable MOCK_MODE environment variable.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, isMockMode } from "@/lib/auth";
import { getMeetingDetails } from "@/lib/db";
import {
  meetingsStore,
  FIXTURE_PARTICIPANTS,
  FIXTURE_SUMMARY,
  FIXTURE_ACTION_ITEMS,
  MEETING_ID,
  getMeetingStatus,
} from "@/lib/mock-data";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Require signed-in user
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized: signed-in user required" },
      { status: 401 }
    );
  }

  const { id } = await params;

  // 2. Fetch meeting details from DB (works in real Supabase or in-memory DB)
  const details = await getMeetingDetails(id);

  // If not found in DB, check legacy mock store in mock mode
  let meeting = details.meeting;
  let participants = details.participants;
  let summary = details.summary;
  let actionItems = details.action_items;

  if (!meeting && isMockMode()) {
    const legacyMeeting = meetingsStore.find((m) => m.id === id);
    if (legacyMeeting) {
      const polledStatus = getMeetingStatus(id);
      const effectiveStatus =
        legacyMeeting.status === "live" ? "live" : polledStatus;
      meeting = { ...legacyMeeting, status: effectiveStatus };
      participants = FIXTURE_PARTICIPANTS.filter((p) => p.meeting_id === id);
      if (effectiveStatus === "ready" && id === MEETING_ID) {
        summary = FIXTURE_SUMMARY;
        actionItems = FIXTURE_ACTION_ITEMS;
      }
    }
  }

  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  // 3. Authorization: 403 unless user is host or participant
  const isHost = meeting.host_id === user.id;
  const isParticipant = participants.some((p) => p.user_id === user.id);

  if (!isHost && !isParticipant) {
    return NextResponse.json(
      { error: "Forbidden: You are not a participant or host of this meeting" },
      { status: 403 }
    );
  }

  // 4. Return {meeting, participants, summary?, action_items?}
  const responsePayload: {
    meeting: typeof meeting;
    participants: typeof participants;
    summary?: typeof summary;
    action_items?: typeof actionItems;
  } = {
    meeting,
    participants,
  };

  if (summary) {
    responsePayload.summary = summary;
  }

  if (actionItems && actionItems.length > 0) {
    responsePayload.action_items = actionItems;
  }

  return NextResponse.json(responsePayload);
}
