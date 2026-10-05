/**
 * POST /api/meetings/:id/end — End meeting and trigger AI intelligence pipeline
 *
 * BEHAVIOUR:
 * - Host-only (403 otherwise).
 * - Idempotent: if status is already "processing" or "ready", return it immediately.
 * - Retry support: calling POST /end on a "failed" meeting reruns the pipeline.
 * - Sets status "processing", ended_at = now.
 * - Responds { status: "processing" } quickly if background execution via after() is available;
 *   otherwise completes the work inside the request.
 * - export const maxDuration is set to 60s (Vercel Hobby plan maximum).
 * - Work: getMeetingData -> runPipeline -> map owner_name to participants -> saveResults -> setStatus "ready".
 * - On any error: setStatus "failed" and log error safely without secret leakage.
 */

import { NextRequest, NextResponse, after } from "next/server";
import { getAuthUser, isMockMode } from "@/lib/auth";
import { getMeetingData, saveResults, setStatus } from "@/lib/db";
import { runPipeline } from "@/lib/ai/pipeline";
import { meetingsStore, FIXTURE_PARTICIPANTS } from "@/lib/mock-data";

// Maximum duration permitted for Serverless Functions on Vercel Hobby plan
export const maxDuration = 60;

/**
 * Strips API keys, bearer tokens, and secrets from error logs.
 */
function sanitizeError(err: unknown): string {
  if (!err) return "Unknown error";
  let message = err instanceof Error ? err.stack || err.message : String(err);

  // Redact potential API keys or tokens
  message = message.replace(/AIza[0-9A-Za-z-_]{35}/g, "[REDACTED_API_KEY]");
  message = message.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]");

  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 5) {
    message = message.split(process.env.GEMINI_API_KEY).join("[REDACTED_KEY]");
  }
  if (
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY.length > 5
  ) {
    message = message
      .split(process.env.SUPABASE_SERVICE_ROLE_KEY)
      .join("[REDACTED_KEY]");
  }
  return message;
}

/**
 * Worker function that runs the end-to-end meeting intelligence pipeline.
 */
async function executeEndPipeline(id: string): Promise<void> {
  try {
    // 1. getMeetingData
    let data = await getMeetingData(id);

    // In-memory fallback sync if in mock mode
    if (!data.meeting && isMockMode()) {
      const storeM = meetingsStore.find((m) => m.id === id);
      if (storeM) {
        data = {
          meeting: storeM,
          participants: FIXTURE_PARTICIPANTS.filter((p) => p.meeting_id === id),
          segments: [],
          visualNotes: [],
        };
      }
    }

    if (!data.meeting) {
      throw new Error(`Meeting ${id} not found during pipeline execution`);
    }

    // 2. runPipeline (import from lib/ai/pipeline, owned by P3)
    const pipelineResult = await runPipeline(data);

    // 3. map owner_name to participants
    const participants = data.participants || [];
    const mappedActionItems = (pipelineResult.actionItems || []).map((item) => {
      let matchedOwnerId = item.owner_id || null;
      let matchedOwnerName = item.owner_name || null;

      if (matchedOwnerName && !matchedOwnerId) {
        const cleanName = matchedOwnerName.toLowerCase().trim();
        const matchedParticipant = participants.find((p) => {
          const pName = (p.display_name || "").toLowerCase().trim();
          return (
            pName === cleanName ||
            pName.split(/\s+/).includes(cleanName) ||
            cleanName.split(/\s+/).includes(pName)
          );
        });

        if (matchedParticipant) {
          matchedOwnerId = matchedParticipant.user_id;
          matchedOwnerName = matchedParticipant.display_name;
        }
      }

      return {
        ...item,
        owner_id: matchedOwnerId,
        owner_name: matchedOwnerName,
        priority: item.priority || "medium",
        status: item.status || "todo",
        source_quote: item.source_quote || "",
        t_ms: item.t_ms || 0,
      };
    });

    // 4. saveResults
    await saveResults(id, {
      summary: pipelineResult.summary,
      actionItems: mappedActionItems,
    });

    // 5. setStatus "ready"
    await setStatus(id, "ready");

    if (isMockMode()) {
      const storeM = meetingsStore.find((m) => m.id === id);
      if (storeM) {
        storeM.status = "ready";
      }
    }
  } catch (error) {
    // On any error: setStatus "failed" and log the error (no secrets)
    console.error(
      `[POST /api/meetings/${id}/end] Pipeline execution failed:`,
      sanitizeError(error)
    );

    try {
      await setStatus(id, "failed");
      if (isMockMode()) {
        const storeM = meetingsStore.find((m) => m.id === id);
        if (storeM) {
          storeM.status = "failed";
        }
      }
    } catch (statusErr) {
      console.error(
        `[POST /api/meetings/${id}/end] Failed to set status to 'failed':`,
        sanitizeError(statusErr)
      );
    }
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Require signed-in user
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized: signed-in user required" },
      { status: 401 }
    );
  }

  const { id } = await params;

  // 2. Fetch meeting
  const meetingData = await getMeetingData(id);
  let meeting = meetingData.meeting;

  if (!meeting && isMockMode()) {
    const legacy = meetingsStore.find((m) => m.id === id);
    if (legacy) {
      meeting = legacy;
    }
  }

  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  // 3. BEHAVIOUR: host-only (403 otherwise)
  if (meeting.host_id !== user.id) {
    return NextResponse.json(
      { error: "Forbidden: Only the meeting host can end the meeting" },
      { status: 403 }
    );
  }

  // 4. Idempotent: if status is already processing/ready return it
  if (meeting.status === "processing" || meeting.status === "ready") {
    return NextResponse.json({ status: meeting.status });
  }

  // 5. Meeting is "live" or "failed" (retry support):
  // Set status "processing", ended_at = now
  const now = new Date().toISOString();
  await setStatus(id, "processing");

  if (isMockMode()) {
    const storeM = meetingsStore.find((m) => m.id === id);
    if (storeM) {
      storeM.status = "processing";
      storeM.ended_at = now;
    }
  }

  // 6. Background execution via Next.js after()
  let scheduledViaAfter = false;
  try {
    after(async () => {
      await executeEndPipeline(id);
    });
    scheduledViaAfter = true;
  } catch {
    // When called outside Next.js request scope (e.g. standalone test scripts), after() throws.
    // Fallback: execute work inside the request
    scheduledViaAfter = false;
  }

  if (!scheduledViaAfter) {
    await executeEndPipeline(id);
    const updated = await getMeetingData(id);
    const effectiveStatus = updated.meeting?.status || "processing";
    return NextResponse.json({ status: effectiveStatus });
  }

  return NextResponse.json({ status: "processing" });
}
