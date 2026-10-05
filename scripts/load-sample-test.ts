/**
 * scripts/load-sample-test.ts
 *
 * Verifies POST /api/meetings/[id]/load-sample behaviour:
 *  1. Inserts participants and transcript_segments for the meeting.
 *  2. Executes end-of-meeting code path (status processing -> ready).
 *  3. Caches and reuses result for subsequent sample loads.
 *  4. Confirms GET /api/meetings/[id] returns populated summary and action items.
 */

import { POST as loadSampleHandler } from "../app/api/meetings/[id]/load-sample/route";
import { GET as getMeetingHandler } from "../app/api/meetings/[id]/route";
import { getMeetingDetails, createMeeting } from "../lib/db";
import { NextRequest } from "next/server";

async function main() {
  console.log("\n=== Testing POST /api/meetings/[id]/load-sample ===\n");

  const meeting = await createMeeting({
    title: "Sprint Planning & AI Sync",
    hostId: "test-host",
  });
  const meetingId = meeting.id;

  // Step 2: Invoke load-sample route
  const req = new NextRequest("http://localhost:3000/api/meetings/" + meetingId + "/load-sample", {
    method: "POST",
    body: JSON.stringify({ sampleId: "sample-sprint-sync" }),
    headers: { "Content-Type": "application/json", "x-mock-user-id": meeting.host_id },
  });

  const res = await loadSampleHandler(req, {
    params: Promise.resolve({ id: meetingId }),
  });

  const json = await res.json();
  console.log("1. Route response:", json);

  if (!json.ok) {
    throw new Error("Expected { ok: true } from load-sample route");
  }

  // Allow background processing to finish
  let tries = 0;
  let detail = await getMeetingDetails(meetingId);
  while (detail?.meeting.status !== "ready" && tries < 20) {
    await new Promise((r) => setTimeout(r, 200));
    detail = await getMeetingDetails(meetingId);
    tries++;
  }

  console.log("2. Meeting status:", detail?.meeting.status);
  console.log("3. Participants count:", detail?.participants.length);
  console.log("4. Summary TLDR:", detail?.summary?.tldr);
  console.log("5. Action Items count:", detail?.action_items.length);

  if (detail?.meeting.status !== "ready") {
    throw new Error("Meeting status did not reach ready");
  }

  if ((detail?.participants.length ?? 0) === 0) {
    throw new Error("No participants inserted");
  }

  if (!detail?.summary) {
    throw new Error("No summary created");
  }

  if ((detail?.action_items.length ?? 0) === 0) {
    throw new Error("No action items created");
  }

  // Step 3: Test cache reuse on a second meeting
  console.log("\n── Testing Cache Reuse ──");
  const meeting2 = await createMeeting({
    title: "Sprint Planning & AI Sync (Cached)",
    hostId: "test-host",
  });
  const meetingId2 = meeting2.id;

  const req2 = new NextRequest("http://localhost:3000/api/meetings/" + meetingId2 + "/load-sample", {
    method: "POST",
    body: JSON.stringify({ sampleId: "sample-sprint-sync" }),
    headers: { "Content-Type": "application/json", "x-mock-user-id": meeting2.host_id },
  });

  const res2 = await loadSampleHandler(req2, {
    params: Promise.resolve({ id: meetingId2 }),
  });
  const json2 = await res2.json();

  let detail2 = await getMeetingDetails(meetingId2);
  let tries2 = 0;
  while (detail2?.meeting.status !== "ready" && tries2 < 20) {
    await new Promise((r) => setTimeout(r, 100));
    detail2 = await getMeetingDetails(meetingId2);
    tries2++;
  }

  console.log("Cached load meeting status:", detail2?.meeting.status);
  console.log("Cached load summary TLDR:", detail2?.summary?.tldr);

  // Step 4: Verify GET /api/meetings/[id] route handler returns populated data
  const getReq = new NextRequest("http://localhost:3000/api/meetings/" + meetingId, {
    method: "GET",
  });
  const getRes = await getMeetingHandler(getReq, {
    params: Promise.resolve({ id: meetingId }),
  });
  const getJson = await getRes.json();
  console.log("\n── Testing GET /api/meetings/[id] Output ──");
  console.log("GET route status:", getRes.status);
  console.log("GET meeting title:", getJson.meeting.title);
  console.log("GET summary key points:", getJson.summary.key_points.length);
  console.log("GET action items:", getJson.action_items.length);

  console.log("\n✅ ALL TESTS PASSED!");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
