/**
 * app/api/meetings/[id]/load-sample/route.ts
 *
 * Route: POST /api/meetings/[id]/load-sample
 *
 * Behaviour:
 *   1. Accepts { sampleId } in request body.
 *   2. Loads sample JSON from samples/<sampleId>.json (or fallback samples/standup.json).
 *   3. Normalizes and inserts participants + transcript_segments via P4 helpers (lib/db.ts).
 *   4. Calls the same end-of-meeting code path (set status processing -> runPipeline -> save -> ready).
 *   5. Reuses cached result if the same sample was already processed.
 *   6. Responds immediately with { ok: true }; client polls GET /api/meetings/[id].
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import {
  insertParticipants,
  insertTranscriptSegments,
  processEndOfMeeting,
  getMeetingById,
  createMeeting,
} from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: meetingId } = await params;

    if (!meetingId) {
      return NextResponse.json(
        { error: "Meeting ID parameter is required" },
        { status: 400 }
      );
    }

    // 1. Parse body for sampleId
    let sampleId = "sample-sprint-sync";
    try {
      const body = await req.json();
      if (body && typeof body.sampleId === "string" && body.sampleId.trim()) {
        sampleId = body.sampleId.trim();
      }
    } catch {
      // Use default sampleId if body is empty or malformed
    }

    // 2. Locate sample JSON file
    const samplesDir = path.join(process.cwd(), "samples");
    const candidateFiles = [
      path.join(samplesDir, `${sampleId}.json`),
      path.join(samplesDir, sampleId),
      path.join(samplesDir, "sample-sprint-sync.json"),
      path.join(samplesDir, "standup.json"),
    ];

    let sampleFilePath = "";
    for (const filePath of candidateFiles) {
      if (fs.existsSync(filePath)) {
        sampleFilePath = filePath;
        break;
      }
    }

    if (!sampleFilePath) {
      return NextResponse.json(
        { error: `Sample meeting file not found for sampleId: "${sampleId}"` },
        { status: 404 }
      );
    }

    const fileContent = fs.readFileSync(sampleFilePath, "utf8");
    const sampleData = JSON.parse(fileContent);

    // Ensure meeting record exists in DB
    const existingMeeting = await getMeetingById(meetingId);
    if (!existingMeeting) {
      await createMeeting({
        id: meetingId,
        title: sampleData.title || "Sample: Sprint Planning & AI Sync",
        status: "processing",
      });
    }

    // 3. Normalize participants: supports both { name } and { display_name, user_id }
    const rawParticipants = sampleData.participants || [];
    const normalizedParticipants = rawParticipants.map((p: any, idx: number) => {
      const displayName = p.name || p.display_name || `Participant ${idx + 1}`;
      const userId =
        p.user_id ||
        p.userId ||
        `usr_${displayName.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;

      return {
        userId,
        displayName,
        consentedAt: new Date().toISOString(),
      };
    });

    // 4. Normalize transcript segments: supports both { speaker, text, tMs } and { speaker_name, text, t_ms }
    const rawSegments = sampleData.segments || [];
    const normalizedSegments = rawSegments.map((s: any, idx: number) => {
      const speakerName = s.speaker || s.speaker_name || "Unknown Speaker";
      const text = s.text || "";
      const tMs = typeof s.tMs === "number" ? s.tMs : typeof s.t_ms === "number" ? s.t_ms : idx * 5000;

      return {
        speakerName,
        text,
        tMs,
      };
    });

    // 5. Insert participants + transcript_segments using P4 helper functions (from lib/db.ts)
    await insertParticipants(meetingId, normalizedParticipants);
    await insertTranscriptSegments(meetingId, normalizedSegments);

    // 6. Call the same end-of-meeting code path in background
    // (set status processing -> runPipeline -> save -> ready, reusing cached result if processed)
    // Non-blocking invocation ensures immediate response { ok: true } so client can poll
    void processEndOfMeeting(meetingId, { sampleId }).catch((bgErr) => {
      console.error(`[load-sample] Error in background end-of-meeting pipeline for ${meetingId}:`, bgErr);
    });

    // 7. Respond immediately with { ok: true }
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("[load-sample] Unhandled exception:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
