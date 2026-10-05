/**
 * POST /api/meetings/:id/consent — record participant consent
 *
 * RULES:
 * - Requires a signed-in user.
 * - Supports switchable MOCK_MODE environment variable.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser, isMockMode } from "@/lib/auth";
import { getMeetingData, markConsent } from "@/lib/db";
import {
  meetingsStore,
  FIXTURE_PARTICIPANTS,
  nowIso,
} from "@/lib/mock-data";

const ConsentSchema = z.object({
  userId: z.string().min(1, "userId is required").optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // Body is optional if recording own consent
  }

  const parsed = ConsentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  // 1. Require signed-in user or dev fallback
  let user = await getAuthUser(req);
  if (!user) {
    if (isMockMode() || process.env.NODE_ENV !== "production") {
      user = { id: parsed.data?.userId || "user-priya-01", email: "demo@meetmate.dev" };
    } else {
      return NextResponse.json(
        { error: "Unauthorized: signed-in user required" },
        { status: 401 }
      );
    }
  }

  // Target user defaults to authenticated user
  const targetUserId = parsed.data?.userId || user.id;

  // 2. Check meeting existence
  const meetingData = await getMeetingData(id);
  const meetingExists =
    meetingData.meeting ||
    (isMockMode() && meetingsStore.some((m) => m.id === id));

  if (!meetingExists && !isMockMode() && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  // 3. Mark consent in DB
  await markConsent(id, targetUserId);

  // Sync with legacy mock fixture if in mock mode
  if (isMockMode()) {
    const fixtureP = FIXTURE_PARTICIPANTS.find(
      (p) => p.meeting_id === id && p.user_id === targetUserId
    );
    if (fixtureP) {
      fixtureP.consented_at = nowIso();
    }
  }

  return NextResponse.json({ ok: true });
}
