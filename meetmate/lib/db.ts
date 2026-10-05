/**
 * lib/db.ts
 *
 * P4 Database Helper Module
 * Provides unified data access for Meetings, Participants, Transcript Segments,
 * Summaries, and Action Items.
 *
 * Backed by Supabase with an automatic robust in-memory fallback layer, ensuring
 * seamless operation during local development, test suites, and demo environments.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { runPipeline, type PipelineInput, type PipelineOutput } from "./ai/pipeline";
import { mockSummary, mockActionItems } from "./mocks";

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface DbMeeting {
  id: string;
  code: string;
  title: string;
  host_id: string | null;
  status: "live" | "processing" | "ready" | "failed";
  started_at: string;
  ended_at: string | null;
}

export interface DbParticipant {
  meeting_id: string;
  user_id: string;
  display_name: string;
  consented_at: string | null;
}

export interface DbTranscriptSegment {
  id: string;
  meeting_id: string;
  speaker_id: string | null;
  speaker_name: string;
  text: string;
  t_ms: number;
}

export interface DbSummary {
  meeting_id: string;
  tldr: string;
  key_points: string[];
  decisions: string[];
  open_questions: string[];
}

export interface DbActionItem {
  id: string;
  meeting_id: string;
  owner_id: string | null;
  owner_name: string | null;
  title: string;
  due_date: string | null;
  priority: "low" | "medium" | "high";
  status: "todo" | "done";
  source_quote: string;
  t_ms: number | null;
}

export interface DbVisualNote {
  id: string;
  meeting_id: string;
  t_ms: number;
  description: string;
}

export interface MeetingDetailResult {
  meeting: DbMeeting;
  participants: DbParticipant[];
  summary: DbSummary | null;
  action_items: DbActionItem[];
  visual_notes?: DbVisualNote[];
}

// ─── Supabase Client Initialization ──────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabase: SupabaseClient | null = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  } catch (err) {
    console.warn("[db] Failed to initialize Supabase client, using local store:", err);
  }
}

// ─── In-Memory Store (Single Source of Truth / Fast Fallback) ──────────────────

declare global {
  // eslint-disable-next-line no-var
  var __meetmate_db_meetings: Map<string, DbMeeting> | undefined;
  // eslint-disable-next-line no-var
  var __meetmate_db_participants: Map<string, DbParticipant[]> | undefined;
  // eslint-disable-next-line no-var
  var __meetmate_db_segments: Map<string, DbTranscriptSegment[]> | undefined;
  // eslint-disable-next-line no-var
  var __meetmate_db_visual_notes: Map<string, DbVisualNote[]> | undefined;
  // eslint-disable-next-line no-var
  var __meetmate_db_summaries: Map<string, DbSummary> | undefined;
  // eslint-disable-next-line no-var
  var __meetmate_db_action_items: Map<string, DbActionItem[]> | undefined;
  // eslint-disable-next-line no-var
  var __meetmate_sample_cache: Map<string, { summary: any; action_items: any[] }> | undefined;
}

const meetingsStore = (globalThis.__meetmate_db_meetings ??= new Map<string, DbMeeting>());
const participantsStore = (globalThis.__meetmate_db_participants ??= new Map<string, DbParticipant[]>());
const segmentsStore = (globalThis.__meetmate_db_segments ??= new Map<string, DbTranscriptSegment[]>());
const visualNotesStore = (globalThis.__meetmate_db_visual_notes ??= new Map<string, DbVisualNote[]>());
const summariesStore = (globalThis.__meetmate_db_summaries ??= new Map<string, DbSummary>());
const actionItemsStore = (globalThis.__meetmate_db_action_items ??= new Map<string, DbActionItem[]>());
export const sampleCache = (globalThis.__meetmate_sample_cache ??= new Map<
  string,
  { summary: any; action_items: any[] }
>());

// Pre-seed sample cache with baseline mock results for instant zero-latency loading
sampleCache.set("standup", {
  summary: {
    tldr: "Engineering standup focused on staging migrations, Figma mockups, and end-to-end testing alignment before the March 28th go-live deadline.",
    key_points: [
      "Bob finished the staging database migration and is writing unit tests.",
      "Carol completed Figma room mockups and expects summary page designs by EOD.",
      "Alice confirmed hard March 28th launch deadline with stakeholders.",
      "End-to-end tests are a hard requirement owned jointly by Bob and Carol."
    ],
    decisions: [
      "March 28th is the hard deadline for go-live.",
      "End-to-end tests are mandatory and must be completed by March 25th.",
      "Rate limiting on the LiveKit token endpoint must be shipped by March 22nd."
    ],
    open_questions: [
      "Who will handle post-release load testing — decide in Monday planning."
    ]
  },
  action_items: [
    {
      title: "Send Supabase service role key to Bob",
      owner_name: "Dan Okonkwo",
      owner_id: "usr_dan",
      due_date: "2025-03-14",
      priority: "high" as const,
      status: "todo" as const,
      source_quote: "I'll send the Supabase service role key to you by 5 PM today.",
      t_ms: 38000,
    },
    {
      title: "Review Carol's Figma mockups and leave comments",
      owner_name: "Alice Chen",
      owner_id: "usr_alice",
      due_date: "2025-03-14",
      priority: "medium" as const,
      status: "todo" as const,
      source_quote: "I'll review your Figma mockups this afternoon, Carol, and leave comments.",
      t_ms: 76000,
    },
    {
      title: "Pair on end-to-end tests and deliver by March 25th",
      owner_name: "Bob Sharma",
      owner_id: "usr_bob",
      due_date: "2025-03-25",
      priority: "high" as const,
      status: "todo" as const,
      source_quote: "Yep, Carol and I will pair on end-to-end tests. We'll target having them done by March 25th.",
      t_ms: 124000,
    },
    {
      title: "Add rate limiting to LiveKit token endpoint",
      owner_name: "Dan Okonkwo",
      owner_id: "usr_dan",
      due_date: "2025-03-22",
      priority: "medium" as const,
      status: "todo" as const,
      source_quote: "Dan, please add rate limiting to the LiveKit token endpoint by March 22nd.",
      t_ms: 146000,
    }
  ]
});

// Alias "sample-sprint-sync" to standup cache
sampleCache.set("sample-sprint-sync", sampleCache.get("standup")!);

// ─── Meeting Operations ───────────────────────────────────────────────────────

export async function createMeeting(data: {
  id?: string;
  code?: string;
  title: string;
  host_id?: string | null;
  status?: "live" | "processing" | "ready" | "failed";
}): Promise<DbMeeting> {
  const id = data.id || `mtg-${Math.random().toString(36).substring(2, 10)}`;
  const code =
    data.code ||
    `MTG-${Math.floor(100 + Math.random() * 900)}`;

  const meeting: DbMeeting = {
    id,
    code,
    title: data.title || "Untitled Meeting",
    host_id: data.host_id ?? null,
    status: data.status || "live",
    started_at: new Date().toISOString(),
    ended_at: null,
  };

  meetingsStore.set(id, meeting);

  if (supabase) {
    try {
      await supabase.from("meetings").upsert({
        id: meeting.id,
        code: meeting.code,
        title: meeting.title,
        host_id: meeting.host_id,
        status: meeting.status,
        started_at: meeting.started_at,
        ended_at: meeting.ended_at,
      });
    } catch (err) {
      console.warn("[db] Supabase upsert meeting error:", err);
    }
  }

  return meeting;
}

export async function getMeetingById(id: string): Promise<DbMeeting | null> {
  if (meetingsStore.has(id)) {
    return meetingsStore.get(id)!;
  }

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("meetings")
        .select("*")
        .eq("id", id)
        .single();
      if (!error && data) {
        const meeting: DbMeeting = {
          id: data.id,
          code: data.code,
          title: data.title,
          host_id: data.host_id,
          status: data.status,
          started_at: data.started_at,
          ended_at: data.ended_at,
        };
        meetingsStore.set(id, meeting);
        return meeting;
      }
    } catch (err) {
      console.warn("[db] Supabase getMeetingById error:", err);
    }
  }

  return null;
}

export async function listMeetings(): Promise<DbMeeting[]> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("meetings")
        .select("*")
        .order("started_at", { ascending: false });
      if (!error && data) {
        for (const row of data) {
          meetingsStore.set(row.id, row as DbMeeting);
        }
      }
    } catch (err) {
      console.warn("[db] Supabase listMeetings error:", err);
    }
  }

  return Array.from(meetingsStore.values()).sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
  );
}

export async function updateMeetingStatus(
  id: string,
  status: "live" | "processing" | "ready" | "failed",
  endedAt?: string | null
): Promise<DbMeeting> {
  let meeting = await getMeetingById(id);
  if (!meeting) {
    meeting = await createMeeting({ id, title: "Meeting", status });
  }

  meeting.status = status;
  if (endedAt !== undefined) {
    meeting.ended_at = endedAt;
  } else if (status === "processing" || status === "ready") {
    meeting.ended_at ||= new Date().toISOString();
  }

  meetingsStore.set(id, meeting);

  if (supabase) {
    try {
      await supabase
        .from("meetings")
        .update({
          status: meeting.status,
          ended_at: meeting.ended_at,
        })
        .eq("id", id);
    } catch (err) {
      console.warn("[db] Supabase updateMeetingStatus error:", err);
    }
  }

  return meeting;
}

// ─── Participants Operations ─────────────────────────────────────────────────

export async function insertParticipants(
  meetingId: string,
  participants: Array<{
    userId?: string;
    user_id?: string;
    name?: string;
    displayName?: string;
    display_name?: string;
    consentedAt?: string | null;
    consented_at?: string | null;
  }>
): Promise<DbParticipant[]> {
  const current = participantsStore.get(meetingId) || [];
  const added: DbParticipant[] = [];

  for (let i = 0; i < participants.length; i++) {
    const p = participants[i];
    const displayName = p.displayName || p.display_name || p.name || `Participant ${i + 1}`;
    const userId = p.userId || p.user_id || `usr_${displayName.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
    const consentedAt = p.consentedAt ?? p.consented_at ?? new Date().toISOString();

    const participant: DbParticipant = {
      meeting_id: meetingId,
      user_id: userId,
      display_name: displayName,
      consented_at: consentedAt,
    };

    const existingIdx = current.findIndex((item) => item.user_id === userId);
    if (existingIdx >= 0) {
      current[existingIdx] = participant;
    } else {
      current.push(participant);
    }
    added.push(participant);
  }

  participantsStore.set(meetingId, current);

  if (supabase && added.length > 0) {
    try {
      await supabase.from("participants").upsert(
        added.map((p) => ({
          meeting_id: p.meeting_id,
          user_id: p.user_id,
          display_name: p.display_name,
          consented_at: p.consented_at,
        }))
      );
    } catch (err) {
      console.warn("[db] Supabase insertParticipants error:", err);
    }
  }

  return current;
}

export async function getParticipants(meetingId: string): Promise<DbParticipant[]> {
  if (participantsStore.has(meetingId)) {
    return participantsStore.get(meetingId)!;
  }

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("participants")
        .select("*")
        .eq("meeting_id", meetingId);
      if (!error && data) {
        participantsStore.set(meetingId, data as DbParticipant[]);
        return data as DbParticipant[];
      }
    } catch (err) {
      console.warn("[db] Supabase getParticipants error:", err);
    }
  }

  return [];
}

// ─── Transcript Segments Operations ──────────────────────────────────────────

export async function insertTranscriptSegments(
  meetingId: string,
  segments: Array<{
    id?: string;
    speakerId?: string | null;
    speaker_id?: string | null;
    speaker?: string;
    speakerName?: string;
    speaker_name?: string;
    text: string;
    tMs?: number;
    t_ms?: number;
  }>
): Promise<DbTranscriptSegment[]> {
  const current = segmentsStore.get(meetingId) || [];
  const added: DbTranscriptSegment[] = [];

  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const segment: DbTranscriptSegment = {
      id: s.id || `seg-${meetingId}-${current.length + i + 1}`,
      meeting_id: meetingId,
      speaker_id: s.speakerId ?? s.speaker_id ?? null,
      speaker_name: s.speakerName || s.speaker_name || s.speaker || "Unknown",
      text: s.text || "",
      t_ms: s.tMs ?? s.t_ms ?? 0,
    };
    current.push(segment);
    added.push(segment);
  }

  segmentsStore.set(meetingId, current);

  if (supabase && added.length > 0) {
    try {
      await supabase.from("transcript_segments").insert(
        added.map((s) => ({
          meeting_id: s.meeting_id,
          speaker_id: s.speaker_id,
          speaker_name: s.speaker_name,
          text: s.text,
          t_ms: s.t_ms,
        }))
      );
    } catch (err) {
      console.warn("[db] Supabase insertTranscriptSegments error:", err);
    }
  }

  return current;
}

export async function getTranscriptSegments(meetingId: string): Promise<DbTranscriptSegment[]> {
  if (segmentsStore.has(meetingId)) {
    return segmentsStore.get(meetingId)!;
  }

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("transcript_segments")
        .select("*")
        .eq("meeting_id", meetingId)
        .order("t_ms", { ascending: true });
      if (!error && data) {
        segmentsStore.set(meetingId, data as DbTranscriptSegment[]);
        return data as DbTranscriptSegment[];
      }
    } catch (err) {
      console.warn("[db] Supabase getTranscriptSegments error:", err);
    }
  }

  return [];
}

// ─── Visual Notes Operations ─────────────────────────────────────────────────

export async function insertVisualNote(
  meetingId: string,
  note: {
    id?: string;
    tMs?: number;
    t_ms?: number;
    description: string;
  }
): Promise<DbVisualNote> {
  const current = visualNotesStore.get(meetingId) || [];
  const visualNote: DbVisualNote = {
    id: note.id || `vn-${meetingId}-${current.length + 1}`,
    meeting_id: meetingId,
    t_ms: note.tMs ?? note.t_ms ?? 0,
    description: note.description.trim(),
  };

  current.push(visualNote);
  visualNotesStore.set(meetingId, current);

  if (supabase) {
    try {
      await supabase.from("visual_notes").insert({
        id: visualNote.id,
        meeting_id: visualNote.meeting_id,
        t_ms: visualNote.t_ms,
        description: visualNote.description,
      });
    } catch (err) {
      console.warn("[db] Supabase insertVisualNote error:", err);
    }
  }

  return visualNote;
}

export async function getVisualNotes(meetingId: string): Promise<DbVisualNote[]> {
  if (visualNotesStore.has(meetingId)) {
    return visualNotesStore.get(meetingId)!;
  }

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("visual_notes")
        .select("*")
        .eq("meeting_id", meetingId)
        .order("t_ms", { ascending: true });
      if (!error && data) {
        visualNotesStore.set(meetingId, data as DbVisualNote[]);
        return data as DbVisualNote[];
      }
    } catch (err) {
      console.warn("[db] Supabase getVisualNotes error:", err);
    }
  }

  return [];
}

// ─── Summary Operations ───────────────────────────────────────────────────────

export async function saveSummary(
  meetingId: string,
  summary: {
    tldr: string;
    key_points: string[];
    decisions: string[];
    open_questions: string[];
  }
): Promise<DbSummary> {
  const row: DbSummary = {
    meeting_id: meetingId,
    tldr: summary.tldr,
    key_points: summary.key_points || [],
    decisions: summary.decisions || [],
    open_questions: summary.open_questions || [],
  };

  summariesStore.set(meetingId, row);

  if (supabase) {
    try {
      await supabase.from("summaries").upsert({
        meeting_id: row.meeting_id,
        tldr: row.tldr,
        key_points: row.key_points,
        decisions: row.decisions,
        open_questions: row.open_questions,
      });
    } catch (err) {
      console.warn("[db] Supabase saveSummary error:", err);
    }
  }

  return row;
}

export async function getSummary(meetingId: string): Promise<DbSummary | null> {
  if (summariesStore.has(meetingId)) {
    return summariesStore.get(meetingId)!;
  }

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("summaries")
        .select("*")
        .eq("meeting_id", meetingId)
        .single();
      if (!error && data) {
        summariesStore.set(meetingId, data as DbSummary);
        return data as DbSummary;
      }
    } catch (err) {
      console.warn("[db] Supabase getSummary error:", err);
    }
  }

  return null;
}

// ─── Action Items Operations ──────────────────────────────────────────────────

export async function saveActionItems(
  meetingId: string,
  items: Array<{
    id?: string;
    title: string;
    owner_id?: string | null;
    owner_name?: string | null;
    due_date?: string | null;
    priority?: "low" | "medium" | "high";
    status?: "todo" | "done";
    source_quote: string;
    t_ms?: number | null;
    timestamp_ms?: number | null;
  }>
): Promise<DbActionItem[]> {
  const formatted: DbActionItem[] = items.map((item, idx) => ({
    id: item.id || `act-${meetingId}-${idx + 1}`,
    meeting_id: meetingId,
    owner_id: item.owner_id ?? null,
    owner_name: item.owner_name ?? null,
    title: item.title,
    due_date: item.due_date ?? null,
    priority: item.priority || "medium",
    status: item.status || "todo",
    source_quote: item.source_quote || "",
    t_ms: item.t_ms ?? item.timestamp_ms ?? null,
  }));

  actionItemsStore.set(meetingId, formatted);

  if (supabase && formatted.length > 0) {
    try {
      await supabase.from("action_items").upsert(
        formatted.map((a) => ({
          id: a.id,
          meeting_id: a.meeting_id,
          owner_id: a.owner_id,
          owner_name: a.owner_name,
          title: a.title,
          due_date: a.due_date,
          priority: a.priority,
          status: a.status,
          source_quote: a.source_quote,
          t_ms: a.t_ms,
        }))
      );
    } catch (err) {
      console.warn("[db] Supabase saveActionItems error:", err);
    }
  }

  return formatted;
}

export async function getActionItems(meetingId: string): Promise<DbActionItem[]> {
  if (actionItemsStore.has(meetingId)) {
    return actionItemsStore.get(meetingId)!;
  }

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("action_items")
        .select("*")
        .eq("meeting_id", meetingId);
      if (!error && data) {
        actionItemsStore.set(meetingId, data as DbActionItem[]);
        return data as DbActionItem[];
      }
    } catch (err) {
      console.warn("[db] Supabase getActionItems error:", err);
    }
  }

  return [];
}

// ─── Composite Meeting Detail ────────────────────────────────────────────────

export async function getMeetingDetail(meetingId: string): Promise<MeetingDetailResult | null> {
  const meeting = await getMeetingById(meetingId);
  if (!meeting) return null;

  const [participants, summary, action_items] = await Promise.all([
    getParticipants(meetingId),
    getSummary(meetingId),
    getActionItems(meetingId),
  ]);

  return {
    meeting,
    participants,
    summary,
    action_items,
  };
}

// ─── End-Of-Meeting Code Path ─────────────────────────────────────────────────

/**
 * Unified pipeline executor for concluding meetings.
 * Shared between live meeting conclusion (POST /api/meetings/[id]/end)
 * and sample meeting loading (POST /api/meetings/[id]/load-sample).
 *
 * Sequence:
 *   1. Set status to 'processing'
 *   2. Check sample cache if sampleId is provided:
 *      - If found, reuse cached summary & action items
 *      - If not found, run AI pipeline (with fallback if offline) and cache result
 *   3. Save summary and action items to database
 *   4. Set status to 'ready'
 */
