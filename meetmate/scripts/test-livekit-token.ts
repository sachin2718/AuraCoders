/**
 * scripts/test-livekit-token.ts
 *
 * Test script for POST /api/livekit-token:
 * 1. Tests unauthenticated request -> 401
 * 2. Tests invalid code -> 404
 * 3. Tests meeting status !== live -> 409
 * 4. Tests valid request -> 200 with JWT and LiveKit URL
 * 5. Decodes the returned LiveKit JWT to verify claims and grants:
 *    - identity = user id
 *    - name = displayName
 *    - video.room = meeting code
 *    - video.roomJoin = true
 *    - video.canPublish = true
 *    - video.canSubscribe = true
 *    - video.canPublishData = true
 *    - exp - nbf = 7200 (2h TTL)
 * 6. Verifies participant was upserted into DB.
 */

import { createMeeting, setStatus, getMeetingData } from "../lib/db";
import { POST } from "../app/api/livekit-token/route";
import { NextRequest } from "next/server";

async function runTest() {
  console.log("=================================================");
  console.log(" LiveKit Token Endpoint Test");
  console.log("=================================================\n");

  // Step A: Set up test meetings
  const liveMeeting = await createMeeting({
    title: "LiveKit Realtime Video Session",
    hostId: "user-host-123",
  });
  console.log(`✓ Created live test meeting with code: ${liveMeeting.code}`);

  const finishedMeeting = await createMeeting({
    title: "Ended Meeting",
    hostId: "user-host-123",
  });
  await setStatus(finishedMeeting.id, "ready");
  console.log(`✓ Created ended test meeting with code: ${finishedMeeting.code} (status: ready)`);

  // Test 1: Unauthenticated request (no user header or token)
  console.log("\n[Test 1] Testing unauthenticated request (expect 401)...");
  const reqUnauth = new NextRequest("http://localhost:3000/api/livekit-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: liveMeeting.code, displayName: "Priya" }),
  });
  const resUnauth = await POST(reqUnauth);
  console.log(`✓ Unauthenticated response status: ${resUnauth.status}`);
  if (resUnauth.status !== 401) {
    throw new Error(`Expected status 401 for unauthenticated request, got ${resUnauth.status}`);
  }

  // Test 2: Non-existent meeting code (expect 404)
  console.log("\n[Test 2] Testing non-existent meeting code (expect 404)...");
  const reqNotFound = new NextRequest("http://localhost:3000/api/livekit-token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": "user-priya-0001",
    },
    body: JSON.stringify({ code: "NONEXIST", displayName: "Priya" }),
  });
  const resNotFound = await POST(reqNotFound);
  console.log(`✓ Not found response status: ${resNotFound.status}`);
  if (resNotFound.status !== 404) {
    throw new Error(`Expected status 404 for non-existent meeting, got ${resNotFound.status}`);
  }

  // Test 3: Meeting with status != live (expect 409)
  console.log("\n[Test 3] Testing meeting with status != live (expect 409)...");
  const reqConflict = new NextRequest("http://localhost:3000/api/livekit-token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": "user-priya-0001",
    },
    body: JSON.stringify({ code: finishedMeeting.code, displayName: "Priya" }),
  });
  const resConflict = await POST(reqConflict);
  console.log(`✓ Conflict response status: ${resConflict.status}`);
  if (resConflict.status !== 409) {
    throw new Error(`Expected status 409 for non-live meeting, got ${resConflict.status}`);
  }

  // Test 4: Valid request (expect 200 with JWT and URL)
  console.log("\n[Test 4] Testing valid token request (expect 200)...");
  const testUserId = "user-arjun-0002";
  const testDisplayName = "Arjun";
  const reqValid = new NextRequest("http://localhost:3000/api/livekit-token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${testUserId}`,
    },
    body: JSON.stringify({ code: liveMeeting.code, displayName: testDisplayName }),
  });
  const resValid = await POST(reqValid);
  console.log(`✓ Valid request response status: ${resValid.status}`);
  if (resValid.status !== 200) {
    const errorBody = await resValid.json();
    throw new Error(`Expected status 200, got ${resValid.status}: ${JSON.stringify(errorBody)}`);
  }

  const data = await resValid.json();
  console.log(`✓ Response received:`);
  console.log(`  - URL: ${data.url}`);
  console.log(`  - Token: ${data.token.slice(0, 30)}... (${data.token.length} chars)`);

  if (!data.token || typeof data.token !== "string") {
    throw new Error("Missing or invalid token in response");
  }
  if (!data.url || typeof data.url !== "string") {
    throw new Error("Missing or invalid url in response");
  }

  // Test 5: Verify LiveKit JWT claims
  console.log("\n[Test 5] Verifying JWT claims...");
  const [, payloadB64] = data.token.split(".");
  const payload = JSON.parse(Buffer.from(payloadB64, "base64").toString("utf-8"));
  console.log(`✓ Decoded JWT Payload:`, {
    sub: payload.sub,
    name: payload.name,
    video: payload.video,
    exp_minus_nbf: payload.exp - payload.nbf,
  });

  if (payload.sub !== testUserId) {
    throw new Error(`Expected sub to be ${testUserId}, got ${payload.sub}`);
  }
  if (payload.name !== testDisplayName) {
    throw new Error(`Expected name to be ${testDisplayName}, got ${payload.name}`);
  }
  if (payload.video?.room !== liveMeeting.code) {
    throw new Error(`Expected video.room to be ${liveMeeting.code}, got ${payload.video?.room}`);
  }
  if (payload.video?.roomJoin !== true) {
    throw new Error("Expected video.roomJoin to be true");
  }
  if (payload.video?.canPublish !== true) {
    throw new Error("Expected video.canPublish to be true");
  }
  if (payload.video?.canSubscribe !== true) {
    throw new Error("Expected video.canSubscribe to be true");
  }
  if (payload.video?.canPublishData !== true) {
    throw new Error("Expected video.canPublishData to be true");
  }
  const ttl = payload.exp - payload.nbf;
  if (ttl !== 7200) {
    throw new Error(`Expected TTL of 7200s (2h), got ${ttl}s`);
  }

  // Test 6: Verify participant was upserted into DB
  console.log("\n[Test 6] Verifying participant was upserted in DB...");
  const meetingData = await getMeetingData(liveMeeting.id);
  const foundParticipant = meetingData.participants.find((p) => p.user_id === testUserId);
  if (!foundParticipant) {
    throw new Error(`Participant ${testUserId} was not upserted into the database!`);
  }
  console.log(`✓ Participant verified in DB: ${foundParticipant.display_name} (${foundParticipant.user_id})`);

  console.log("\n=================================================");
  console.log(" ALL LIVEKIT TOKEN TESTS PASSED SUCCESSFULLY!");
  console.log("=================================================\n");
}

runTest().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
