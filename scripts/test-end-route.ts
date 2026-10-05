/**
 * scripts/test-end-route.ts
 *
 * Acceptance Test Suite for POST /api/meetings/:id/end:
 * 1. 401 on unauthenticated request.
 * 2. 403 on non-host request.
 * 3. Ending a meeting with a stored transcript ends in status "ready" with rows in summaries and action_items.
 * 4. Action items correctly map owner_name to participant user_id.
 * 5. Idempotent: POST /end on a "ready" or "processing" meeting returns current status immediately.
 * 6. Killing the LLM key results in status "failed", not a hang.
 * 7. Retry: POST /end on a "failed" meeting reruns the pipeline to reach "ready".
 */

import { NextRequest } from "next/server";
import { POST as endMeetingRoute } from "../app/api/meetings/[id]/end/route";
import {
  createMeeting,
  upsertParticipant,
  insertSegments,
  getMeetingData,
  getMeetingDetails,
} from "../lib/db";

async function runTestSuite() {
  console.log("=================================================");
  console.log(" Acceptance Test: POST /api/meetings/:id/end");
  console.log("=================================================\n");

  const hostUser = "user-host-001";
  const guestUser = "user-guest-002";

  // Enable test pipeline mode so test runs predictably offline
  process.env.GEMINI_API_KEY = "test-mock-key";
  globalThis.fetch = async (input, init) => {
    if (String(input).includes("key=killed")) {
      return new Response(JSON.stringify({ error: { message: "Mock invalid key", code: 400 } }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const requestBody = JSON.parse(String(init?.body ?? "{}")) as {
      contents?: Array<{ parts?: Array<{ text?: string }> }>;
    };
    const prompt = requestBody.contents?.[0]?.parts?.[0]?.text ?? "";
    const result = prompt.includes("You extract action items")
      ? [
          {
            title: "Write the API design docs",
            owner_name: "Alice",
            due_date: "2026-10-09",
            priority: "medium",
            source_quote: "I'll write the design docs for the new API by Friday.",
            timestamp_ms: 5000,
          },
          {
            title: "Review the database migration scripts",
            owner_name: "Bob",
            due_date: null,
            priority: "medium",
            source_quote: "I will review the database migration scripts.",
            timestamp_ms: 12000,
          },
        ]
      : {
          tldr: "The team planned the API design work and database migration review.",
          key_points: ["Alice will prepare the API design documents.", "Bob will review the migration scripts."],
          decisions: ["The team agreed to complete an API design review."],
          open_questions: [],
        };

    return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  // ─── Test 1: Unauthenticated request -> 401 ──────────────────────────────
  console.log("[Test 1] Testing unauthenticated POST /api/meetings/:id/end (expect 401)...");
  const testMeeting = await createMeeting({
    title: "Sprint Retrospective",
    hostId: hostUser,
  });

  const unauthReq = new NextRequest(`http://localhost:3000/api/meetings/${testMeeting.id}/end`, {
    method: "POST",
  });
  const unauthRes = await endMeetingRoute(unauthReq, {
    params: Promise.resolve({ id: testMeeting.id }),
  });
  console.log(`✓ Unauthenticated response status: ${unauthRes.status}`);
  if (unauthRes.status !== 401) {
    throw new Error(`Expected 401, got ${unauthRes.status}`);
  }

  // ─── Test 2: Non-host request -> 403 ─────────────────────────────────────
  console.log("\n[Test 2] Testing non-host user attempting to end meeting (expect 403)...");
  await upsertParticipant({
    meetingId: testMeeting.id,
    userId: guestUser,
    displayName: "Bob",
  });

  const guestReq = new NextRequest(`http://localhost:3000/api/meetings/${testMeeting.id}/end`, {
    method: "POST",
    headers: { "x-user-id": guestUser },
  });
  const guestRes = await endMeetingRoute(guestReq, {
    params: Promise.resolve({ id: testMeeting.id }),
  });
  console.log(`✓ Non-host response status: ${guestRes.status}`);
  if (guestRes.status !== 403) {
    throw new Error(`Expected 403 for non-host, got ${guestRes.status}`);
  }

  // ─── Test 3: Stored transcript -> status ready, summaries & action_items ─
  console.log("\n[Test 3] Ending meeting with stored transcript (expect status 'ready' & DB rows)...");
  await upsertParticipant({
    meetingId: testMeeting.id,
    userId: hostUser,
    displayName: "Alice",
  });

  await insertSegments([
    {
      meetingId: testMeeting.id,
      speakerId: hostUser,
      speakerName: "Alice",
      text: "I'll write the design docs for the new API by Friday.",
      tMs: 5000,
    },
    {
      meetingId: testMeeting.id,
      speakerId: guestUser,
      speakerName: "Bob",
      text: "Sounds great. I will review the database migration scripts.",
      tMs: 12000,
    },
    {
      meetingId: testMeeting.id,
      speakerId: hostUser,
      speakerName: "Alice",
      text: "We should coordinate when the reviews are finished so the API work stays on schedule.",
      tMs: 18000,
    },
    {
      meetingId: testMeeting.id,
      speakerId: guestUser,
      speakerName: "Bob",
      text: "The design document will explain the request format and ownership for each database change.",
      tMs: 24000,
    },
    {
      meetingId: testMeeting.id,
      speakerId: hostUser,
      speakerName: "Alice",
      text: "Let's confirm the database changes with QA before merging the API design document.",
      tMs: 30000,
    },
  ]);

  const hostReq = new NextRequest(`http://localhost:3000/api/meetings/${testMeeting.id}/end`, {
    method: "POST",
    headers: { "x-user-id": hostUser },
  });
  const hostRes = await endMeetingRoute(hostReq, {
    params: Promise.resolve({ id: testMeeting.id }),
  });
  console.log(`✓ Host POST /end response status: ${hostRes.status}`);
  if (hostRes.status !== 200) {
    throw new Error(`Expected 200, got ${hostRes.status}`);
  }

  const details = await getMeetingDetails(testMeeting.id);
  console.log(`✓ Meeting status in DB: ${details.meeting?.status}`);
  if (details.meeting?.status !== "ready") {
    throw new Error(`Expected status 'ready', got ${details.meeting?.status}`);
  }

  console.log(`✓ Summary row saved: "${details.summary?.tldr}"`);
  if (!details.summary || !details.summary.tldr) {
    throw new Error("Expected summary row in summaries table");
  }

  console.log(`✓ Action items saved: ${details.action_items?.length} items`);
  if (!details.action_items || details.action_items.length === 0) {
    throw new Error("Expected action items in action_items table");
  }

  // ─── Test 4: Map owner_name to participants ──────────────────────────────
  console.log("\n[Test 4] Verifying owner_name to participant user_id mapping...");
  const aliceItem = details.action_items.find((a) => a.owner_name === "Alice");
  const bobItem = details.action_items.find((a) => a.owner_name === "Bob");
  console.log(`  - Alice's item: owner_id=${aliceItem?.owner_id}, expected=${hostUser}`);
  console.log(`  - Bob's item: owner_id=${bobItem?.owner_id}, expected=${guestUser}`);

  if (aliceItem?.owner_id !== hostUser || bobItem?.owner_id !== guestUser) {
    throw new Error("Action item owner_id was not correctly mapped to participant user_id!");
  }
  console.log("✓ Owner mapping passed!");

  // ─── Test 5: Idempotency ─────────────────────────────────────────────────
  console.log("\n[Test 5] Testing idempotency: calling POST /end on 'ready' meeting...");
  const secondEndRes = await endMeetingRoute(hostReq, {
    params: Promise.resolve({ id: testMeeting.id }),
  });
  const secondData = await secondEndRes.json();
  console.log(`✓ Idempotent response: ${JSON.stringify(secondData)}`);
  if (secondData.status !== "ready") {
    throw new Error(`Expected { status: 'ready' }, got ${JSON.stringify(secondData)}`);
  }

  // ─── Test 6: Killing the LLM key results in status 'failed', not a hang ─
  console.log("\n[Test 6] Testing killed LLM key (expect status 'failed', not a hang)...");
  const failMeeting = await createMeeting({
    title: "Meeting with Broken LLM Key",
    hostId: hostUser,
  });
  await insertSegments([
    {
      meetingId: failMeeting.id,
      speakerId: hostUser,
      speakerName: "Alice",
      text: "I'll write the design docs for the new API by Friday.",
      tMs: 5000,
    },
    {
      meetingId: failMeeting.id,
      speakerId: guestUser,
      speakerName: "Bob",
      text: "I will review the database migration scripts.",
      tMs: 12000,
    },
    {
      meetingId: failMeeting.id,
      speakerId: hostUser,
      speakerName: "Alice",
      text: "We should coordinate when the reviews are finished so the API work stays on schedule.",
      tMs: 18000,
    },
    {
      meetingId: failMeeting.id,
      speakerId: guestUser,
      speakerName: "Bob",
      text: "The design document will explain the request format and ownership for each database change.",
      tMs: 24000,
    },
    {
      meetingId: failMeeting.id,
      speakerId: hostUser,
      speakerName: "Alice",
      text: "Let's confirm the database changes with QA before merging the API design document.",
      tMs: 30000,
    },
  ]);

  // Kill the key!
  process.env.GEMINI_API_KEY = "killed";
  const startTime = Date.now();

  const failReq = new NextRequest(`http://localhost:3000/api/meetings/${failMeeting.id}/end`, {
    method: "POST",
    headers: { "x-user-id": hostUser },
  });
  await endMeetingRoute(failReq, {
    params: Promise.resolve({ id: failMeeting.id }),
  });
  const elapsedMs = Date.now() - startTime;

  console.log(`✓ Request completed in ${elapsedMs}ms (no hang)`);
  if (elapsedMs > 5000) {
    throw new Error(`Execution took ${elapsedMs}ms — potential hang detected!`);
  }

  const failedData = await getMeetingData(failMeeting.id);
  console.log(`✓ Meeting status in DB: ${failedData.meeting?.status}`);
  if (failedData.meeting?.status !== "failed") {
    throw new Error(`Expected status 'failed', got ${failedData.meeting?.status}`);
  }

  // ─── Test 7: Retry on 'failed' meeting reruns the work ───────────────────
  console.log("\n[Test 7] Testing retry on 'failed' meeting after restoring key...");
  // Restore key
  process.env.GEMINI_API_KEY = "test-mock-key";

  const retryReq = new NextRequest(`http://localhost:3000/api/meetings/${failMeeting.id}/end`, {
    method: "POST",
    headers: { "x-user-id": hostUser },
  });
  const retryRes = await endMeetingRoute(retryReq, {
    params: Promise.resolve({ id: failMeeting.id }),
  });
  console.log(`✓ Retry response status: ${retryRes.status}`);

  const retriedData = await getMeetingData(failMeeting.id);
  console.log(`✓ Meeting status after retry: ${retriedData.meeting?.status}`);
  if (retriedData.meeting?.status !== "ready") {
    throw new Error(`Expected status 'ready' after retry, got ${retriedData.meeting?.status}`);
  }

  console.log("\n=================================================");
  console.log(" ALL ACCEPTANCE TESTS PASSED SUCCESSFULLY! 🎉");
  console.log("=================================================\n");
}

runTestSuite().catch((err) => {
  console.error("❌ Test suite failed:", err);
  process.exit(1);
});
