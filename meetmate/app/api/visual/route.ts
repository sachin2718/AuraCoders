/**
 * POST /api/visual — (stretch) describe a whiteboard/screen-share image via Gemini Vision
 * Stub: returns a realistic AI-generated description without calling the real API.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { meetingsStore } from "@/lib/mock-data";

const VisualSchema = z.object({
  meetingId: z.string().uuid("meetingId must be a UUID"),
  tMs: z.number().int().nonnegative(),
  imageBase64: z.string().min(1, "imageBase64 is required"),
});

const STUB_DESCRIPTIONS = [
  "Whiteboard shows a system architecture diagram with three services: a Next.js frontend, a Supabase Postgres database, and the Gemini API. Arrows indicate data flow from the browser Web Speech API through the transcript ingest endpoint.",
  "Screen share displays a Figma prototype of the MeetMate dashboard, featuring a meeting card grid with status badges (live, processing, ready).",
  "Post-it style sticky notes on a virtual board listing sprint tasks: 'LiveKit integration', 'RLS policies', 'Gemini prompt tuning', 'Electron wrapper'.",
  "Code editor showing a TypeScript Zod schema definition for the action_items table with fields: title, owner_name, priority, source_quote.",
];

let _descIdx = 0;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = VisualSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const { meetingId } = parsed.data;

  const meeting = meetingsStore.find((m) => m.id === meetingId);
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  // Round-robin through stub descriptions
  const description = STUB_DESCRIPTIONS[_descIdx % STUB_DESCRIPTIONS.length];
  _descIdx++;

  return NextResponse.json({ description });
}
