import { NextRequest } from "next/server";
import { POST } from "../app/api/meetings/[id]/load-sample/route";
import { getMeetingDetails, resetMockStore, createMeeting } from "../lib/db";
import { MEETING_ID, FIXTURE_ACTION_ITEMS } from "../lib/mock-data";

async function runTests() {
  console.log("=================================================");
  console.log(" Testing POST /api/meetings/[id]/load-sample");
  console.log("=================================================");

  resetMockStore();

  // Test 1: Load sample on DEMO meeting (unauthenticated in mock mode)
  console.log("\n[Test 1] Load sample on demo meeting without auth...");
  const req1 = new NextRequest(`http://localhost:3000/api/meetings/${MEETING_ID}/load-sample`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sampleId: "default" }),
  });
  const res1 = await POST(req1, { params: Promise.resolve({ id: MEETING_ID }) });
  console.log("Status:", res1.status);
  const data1 = await res1.json();
  console.log("Response:", data1);

  if (res1.status !== 200 || !data1.ok) {
    throw new Error(`Test 1 failed with status ${res1.status}`);
  }
  console.log("✓ Test 1 passed: Demo meeting loaded sample successfully.");

  // Verify meeting status and data in db
  const meetingDetails1 = await getMeetingDetails(MEETING_ID);
  if (meetingDetails1.meeting?.status !== "ready") {
    throw new Error(`Expected meeting status ready, got ${meetingDetails1.meeting?.status}`);
  }
  if (meetingDetails1.action_items?.length !== FIXTURE_ACTION_ITEMS.length) {
    throw new Error(`Expected ${FIXTURE_ACTION_ITEMS.length} stored action items, got ${meetingDetails1.action_items?.length}`);
  }
  if (!meetingDetails1.summary?.tldr) {
    throw new Error("Expected summary to be stored");
  }
  console.log("✓ Test 1 verified: Meeting status is ready and fixtures persisted in store.");

  // Test 2: 404 for non-existent meeting
  console.log("\n[Test 2] Load sample on non-existent meeting (expect 404)...");
  const req2 = new NextRequest("http://localhost:3000/api/meetings/non-existent-id/load-sample", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sampleId: "default" }),
  });
  const res2 = await POST(req2, { params: Promise.resolve({ id: "non-existent-id" }) });
  console.log("Status:", res2.status);
  if (res2.status !== 404) {
    throw new Error(`Expected 404, got ${res2.status}`);
  }
  console.log("✓ Test 2 passed: 404 returned for non-existent meeting.");

  // Test 3: Authenticated non-host user on custom meeting (expect 403)
  console.log("\n[Test 3] Non-host user attempts to load sample (expect 403)...");
  const customMeeting = await createMeeting({ title: "Custom Meeting", hostId: "host-user-999" });
  const req3 = new NextRequest(`http://localhost:3000/api/meetings/${customMeeting.id}/load-sample`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-mock-user-id": "attacker-user-000",
    },
    body: JSON.stringify({ sampleId: "default" }),
  });
  const res3 = await POST(req3, { params: Promise.resolve({ id: customMeeting.id }) });
  console.log("Status:", res3.status);
  if (res3.status !== 403) {
    throw new Error(`Expected 403, got ${res3.status}`);
  }
  console.log("✓ Test 3 passed: 403 returned for non-host.");

  // Test 4: Host user on custom meeting (expect 200)
  console.log("\n[Test 4] Host user loads sample on custom meeting (expect 200)...");
  const req4 = new NextRequest(`http://localhost:3000/api/meetings/${customMeeting.id}/load-sample`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-mock-user-id": "host-user-999",
    },
    body: JSON.stringify({ sampleId: "default" }),
  });
  const res4 = await POST(req4, { params: Promise.resolve({ id: customMeeting.id }) });
  console.log("Status:", res4.status);
  const data4 = await res4.json();
  if (res4.status !== 200 || !data4.ok) {
    throw new Error(`Expected 200, got ${res4.status}`);
  }
  console.log("✓ Test 4 passed: Host can load sample data.");

  console.log("\n=================================================");
  console.log(" ALL LOAD-SAMPLE TESTS PASSED! 🎉");
  console.log("=================================================\n");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
