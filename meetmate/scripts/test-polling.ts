import { NextRequest } from "next/server";
import { GET } from "../app/api/meetings/[id]/route";
import { MEETING_ID, resetPollCounter } from "../lib/mock-data";
import { resetMockStore } from "../lib/db";

async function testPolling() {
  console.log("=================================================");
  console.log(" Testing Polling Simulation on GET /api/meetings/:id");
  console.log("=================================================\n");

  resetMockStore();
  resetPollCounter(MEETING_ID);

  for (let i = 1; i <= 4; i++) {
    const req = new NextRequest(`http://localhost:3000/api/meetings/${MEETING_ID}`);
    const res = await GET(req, { params: Promise.resolve({ id: MEETING_ID }) });
    const data = await res.json();
    console.log(`Call #${i} Status Code: ${res.status}, Meeting Status: ${data.meeting?.status}`);
    if (i <= 3) {
      if (data.meeting?.status !== "processing") {
        throw new Error(`Expected 'processing' on call ${i}, got ${data.meeting?.status}`);
      }
    } else {
      if (data.meeting?.status !== "ready") {
        throw new Error(`Expected 'ready' on call ${i}, got ${data.meeting?.status}`);
      }
      if (!data.summary?.tldr) {
        throw new Error("Expected summary on 4th call");
      }
      if (!data.action_items || data.action_items.length !== 6) {
        throw new Error(`Expected 6 action items on 4th call, got ${data.action_items?.length}`);
      }
    }
  }

  console.log("\n✓ Polling simulation passed! (3x processing -> 1x ready with fixtures)");
}

testPolling().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
