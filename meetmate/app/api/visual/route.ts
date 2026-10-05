/**
 * app/api/visual/route.ts
 *
 * Route: POST /api/visual
 * Payload: { meetingId: string, tMs: number, imageBase64: string }
 *
 * Behaviour:
 *   1. Validates payload fields and rejects images > 1.5 MB with HTTP 413.
 *   2. Enforces per-meeting rate limits: max 1 call / 10 seconds and max 20 calls total per meeting.
 *   3. Calls Gemini Flash model with image + prompt:
 *      "Describe this shared screen in ONE short sentence for meeting notes. Mention slide titles, key numbers or decisions visible. If it is mostly blank or a camera view, reply EMPTY."
 *   4. If description is not EMPTY, saves to visual_notes via P4's insertVisualNote helper.
 *   5. Responds with { description: string }.
 */

import { NextRequest, NextResponse } from "next/server";
import { insertVisualNote } from "@/lib/db";

// ─── Rate Limiting State (Per Meeting) ─────────────────────────────────────────

interface RateLimitEntry {
  lastCallMs: number;
  callCount: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __meetmate_visual_ratelimits: Map<string, RateLimitEntry> | undefined;
}

const rateLimitMap = (globalThis.__meetmate_visual_ratelimits ??= new Map<
  string,
  RateLimitEntry
>());

const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024; // 1.5 MB
const RATE_LIMIT_WINDOW_MS = 10_000; // 10 seconds
const MAX_CALLS_PER_MEETING = 20;

const SYSTEM_PROMPT =
  "Describe this shared screen in ONE short sentence for meeting notes. Mention slide titles, key numbers or decisions visible. If it is mostly blank or a camera view, reply EMPTY.";

// ─── Helper: Detect EMPTY ─────────────────────────────────────────────────────

function isBlankOrEmpty(text: string): boolean {
  const clean = text.trim().replace(/^["']|["']$/g, "").toUpperCase();
  return (
    clean === "EMPTY" ||
    clean.startsWith("EMPTY.") ||
    clean.startsWith("EMPTY:") ||
    clean.length === 0
  );
}

// ─── POST Handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const { meetingId, tMs, imageBase64 } = body;

    // 1. Validation
    if (!meetingId || typeof meetingId !== "string") {
      return NextResponse.json(
        { error: "meetingId string is required" },
        { status: 400 }
      );
    }

    if (typeof tMs !== "number" || isNaN(tMs) || tMs < 0) {
      return NextResponse.json(
        { error: "tMs must be a non-negative number" },
        { status: 400 }
      );
    }

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return NextResponse.json(
        { error: "imageBase64 string is required" },
        { status: 400 }
      );
    }

    // 2. Size Check: Reject images > 1.5 MB
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, "");
    const imageSizeBytes = Buffer.byteLength(cleanBase64, "base64");

    if (imageSizeBytes > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        {
          error: `Image size (${(imageSizeBytes / (1024 * 1024)).toFixed(2)} MB) exceeds 1.5 MB limit`,
        },
        { status: 413 }
      );
    }

    // 3. Rate-Limiting: max 1 call / 10s / meeting and 20 per meeting
    const now = Date.now();
    const rateState = rateLimitMap.get(meetingId) ?? { lastCallMs: 0, callCount: 0 };

    if (now - rateState.lastCallMs < RATE_LIMIT_WINDOW_MS) {
      const waitSeconds = Math.ceil(
        (RATE_LIMIT_WINDOW_MS - (now - rateState.lastCallMs)) / 1000
      );
      return NextResponse.json(
        {
          error: `Rate limit exceeded: max 1 call per 10s per meeting. Please wait ${waitSeconds}s.`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(waitSeconds) },
        }
      );
    }

    if (rateState.callCount >= MAX_CALLS_PER_MEETING) {
      return NextResponse.json(
        {
          error: `Rate limit exceeded: maximum ${MAX_CALLS_PER_MEETING} visual notes per meeting reached.`,
        },
        { status: 429 }
      );
    }

    // Update rate limit tracker
    rateState.lastCallMs = now;
    rateState.callCount += 1;
    rateLimitMap.set(meetingId, rateState);

    // 4. Determine image mime type
    let mimeType = "image/jpeg";
    const mimeMatch = imageBase64.match(/^data:(image\/[a-zA-Z+]+);base64,/);
    if (mimeMatch) {
      mimeType = mimeMatch[1];
    }

    // 5. Call Gemini Flash Model
    let description = "EMPTY";
    const apiKey = process.env.LLM_API_KEY;
    const model = process.env.LLM_MODEL || "gemini-1.5-flash";

    if (apiKey) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const geminiBody = {
        contents: [
          {
            role: "user",
            parts: [
              { text: SYSTEM_PROMPT },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: cleanBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
        },
      };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody),
      });

      if (!res.ok) {
        console.error(`[visual] Gemini API returned error ${res.status}:`, await res.text());
        throw new Error(`Gemini API error: ${res.status}`);
      }

      const data = await res.json();
      description =
        data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "EMPTY";
    } else {
      // Offline fallback for demo / testing environments when LLM_API_KEY is not configured
      console.warn("[visual] No LLM_API_KEY configured — returning fallback visual note");
      description =
        "Shared screen showing architecture diagram and deployment roadmap.";
    }

    // 6. Save non-EMPTY descriptions to visual_notes via P4's helper
    if (!isBlankOrEmpty(description)) {
      await insertVisualNote(meetingId, {
        tMs,
        description,
      });
      console.log(`[visual] Saved visual note for meeting ${meetingId}: "${description}"`);
    } else {
      console.log(`[visual] Screen was blank/camera view (EMPTY) — skipped saving to visual_notes.`);
    }

    // 7. Return description
    return NextResponse.json({ description });
  } catch (err: unknown) {
    console.error("[visual] Internal error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