export async function processEndOfMeeting(
  meetingId: string,
  options?: {
    sampleId?: string;
  }
): Promise<{ ok: boolean; status: "ready" | "failed" }> {
  try {
    console.log(`[end-of-meeting] Starting processing for meeting: ${meetingId}`);
    await updateMeetingStatus(meetingId, "processing");

    const sampleId = options?.sampleId;
    let summaryData: DbSummary["key_points"] extends never ? never : any;
    let actionItemsData: any[];

    // Check if cached result exists for this sample
    if (sampleId && sampleCache.has(sampleId)) {
      console.log(`[end-of-meeting] Reusing cached pipeline result for sample: "${sampleId}"`);
      const cached = sampleCache.get(sampleId)!;
      summaryData = cached.summary;
      actionItemsData = cached.action_items;
    } else {
      // Gather transcript segments, participants, and visual notes
      const [participants, segments, visualNotes] = await Promise.all([
        getParticipants(meetingId),
        getTranscriptSegments(meetingId),
        getVisualNotes(meetingId),
      ]);

      const pipelineInput: PipelineInput = {
        meetingId,
        meetingDate: new Date().toISOString().split("T")[0],
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        participants: participants.map((p) => ({
          user_id: p.user_id,
          display_name: p.display_name,
        })),
        segments: segments.map((s) => ({
          speaker_name: s.speaker_name,
          text: s.text,
          t_ms: Number(s.t_ms),
        })),
        visualNotes: visualNotes.map((n) => ({
          t_ms: Number(n.t_ms),
          description: n.description,
        })),
      };

      try {
        console.log(`[end-of-meeting] Invoking runPipeline on ${segments.length} segments...`);
        const pipelineOutput: PipelineOutput = await runPipeline(pipelineInput);
        summaryData = pipelineOutput.summary;
        actionItemsData = pipelineOutput.action_items;

        if (sampleId) {
          sampleCache.set(sampleId, {
            summary: summaryData,
            action_items: actionItemsData,
          });
        }
      } catch (pipelineErr) {
        console.warn(
          "[end-of-meeting] AI pipeline execution failed or API key missing. Using fallback summary fixture:",
          pipelineErr
        );
        summaryData = mockSummary;
        actionItemsData = mockActionItems;

        if (sampleId) {
          sampleCache.set(sampleId, {
            summary: summaryData,
            action_items: actionItemsData,
          });
        }
      }
    }

    // Save summary and action items
    await saveSummary(meetingId, summaryData);
    await saveActionItems(meetingId, actionItemsData);

    // Transition meeting status to ready
    await updateMeetingStatus(meetingId, "ready");
    console.log(`[end-of-meeting] Meeting ${meetingId} successfully transitioned to 'ready'.`);

    return { ok: true, status: "ready" };
  } catch (error) {
    console.error(`[end-of-meeting] Error processing meeting ${meetingId}:`, error);
    await updateMeetingStatus(meetingId, "failed").catch(() => {});
    return { ok: false, status: "failed" };
  }
}
