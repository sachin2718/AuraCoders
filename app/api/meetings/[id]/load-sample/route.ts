import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sprintSample from "@/samples/sample-sprint-sync.json";
import standupSample from "@/samples/standup.json";
import { getAuthUser, isMockMode } from "@/lib/auth";
import {
  getMeetingData,
  insertSegments,
  saveResults,
  setStatus,
  upsertParticipant,
} from "@/lib/db";
import { runPipeline } from "@/lib/ai/pipeline";
import {
  FIXTURE_ACTION_ITEMS,
  FIXTURE_SUMMARY,
  MEETING_ID,
} from "@/lib/mock-data";

const RequestSchema = z.object({
  sampleId: z.string().trim().min(1).max(80).optional().default("default"),
});

const SampleSchema = z.object({
  title: z.string().optional(),
  participants: z.array(z.record(z.string(), z.unknown())).default([]),
  segments: z.array(z.record(z.string(), z.unknown())).default([]),
  visualNotes: z.array(z.record(z.string(), z.unknown())).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: meetingId } = await params;
    const meetingData = await getMeetingData(meetingId);
    if (!meetingData.meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    const user = await getAuthUser(req);
    if (!user && !(isMockMode() && meetingId === MEETING_ID)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user && meetingData.meeting.host_id !== user.id) {
      return NextResponse.json({ error: "Only the meeting host can load a sample" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const parsedBody = RequestSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid sample request" }, { status: 400 });
    }

    const sampleId = parsedBody.data.sampleId;
    const rawSample = sampleId === "default" || sampleId === "sample-sprint-sync"
      ? sprintSample
      : sampleId === "standup"
        ? standupSample
        : null;
    if (!rawSample) {
      return NextResponse.json({ error: "Sample not found" }, { status: 404 });
    }
    const sampleResult = SampleSchema.safeParse(rawSample);
    if (!sampleResult.success) {
      return NextResponse.json({ error: "Sample data is invalid" }, { status: 500 });
    }
    const sample = sampleResult.data;

    const participants = sample.participants.map((participant, index) => {
      const displayName = String(participant.name ?? participant.display_name ?? `Participant ${index + 1}`).trim();
      const userId = String(participant.user_id ?? participant.userId ?? `sample-${index + 1}`);
      return { displayName, userId };
    });
    for (const participant of participants) {
      await upsertParticipant({ meetingId, ...participant });
    }

    const participantIds = new Map(participants.map(({ displayName, userId }) => [displayName, userId]));
    const segments = sample.segments.map((segment, index) => {
      const speakerName = String(segment.speaker ?? segment.speaker_name ?? "Unknown Speaker");
      return {
        meetingId,
        speakerId: participantIds.get(speakerName) ?? `sample-${index + 1}`,
        speakerName,
        text: String(segment.text ?? "").trim(),
        tMs: Number(segment.tMs ?? segment.t_ms ?? index * 5000),
      };
    }).filter((segment) => segment.text && Number.isFinite(segment.tMs));

    await setStatus(meetingId, "processing");
    await insertSegments(segments);

    // The mock demo remains usable without an AI key. Real/sample processing uses
    // the same validated P3 pipeline as the normal end-meeting route.
    if (isMockMode() && !process.env.GEMINI_API_KEY && !process.env.LLM_API_KEY) {
      await saveResults(meetingId, {
        summary: FIXTURE_SUMMARY,
        actionItems: FIXTURE_ACTION_ITEMS,
      });
    } else {
      const result = await runPipeline({
        meetingId,
        meetingDate: meetingData.meeting.started_at,
        timezone: process.env.MEETING_TIMEZONE || "UTC",
        participants: participants.map(({ userId, displayName }) => ({ user_id: userId, display_name: displayName })),
        segments: segments.map(({ speakerName, text, tMs }) => ({ speaker_name: speakerName, text, t_ms: tMs })),
        visualNotes: (sample.visualNotes ?? []).map((note) => ({
          t_ms: Number(note.tMs ?? note.t_ms ?? 0),
          description: String(note.description ?? ""),
        })),
      });
      await saveResults(meetingId, {
        summary: result.summary,
        actionItems: result.action_items.map((item) => ({
          owner_id: item.owner_id,
          owner_name: item.owner_name,
          title: item.title,
          due_date: item.due_date,
          priority: item.priority,
          status: "todo" as const,
          source_quote: item.source_quote,
          t_ms: item.timestamp_ms,
        })),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const { id } = await params;
    console.error(`[load-sample:${id}]`, error instanceof Error ? error.message : "Unknown error");
    try {
      await setStatus(id, "failed");
    } catch {
      // The meeting may have disappeared while processing.
    }
    return NextResponse.json({ error: "Could not process sample meeting" }, { status: 500 });
  }
}
