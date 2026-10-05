/**
 * scripts/visual-test.ts
 *
 * Tests POST /api/visual route:
 *  1. Normal slide image upload -> produces note and saves to visual_notes via P4 helper.
 *  2. Image > 1.5 MB rejection (HTTP 413).
 *  3. Rate-limit: max 1 call / 10s / meeting (HTTP 429).
 *  4. Rate-limit: max 20 calls per meeting (HTTP 429).
 */

import { POST as visualHandler } from "../app/api/visual/route";
import { getMeetingData } from "../lib/db";
import { NextRequest } from "next/server";

async function main() {
  console.log("\n=== Testing POST /api/visual ===\n");

  const meetingId = "test-vis-meeting-1";

  // Test 1: Normal slide submission
  console.log("1. Testing valid slide submission...");
  // Tiny 1x1 transparent GIF in base64
  const sampleBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  const req1 = new NextRequest("http://localhost:3000/api/visual", {
    method: "POST",
    body: JSON.stringify({
      meetingId,
      tMs: 15000,
      imageBase64: sampleBase64,
    }),
    headers: { "Content-Type": "application/json" },
  });

  const res1 = await visualHandler(req1);
  const data1 = await res1.json();
  console.log("   Status:", res1.status);
  console.log("   Description:", data1.description);

  if (res1.status !== 200) {
    throw new Error(`Expected status 200, got ${res1.status}`);
  }

  const savedNotes = (await getMeetingData(meetingId)).visualNotes;
  console.log("   Saved in visual_notes:", savedNotes.length, "note(s)");
  if (savedNotes.length !== 1) {
    throw new Error("Expected 1 saved visual note in DB");
  }

  // Test 2: Image > 1.5 MB rejection
  console.log("\n2. Testing rejection of image > 1.5 MB...");
  // Generate base64 string larger than 1.5 MB (1.6 MB)
  const largeBase64 = "data:image/jpeg;base64," + "A".repeat(2.2 * 1024 * 1024);

  const req2 = new NextRequest("http://localhost:3000/api/visual", {
    method: "POST",
    body: JSON.stringify({
      meetingId: "test-large-mtg",
      tMs: 5000,
      imageBase64: largeBase64,
    }),
    headers: { "Content-Type": "application/json" },
  });

  const res2 = await visualHandler(req2);
  const data2 = await res2.json();
  console.log("   Status:", res2.status, "(expected 413)");
  console.log("   Error:", data2.error);

  if (res2.status !== 413) {
    throw new Error(`Expected status 413 for oversized image, got ${res2.status}`);
  }

  // Test 3: Rate limit: 1 call / 10s per meeting
  console.log("\n3. Testing 10s rate limit per meeting...");
  const req3 = new NextRequest("http://localhost:3000/api/visual", {
    method: "POST",
    body: JSON.stringify({
      meetingId, // Same meetingId immediately after Test 1
      tMs: 16000,
      imageBase64: sampleBase64,
    }),
    headers: { "Content-Type": "application/json" },
  });

  const res3 = await visualHandler(req3);
  const data3 = await res3.json();
  console.log("   Status:", res3.status, "(expected 429)");
  console.log("   Error:", data3.error);

  if (res3.status !== 429) {
    throw new Error(`Expected status 429 for rapid requests, got ${res3.status}`);
  }

  // Test 4: Rate limit: 20 per meeting cap
  console.log("\n4. Testing max 20 calls cap per meeting...");
  const meetingCap = "test-cap-mtg";
  // Directly simulate 20 prior calls in the global rate-limit map
  const rateLimitMap = (globalThis as any).__meetmate_visual_ratelimits;
  rateLimitMap.set(meetingCap, {
    lastCallMs: Date.now() - 15000, // 15s ago, so 10s window has passed
    callCount: 20, // already at 20 limit
  });

  const req4 = new NextRequest("http://localhost:3000/api/visual", {
    method: "POST",
    body: JSON.stringify({
      meetingId: meetingCap,
      tMs: 25000,
      imageBase64: sampleBase64,
    }),
    headers: { "Content-Type": "application/json" },
  });

  const res4 = await visualHandler(req4);
  const data4 = await res4.json();
  console.log("   Status:", res4.status, "(expected 429)");
  console.log("   Error:", data4.error);

  if (res4.status !== 429) {
    throw new Error(`Expected status 429 for 20 calls cap, got ${res4.status}`);
  }

  console.log("\n✅ ALL VISUAL ROUTE TESTS PASSED!");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
