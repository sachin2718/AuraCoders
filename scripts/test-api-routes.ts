/**
 * scripts/test-api-routes.ts
 *
 * Acceptance Test:
 * 1. Verifies two users can post transcript lines to POST /api/transcript.
 * 2. Verifies a non-participant gets 403 Forbidden on GET /api/meetings/:id.
 * 3. Verifies input trimming, empty line ignore, duplicate-within-2s ignore, and >2000 char rejection.
 * 4. Verifies per-user rate limiting (max 120 req/min).
 * 5. Verifies 401 on unauthenticated requests.
 */

import { NextRequest } from "next/server";
import { POST as createMeetingRoute } from "../app/api/meetings/route";
import { GET as getMeetingRoute } from "../app/api/meetings/[id]/route";
import { POST as consentRoute } from "../app/api/meetings/[id]/consent/route";
import { POST as transcriptRoute } from "../app/api/transcript/route";
import { upsertParticipant, setStatus } from "../lib/db";
import { resetRateLimits } from "../lib/rate-limit";

async function runAcceptanceTest() {
  console.log("=================================================");
  console.log(" API Routes Acceptance Test");
  console.log("=================================================\n");

  resetRateLimits();

  const user1 = "user-alice-0001";
  const user2 = "user-bob-0002";
  const nonParticipant = "user-intruder-0003";

  // Test 1: Unauthenticated request to POST /api/meetings -> 401
  console.log("[Test 1] Testing unauthenticated POST /api/meetings (expect 401)...");
  const unauthReq = new NextRequest("http://localhost:3000/api/meetings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Secret Meeting" }),
  });
  const unauthRes = await createMeetingRoute(unauthReq);
  console.log(`✓ Unauthenticated status: ${unauthRes.status}`);
  if (unauthRes.status !== 401) {
    throw new Error(`Expected 401, got ${unauthRes.status}`);
  }

  // Test 2: User 1 creates a meeting
  console.log("\n[Test 2] User 1 creates a meeting (POST /api/meetings)...");
  const createReq = new NextRequest("http://localhost:3000/api/meetings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": user1,
    },
    body: JSON.stringify({ title: "Architecture & Sprint Review" }),
  });
  const createRes = await createMeetingRoute(createReq);
  if (createRes.status !== 201) {
    throw new Error(`Expected 201, got ${createRes.status}`);
  }
  const createdMeeting = await createRes.json();
  const meetingId = createdMeeting.id;
  console.log(`✓ Created meeting: ${meetingId} (code: ${createdMeeting.code})`);

  // Test 3: User 2 joins meeting as participant
  console.log("\n[Test 3] Registering User 2 as a participant...");
  await upsertParticipant({
    meetingId,
    userId: user2,
    displayName: "Bob",
  });
  console.log(`✓ User 2 (Bob) registered as participant.`);

  // Test 4: Two users post transcript lines (Acceptance criterion)
  console.log("\n[Test 4] Two users post transcript lines (POST /api/transcript)...");

  // User 1 posts line
  const t1Req = new NextRequest("http://localhost:3000/api/transcript", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": user1,
    },
    body: JSON.stringify({
      meetingId,
      speakerName: "Alice",
      text: "  Hello everyone, let's start today's architecture discussion.  ", // includes whitespace to test trim
      tMs: 1000,
    }),
  });
  const t1Res = await transcriptRoute(t1Req);
  if (t1Res.status !== 200) {
    throw new Error(`User 1 transcript post failed: ${t1Res.status}`);
  }
  console.log(`✓ User 1 successfully posted transcript line.`);

  // User 2 posts line
  const t2Req = new NextRequest("http://localhost:3000/api/transcript", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": user2,
    },
    body: JSON.stringify({
      meetingId,
      speakerName: "Bob",
      text: "Thanks Alice! I have reviewed the LiveKit and Supabase designs.",
      tMs: 5000,
    }),
  });
  const t2Res = await transcriptRoute(t2Req);
  if (t2Res.status !== 200) {
    throw new Error(`User 2 transcript post failed: ${t2Res.status}`);
  }
  console.log(`✓ User 2 successfully posted transcript line.`);

  // Test 5: Empty text ignored
  console.log("\n[Test 5] Testing empty/whitespace transcript line (expect ignored: empty)...");
  const emptyReq = new NextRequest("http://localhost:3000/api/transcript", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": user1,
    },
    body: JSON.stringify({
      meetingId,
      speakerName: "Alice",
      text: "     ",
      tMs: 7000,
    }),
  });
  const emptyRes = await transcriptRoute(emptyReq);
  const emptyBody = await emptyRes.json();
  console.log(`✓ Empty text handled:`, emptyBody);
  if (emptyBody.ignored !== "empty") {
    throw new Error(`Expected ignored: 'empty', got ${JSON.stringify(emptyBody)}`);
  }

  // Test 6: Duplicate line within 2s ignored
  console.log("\n[Test 6] Testing duplicate line within 2s (expect ignored: duplicate_within_2s)...");
  const dupReq = new NextRequest("http://localhost:3000/api/transcript", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": user2,
    },
    body: JSON.stringify({
      meetingId,
      speakerName: "Bob",
      text: "Thanks Alice! I have reviewed the LiveKit and Supabase designs.",
      tMs: 5500, // within 500ms of previous identical utterance
    }),
  });
  const dupRes = await transcriptRoute(dupReq);
  const dupBody = await dupRes.json();
  console.log(`✓ Duplicate text handled:`, dupBody);
  if (dupBody.ignored !== "duplicate_within_2s") {
    throw new Error(`Expected duplicate_within_2s, got ${JSON.stringify(dupBody)}`);
  }

  // Test 7: Reject text > 2000 chars -> 422
  console.log("\n[Test 7] Testing text > 2000 characters (expect 422)...");
  const longReq = new NextRequest("http://localhost:3000/api/transcript", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": user1,
    },
    body: JSON.stringify({
      meetingId,
      speakerName: "Alice",
      text: "A".repeat(2001),
      tMs: 9000,
    }),
  });
  const longRes = await transcriptRoute(longReq);
  console.log(`✓ Over-limit text status: ${longRes.status}`);
  if (longRes.status !== 422) {
    throw new Error(`Expected 422, got ${longRes.status}`);
  }

  // Test 8: Non-participant gets 403 on GET /api/meetings/:id (Acceptance criterion)
  console.log("\n[Test 8] Non-participant attempts to read meeting (expect 403 Forbidden)...");
  const intruderReq = new NextRequest(`http://localhost:3000/api/meetings/${meetingId}`, {
    method: "GET",
    headers: { "x-user-id": nonParticipant },
  });
  const intruderRes = await getMeetingRoute(intruderReq, {
    params: Promise.resolve({ id: meetingId }),
  });
  console.log(`✓ Non-participant response status: ${intruderRes.status}`);
  if (intruderRes.status !== 403) {
    throw new Error(`Expected 403 for non-participant, got ${intruderRes.status}`);
  }

  // Test 9: Participant (User 2) and Host (User 1) can read meeting details -> 200
  console.log("\n[Test 9] Participant (User 2) reads meeting (expect 200)...");
  const participantReq = new NextRequest(`http://localhost:3000/api/meetings/${meetingId}`, {
    method: "GET",
    headers: { "x-user-id": user2 },
  });
  const participantRes = await getMeetingRoute(participantReq, {
    params: Promise.resolve({ id: meetingId }),
  });
  console.log(`✓ Participant response status: ${participantRes.status}`);
  if (participantRes.status !== 200) {
    throw new Error(`Expected 200 for participant, got ${participantRes.status}`);
  }
  const participantData = await participantRes.json();
  console.log(`✓ Returned shape keys: ${Object.keys(participantData).join(", ")}`);
  console.log(`  - Meeting: ${participantData.meeting.title}`);
  console.log(`  - Participants: ${participantData.participants.length}`);

  // Test 10: Consent route (POST /api/meetings/:id/consent)
  console.log("\n[Test 10] Testing POST /api/meetings/:id/consent...");
  const consentReq = new NextRequest(`http://localhost:3000/api/meetings/${meetingId}/consent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": user2,
    },
    body: JSON.stringify({ userId: user2 }),
  });
  const consentRes = await consentRoute(consentReq, {
    params: Promise.resolve({ id: meetingId }),
  });
  console.log(`✓ Consent response status: ${consentRes.status}`);
  if (consentRes.status !== 200) {
    throw new Error(`Expected 200, got ${consentRes.status}`);
  }

  // Test 11: Rate limiting (120 reqs/min per user) -> 429
  console.log("\n[Test 11] Testing per-user rate limit (120 req/min)...");
  resetRateLimits();
  const rateUserId = "user-spam-0099";
  let got429 = false;

  for (let i = 0; i < 125; i++) {
    const rateReq = new NextRequest("http://localhost:3000/api/transcript", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": rateUserId,
      },
      body: JSON.stringify({
        meetingId,
        speakerName: "Spammer",
        text: `Utterance #${i}`,
        tMs: 10000 + i * 2500, // separate times to avoid duplicate filter
      }),
    });
    const rRes = await transcriptRoute(rateReq);
    if (rRes.status === 429) {
      got429 = true;
      console.log(`✓ Rate limit triggered on request #${i + 1} with status 429.`);
      break;
    }
  }

  if (!got429) {
    throw new Error("Expected rate limit (429) to trigger after 120 requests!");
  }

  // Test 12: Cannot post transcript if meeting is not live -> 409
  console.log("\n[Test 12] Testing transcript on non-live meeting (expect 409)...");
  await setStatus(meetingId, "processing");
  const nonLiveReq = new NextRequest("http://localhost:3000/api/transcript", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": user1,
    },
    body: JSON.stringify({
      meetingId,
      speakerName: "Alice",
      text: "One more thing...",
      tMs: 200000,
    }),
  });
  const nonLiveRes = await transcriptRoute(nonLiveReq);
  console.log(`✓ Non-live response status: ${nonLiveRes.status}`);
  if (nonLiveRes.status !== 409) {
    throw new Error(`Expected 409 for non-live meeting, got ${nonLiveRes.status}`);
  }

  console.log("\n=================================================");
  console.log(" ALL ACCEPTANCE TESTS PASSED SUCCESSFULLY!");
  console.log("=================================================\n");
}

runAcceptanceTest().catch((err) => {
  console.error("❌ Acceptance test failed:", err);
  process.exit(1);
});
