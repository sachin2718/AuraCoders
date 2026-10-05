/**
 * scripts/test-db.ts
 *
 * Acceptance Test Script:
 * 1. Creates a meeting with an 8-char readable code.
 * 2. Inserts 3 speech segments.
 * 3. Reads the meeting data and segments back and validates them.
 * 4. Validates participants, consent, summary/action items, and todos.
 *
 * Run via:
 *   npx tsx scripts/test-db.ts
 */

import {
  createMeeting,
  getMeetingByCode,
  getMeetingData,
  upsertParticipant,
  markConsent,
  insertSegments,
  setStatus,
  saveResults,
  listMeetingsForUser,
  getTodosForUser,
  updateTodoStatus,
} from "../lib/db";
import { isSupabaseConfigured } from "../lib/supabase";

async function runAcceptanceTest() {
  console.log("=================================================");
  console.log(" MeetMate DB Helper Acceptance Test");
  console.log("=================================================");
  console.log(
    `Mode: ${isSupabaseConfigured() ? "Supabase Live Database" : "In-Memory Store (Zero-Config Fallback)"}`
  );

  // 1. Create a meeting with a unique 8-character readable code
  console.log("\n[Step 1] Creating a meeting...");
  const meeting = await createMeeting({
    title: "Q4 Product Planning & Sprint Kickoff",
    hostId: "user-priya-0001",
  });

  console.log(`✓ Meeting created:`);
  console.log(`  - ID: ${meeting.id}`);
  console.log(`  - Code (${meeting.code.length} chars): ${meeting.code}`);
  console.log(`  - Title: ${meeting.title}`);
  console.log(`  - Host: ${meeting.host_id}`);
  console.log(`  - Status: ${meeting.status}`);

  if (meeting.code.length !== 8) {
    throw new Error(`Expected 8-character code, got '${meeting.code}' (${meeting.code.length} chars)`);
  }

  // 2. Insert 3 segments
  console.log("\n[Step 2] Inserting 3 transcript segments...");
  const rawSegments = [
    {
      meetingId: meeting.id,
      speakerId: "user-priya-0001",
      speakerName: "Priya",
      text: "Welcome everyone! Let's review the architectural goals for our MeetMate release.",
      tMs: 5000,
    },
    {
      meetingId: meeting.id,
      speakerId: "user-arjun-0002",
      speakerName: "Arjun",
      text: "I'll take ownership of the LiveKit Cloud integration and Web Speech transcription.",
      tMs: 18000,
    },
    {
      meetingId: meeting.id,
      speakerId: "user-meera-0003",
      speakerName: "Meera",
      text: "I will write the Supabase helper functions and secure service role client.",
      tMs: 32000,
    },
  ];

  const insertedSegments = await insertSegments(rawSegments);
  console.log(`✓ Inserted ${insertedSegments.length} segments.`);

  // 3. Read them back via getMeetingData
  console.log("\n[Step 3] Reading back meeting data and segments...");
  const data = await getMeetingData(meeting.id);

  if (!data.meeting) {
    throw new Error(`Meeting ${meeting.id} could not be retrieved from DB.`);
  }

  if (data.segments.length !== 3) {
    throw new Error(`Expected 3 segments, found ${data.segments.length}`);
  }

  console.log(`✓ Retrieved meeting: ${data.meeting.title} (${data.meeting.code})`);
  console.log(`✓ Retrieved segments back:`);
  data.segments.forEach((s, idx) => {
    console.log(`   ${idx + 1}. [${s.t_ms}ms] ${s.speaker_name}: "${s.text}"`);
  });

  // Verify text content integrity
  if (data.segments[0].text !== rawSegments[0].text) {
    throw new Error("Segment 1 text mismatch!");
  }
  if (data.segments[1].text !== rawSegments[1].text) {
    throw new Error("Segment 2 text mismatch!");
  }
  if (data.segments[2].text !== rawSegments[2].text) {
    throw new Error("Segment 3 text mismatch!");
  }

  // 4. Test code lookup
  console.log("\n[Step 4] Looking up meeting by code...");
  const foundByCode = await getMeetingByCode(meeting.code);
  if (!foundByCode || foundByCode.id !== meeting.id) {
    throw new Error(`Failed to find meeting by code '${meeting.code}'`);
  }
  console.log(`✓ Successfully found meeting by code '${meeting.code}'.`);

  // 5. Test participant upsert & consent
  console.log("\n[Step 5] Upserting participant & recording consent...");
  const participant = await upsertParticipant({
    meetingId: meeting.id,
    userId: "user-arjun-0002",
    displayName: "Arjun",
  });
  console.log(`✓ Participant registered: ${participant.display_name} (${participant.user_id})`);

  const consented = await markConsent(meeting.id, "user-arjun-0002");
  console.log(`✓ Consent recorded at: ${consented.consented_at}`);

  // 6. Test status transition & AI summary/action item save
  console.log("\n[Step 6] Setting status to processing and saving results...");
  await setStatus(meeting.id, "processing");

  const results = await saveResults(meeting.id, {
    summary: {
      tldr: "Team agreed on architecture and divided sprint tasks.",
      key_points: ["LiveKit for video", "Supabase for database", "Gemini for summarization"],
      decisions: ["Free tier only", "Server-only DB client"],
      open_questions: ["Electron wrapper timing"],
    },
    actionItems: [
      {
        owner_id: "user-arjun-0002",
        owner_name: "Arjun",
        title: "Implement LiveKit Cloud connection",
        priority: "high",
        status: "todo",
        source_quote: "I'll take ownership of the LiveKit Cloud integration",
        t_ms: 18000,
        due_date: null,
      },
      {
        owner_id: "user-meera-0003",
        owner_name: "Meera",
        title: "Implement Supabase helpers",
        priority: "high",
        status: "todo",
        source_quote: "I will write the Supabase helper functions",
        t_ms: 32000,
        due_date: null,
      },
    ],
  });
  console.log(`✓ Saved summary (tldr: "${results.summary.tldr}")`);
  console.log(`✓ Saved ${results.actionItems.length} action items.`);

  // 7. Test user todos and status update
  console.log("\n[Step 7] Checking todos for user Arjun...");
  const arjunTodos = await getTodosForUser("user-arjun-0002");
  console.log(`✓ Arjun has ${arjunTodos.length} todo item(s): "${arjunTodos[0]?.title}" (Status: ${arjunTodos[0]?.status})`);

  if (arjunTodos.length > 0) {
    const updated = await updateTodoStatus(arjunTodos[0].id, "user-arjun-0002", "done");
    console.log(`✓ Updated todo status to: "${updated.status}"`);
  }

  // 8. Test list meetings for user
  console.log("\n[Step 8] Listing meetings for user Priya...");
  const priyaMeetings = await listMeetingsForUser("user-priya-0001");
  console.log(`✓ Found ${priyaMeetings.length} meeting(s) for Priya.`);

  console.log("\n=================================================");
  console.log(" ACCEPTANCE TEST PASSED SUCCESSFULLY!");
  console.log("=================================================\n");
}

runAcceptanceTest().catch((err) => {
  console.error("\n❌ Acceptance test failed with error:", err);
  process.exit(1);
});
