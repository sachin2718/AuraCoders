/**
 * scripts/transcribe-test.ts
 *
 * Acceptance test for POST /api/transcribe:
 *  1. Tests audio webm multipart submission -> returns { text } and creates transcript row.
 *  2. Tests audio > 3 MB rejection -> returns HTTP 413.
 *  3. Validates required fields.
 */

import { POST as transcribeHandler } from "../app/api/transcribe/route";
import { getMeetingData, createMeeting } from "../lib/db";
import { NextRequest } from "next/server";

async function main() {
  console.log("\n=== Testing POST /api/transcribe ===\n");

  const meeting = await createMeeting({ title: "Transcription Test Meeting", hostId: "test-host" });
  const meetingId = meeting.id;

  // Test 1: Valid 20-second spoken test clip
  console.log("1. Testing valid spoken test clip upload...");
  // Simulate 20s audio clip (~64 KB dummy webm buffer)
  const audioBuffer = Buffer.alloc(64 * 1024, 0x1a);
  const audioBlob = new Blob([audioBuffer], { type: "audio/webm;codecs=opus" });

  const formData1 = new FormData();
  formData1.append("meetingId", meetingId);
  formData1.append("speakerName", "Bob Sharma");
  formData1.append("tMs", "12000");
  formData1.append("audio", audioBlob, "clip-20s.webm");

  const req1 = new NextRequest("http://localhost:3000/api/transcribe", {
    method: "POST",
    body: formData1,
  });

  const res1 = await transcribeHandler(req1);
  const data1 = await res1.json();
  console.log("   Status:", res1.status);
  console.log("   Transcribed text:", `"${data1.text}"`);

  if (res1.status !== 200) {
    throw new Error(`Expected status 200, got ${res1.status}`);
  }

  if (!data1.text) {
    throw new Error("Expected non-empty transcribed text");
  }

  // Verify transcript row was inserted in DB via P4's helper
  const segments = (await getMeetingData(meetingId)).segments;
  console.log("   Transcript segments in DB:", segments.length);
  const lastSeg = segments[segments.length - 1];
  console.log("   Inserted segment:", {
    speaker: lastSeg?.speaker_name,
    text: lastSeg?.text,
    t_ms: lastSeg?.t_ms,
  });

  if (segments.length !== 1) {
    throw new Error("Expected 1 transcript row inserted in database");
  }

  // Test 2: Audio > 3 MB rejection (HTTP 413)
  console.log("\n2. Testing rejection of audio > 3 MB...");
  const oversizedBuffer = Buffer.alloc(3.2 * 1024 * 1024, 0x00);
  const oversizedBlob = new Blob([oversizedBuffer], { type: "audio/webm" });

  const formData2 = new FormData();
  formData2.append("meetingId", meetingId);
  formData2.append("speakerName", "Bob Sharma");
  formData2.append("tMs", "32000");
  formData2.append("audio", oversizedBlob, "large.webm");

  const req2 = new NextRequest("http://localhost:3000/api/transcribe", {
    method: "POST",
    body: formData2,
  });

  const res2 = await transcribeHandler(req2);
  const data2 = await res2.json();
  console.log("   Status:", res2.status, "(expected 413)");
  console.log("   Error:", data2.error);

  if (res2.status !== 413) {
    throw new Error(`Expected status 413 for audio > 3 MB, got ${res2.status}`);
  }

  // Test 3: Missing fields rejection
  console.log("\n3. Testing missing meetingId rejection...");
  const formData3 = new FormData();
  formData3.append("speakerName", "Bob Sharma");
  formData3.append("audio", audioBlob);

  const req3 = new NextRequest("http://localhost:3000/api/transcribe", {
    method: "POST",
    body: formData3,
  });

  const res3 = await transcribeHandler(req3);
  const data3 = await res3.json();
  console.log("   Status:", res3.status, "(expected 400)");
  console.log("   Error:", data3.error);

  if (res3.status !== 400) {
    throw new Error(`Expected status 400 for missing meetingId, got ${res3.status}`);
  }

  console.log("\n✅ ALL TRANSCRIBE ROUTE TESTS PASSED!");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
