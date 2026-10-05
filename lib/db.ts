/**
 * lib/db.ts
 * Typed database helper functions for MeetMate.
 *
 * CONSTRAINTS:
 * - Server-only code: must NEVER be imported in client components.
 * - Never log secret keys or sensitive tokens.
 * - Works against Supabase via getSupabaseServerClient() when configured.
 * - Provides zero-config in-memory fallback for local testing & CI without live Supabase.
 */

if (typeof window !== "undefined") {
  throw new Error(
    "Security Violation: lib/db.ts is a server-only database module and must never be imported in client components."
  );
}

import { getSupabaseServerClient, isSupabaseConfigured } from "./supabase";

// ─── Entity Types ────────────────────────────────────────────────────────────

export type MeetingStatus = "live" | "processing" | "ready" | "failed";

export interface Meeting {
  id: string;
  code: string;
  title: string;
  host_id: string;
  status: MeetingStatus;
  started_at: string;
  ended_at: string | null;
}

export interface Participant {
  id?: string;
  meeting_id: string;
  user_id: string;
  display_name: string;
  consented_at: string | null;
}

export interface TranscriptSegment {
  id: string;
  meeting_id: string;
  speaker_id: string;
  speaker_name: string;
  text: string;
  t_ms: number;
  created_at?: string;
}

export interface VisualNote {
  id: string;
  meeting_id: string;
  t_ms: number;
  description: string;
  image_url?: string | null;
  created_at?: string;
}

export interface Summary {
  meeting_id: string;
  tldr: string;
  key_points: string[];
  decisions: string[];
  open_questions: string[];
}

export interface ActionItem {
  id: string;
  meeting_id: string;
  owner_id: string | null;
  owner_name: string | null;
  title: string;
  due_date: string | null;
  priority: "low" | "medium" | "high";
  status: "todo" | "done";
  source_quote: string;
  t_ms: number;
  created_at?: string;
}

export interface MeetingData {
  meeting: Meeting | null;
  participants: Participant[];
  segments: TranscriptSegment[];
  visualNotes: VisualNote[];
}

// ─── Code Generation ─────────────────────────────────────────────────────────

// 32-character unambiguous charset (no 0/O, 1/I to prevent human misreads)
const READABLE_CHARSET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateReadableCode(length = 8): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    const idx = Math.floor(Math.random() * READABLE_CHARSET.length);
    result += READABLE_CHARSET[idx];
  }
  return result;
}

// ─── In-Memory Fallback Store (for local dev/tests without live Supabase) ────

interface MockStore {
  meetings: Map<string, Meeting>;
  participants: Map<string, Participant>; // key: `${meetingId}:${userId}`
  segments: TranscriptSegment[];
  visualNotes: VisualNote[];
  summaries: Map<string, Summary>; // key: meetingId
  actionItems: Map<string, ActionItem>; // key: id
}

const DEMO_MEETING: Meeting = {
  id: "a1b2c3d4-0000-0000-0000-000000000001",
  code: "MEET-2025",
  title: "Q4 Product Planning - MeetMate Demo",
  host_id: "user-priya-01",
  status: "live",
  started_at: "2025-10-05T09:00:00.000Z",
  ended_at: null,
};

const mockStore: MockStore = {
  meetings: new Map([[DEMO_MEETING.id, { ...DEMO_MEETING }]]),
  participants: new Map(),
  segments: [],
  visualNotes: [],
  summaries: new Map(),
  actionItems: new Map(),
};

export function getMockStore(): MockStore {
  return mockStore;
}

export function resetMockStore(): void {
  mockStore.meetings.clear();
  mockStore.meetings.set(DEMO_MEETING.id, { ...DEMO_MEETING });
  mockStore.participants.clear();
  mockStore.segments = [];
  mockStore.visualNotes = [];
  mockStore.summaries.clear();
  mockStore.actionItems.clear();
}

// ─── Database Helpers ────────────────────────────────────────────────────────

/**
 * 1. createMeeting({ title, hostId })
 * Creates a meeting with a unique 8-character human-readable code.
 */
export async function createMeeting({
  title,
  hostId,
}: {
  title: string;
  hostId: string;
}): Promise<Meeting> {
  const code = generateReadableCode(8);
  const now = new Date().toISOString();
  const meetingId = crypto.randomUUID();

  const meeting: Meeting = {
    id: meetingId,
    code,
    title: title.trim(),
    host_id: hostId,
    status: "live",
    started_at: now,
    ended_at: null,
  };

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("meetings")
      .insert([meeting])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create meeting in Supabase: ${error.message}`);
    }
    return data as Meeting;
  }

  // Fallback
  mockStore.meetings.set(meeting.id, { ...meeting });
  return { ...meeting };
}

/**
 * 2. getMeetingByCode(code)
 * Finds a meeting by its 8-character readable code (case-insensitive).
 */
export async function getMeetingByCode(code: string): Promise<Meeting | null> {
  const normalizedCode = code.trim().toUpperCase();

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("meetings")
      .select("*")
      .ilike("code", normalizedCode)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to get meeting by code: ${error.message}`);
    }
    return (data as Meeting) || null;
  }

  // Fallback
  for (const m of mockStore.meetings.values()) {
    if (m.code.toUpperCase() === normalizedCode) {
      return { ...m };
    }
  }
  return null;
}

/**
 * 3. getMeetingData(meetingId)
 * Returns { meeting, participants, segments, visualNotes }
 */
export async function getMeetingData(meetingId: string): Promise<MeetingData> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServerClient();
    const [mRes, pRes, sRes, vRes] = await Promise.all([
      supabase.from("meetings").select("*").eq("id", meetingId).maybeSingle(),
      supabase
        .from("participants")
        .select("*")
        .eq("meeting_id", meetingId)
        .order("consented_at", { ascending: true, nullsFirst: false }),
      supabase
        .from("transcript_segments")
        .select("*")
        .eq("meeting_id", meetingId)
        .order("t_ms", { ascending: true }),
      supabase
        .from("visual_notes")
        .select("*")
        .eq("meeting_id", meetingId)
        .order("t_ms", { ascending: true }),
    ]);

    if (mRes.error) throw new Error(mRes.error.message);
    if (pRes.error) throw new Error(pRes.error.message);
    if (sRes.error) throw new Error(sRes.error.message);
    if (vRes.error) throw new Error(vRes.error.message);

    return {
      meeting: (mRes.data as Meeting) || null,
      participants: (pRes.data as Participant[]) || [],
      segments: (sRes.data as TranscriptSegment[]) || [],
      visualNotes: (vRes.data as VisualNote[]) || [],
    };
  }

  // Fallback
  const meeting = mockStore.meetings.get(meetingId) || null;
  const participants = Array.from(mockStore.participants.values()).filter(
    (p) => p.meeting_id === meetingId
  );
  const segments = mockStore.segments
    .filter((s) => s.meeting_id === meetingId)
    .sort((a, b) => a.t_ms - b.t_ms);
  const visualNotes = mockStore.visualNotes
    .filter((v) => v.meeting_id === meetingId)
    .sort((a, b) => a.t_ms - b.t_ms);

  return {
    meeting: meeting ? { ...meeting } : null,
    participants: participants.map((p) => ({ ...p })),
    segments: segments.map((s) => ({ ...s })),
    visualNotes: visualNotes.map((v) => ({ ...v })),
  };
}

export interface MeetingDetails {
  meeting: Meeting | null;
  participants: Participant[];
  summary?: Summary;
  action_items?: ActionItem[];
}

/**
 * Returns meeting, participants, and if available, summary and action items.
 */
export async function getMeetingDetails(
  meetingId: string
): Promise<MeetingDetails> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServerClient();
    const [mRes, pRes, sRes, aRes] = await Promise.all([
      supabase.from("meetings").select("*").eq("id", meetingId).maybeSingle(),
      supabase
        .from("participants")
        .select("*")
        .eq("meeting_id", meetingId)
        .order("consented_at", { ascending: true, nullsFirst: false }),
      supabase
        .from("summaries")
        .select("*")
        .eq("meeting_id", meetingId)
        .maybeSingle(),
      supabase
        .from("action_items")
        .select("*")
        .eq("meeting_id", meetingId)
        .order("created_at", { ascending: true }),
    ]);

    if (mRes.error) throw new Error(mRes.error.message);

    return {
      meeting: (mRes.data as Meeting) || null,
      participants: (pRes.data as Participant[]) || [],
      summary: (sRes.data as Summary) || undefined,
      action_items: (aRes.data as ActionItem[]) || undefined,
    };
  }

  // Fallback / In-Memory
  const meeting = mockStore.meetings.get(meetingId) || null;
  const participants = Array.from(mockStore.participants.values()).filter(
    (p) => p.meeting_id === meetingId
  );
  const summary = mockStore.summaries.get(meetingId);
  const actionItems = Array.from(mockStore.actionItems.values()).filter(
    (a) => a.meeting_id === meetingId
  );

  return {
    meeting: meeting ? { ...meeting } : null,
    participants: participants.map((p) => ({ ...p })),
    summary: summary ? { ...summary } : undefined,
    action_items:
      actionItems.length > 0 ? actionItems.map((a) => ({ ...a })) : undefined,
  };
}

/**
 * 4. upsertParticipant({ meetingId, userId, displayName })
 * Registers or updates a participant for a meeting.
 */
export async function upsertParticipant({
  meetingId,
  userId,
  displayName,
}: {
  meetingId: string;
  userId: string;
  displayName: string;
}): Promise<Participant> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("participants")
      .upsert(
        {
          meeting_id: meetingId,
          user_id: userId,
          display_name: displayName,
        },
        { onConflict: "meeting_id,user_id" }
      )
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to upsert participant: ${error.message}`);
    }
    return data as Participant;
  }

  // Fallback
  const key = `${meetingId}:${userId}`;
  const existing = mockStore.participants.get(key);
  const participant: Participant = {
    id: existing?.id || crypto.randomUUID(),
    meeting_id: meetingId,
    user_id: userId,
    display_name: displayName,
    consented_at: existing?.consented_at ?? null,
  };
  mockStore.participants.set(key, participant);
  return { ...participant };
}

/**
 * 5. markConsent(meetingId, userId)
 * Records that a participant has given audio/recording consent.
 */
export async function markConsent(
  meetingId: string,
  userId: string
): Promise<Participant> {
  const consentedAt = new Date().toISOString();

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("participants")
      .update({ consented_at: consentedAt })
      .eq("meeting_id", meetingId)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to mark consent: ${error.message}`);
    }
    return data as Participant;
  }

  // Fallback
  const key = `${meetingId}:${userId}`;
  let p = mockStore.participants.get(key);
  if (!p) {
    p = {
      id: crypto.randomUUID(),
      meeting_id: meetingId,
      user_id: userId,
      display_name: userId,
      consented_at: consentedAt,
    };
  } else {
    p = { ...p, consented_at: consentedAt };
  }
  mockStore.participants.set(key, p);
  return { ...p };
}

/**
 * 6. insertSegment({ meetingId, speakerId, speakerName, text, tMs })
 * Appends a single speech segment to the meeting transcript.
 */
export async function insertSegment({
  meetingId,
  speakerId,
  speakerName,
  text,
  tMs,
}: {
  meetingId: string;
  speakerId: string;
  speakerName: string;
  text: string;
  tMs: number;
}): Promise<TranscriptSegment> {
  const segment: TranscriptSegment = {
    id: crypto.randomUUID(),
    meeting_id: meetingId,
    speaker_id: speakerId,
    speaker_name: speakerName,
    text,
    t_ms: tMs,
    created_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("transcript_segments")
      .insert([segment])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to insert transcript segment: ${error.message}`);
    }
    return data as TranscriptSegment;
  }

  // Fallback
  mockStore.segments.push({ ...segment });
  return { ...segment };
}

/**
 * 7. insertSegments(rows[])
 * Batch inserts transcript segments.
 */
export async function insertSegments(
  rows: Array<{
    meetingId: string;
    speakerId: string;
    speakerName: string;
    text: string;
    tMs: number;
  }>
): Promise<TranscriptSegment[]> {
  const segments: TranscriptSegment[] = rows.map((r) => ({
    id: crypto.randomUUID(),
    meeting_id: r.meetingId,
    speaker_id: r.speakerId,
    speaker_name: r.speakerName,
    text: r.text,
    t_ms: r.tMs,
    created_at: new Date().toISOString(),
  }));

  if (segments.length === 0) return [];

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("transcript_segments")
      .insert(segments)
      .select();

    if (error) {
      throw new Error(`Failed to batch insert segments: ${error.message}`);
    }
    return (data as TranscriptSegment[]) || [];
  }

  // Fallback
  for (const s of segments) {
    mockStore.segments.push({ ...s });
  }
  return segments.map((s) => ({ ...s }));
}

/**
 * 8. setStatus(meetingId, status)
 * Updates the meeting status ('live', 'processing', 'ready', 'failed').
 */
export async function setStatus(
  meetingId: string,
  status: MeetingStatus
): Promise<Meeting> {
  const updates: Partial<Meeting> = { status };
  if (status === "processing" || status === "ready" || status === "failed") {
    updates.ended_at = new Date().toISOString();
  }

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("meetings")
      .update(updates)
      .eq("id", meetingId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update meeting status: ${error.message}`);
    }
    return data as Meeting;
  }

  // Fallback
  const meeting = mockStore.meetings.get(meetingId);
  if (!meeting) {
    throw new Error(`Meeting ${meetingId} not found`);
  }
  const updated = {
    ...meeting,
    ...updates,
  };
  mockStore.meetings.set(meetingId, updated);
  return { ...updated };
}

/**
 * 9. saveResults(meetingId, { summary, actionItems })
 * Saves AI summary and per-participant action items.
 */
export async function saveResults(
  meetingId: string,
  {
    summary,
    actionItems,
  }: {
    summary: Omit<Summary, "meeting_id"> | Summary;
    actionItems: Array<Omit<ActionItem, "id" | "meeting_id"> | ActionItem>;
  }
): Promise<{ summary: Summary; actionItems: ActionItem[] }> {
  const summaryRow: Summary = {
    meeting_id: meetingId,
    tldr: summary.tldr,
    key_points: summary.key_points,
    decisions: summary.decisions,
    open_questions: summary.open_questions,
  };

  const actionItemRows: ActionItem[] = actionItems.map((item) => ({
    id: "id" in item && item.id ? item.id : crypto.randomUUID(),
    meeting_id: meetingId,
    owner_id: item.owner_id ?? null,
    owner_name: item.owner_name ?? null,
    title: item.title,
    due_date: item.due_date ?? null,
    priority: item.priority ?? "medium",
    status: item.status ?? "todo",
    source_quote: item.source_quote ?? "",
    t_ms: item.t_ms ?? 0,
    created_at: new Date().toISOString(),
  }));

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServerClient();

    // 1. Upsert summary
    const sRes = await supabase
      .from("summaries")
      .upsert(summaryRow, { onConflict: "meeting_id" })
      .select()
      .single();
    if (sRes.error) throw new Error(`Failed to save summary: ${sRes.error.message}`);

    // 2. Clear old action items if retrying, then insert new items
    await supabase.from("action_items").delete().eq("meeting_id", meetingId);
    let savedItems: ActionItem[] = [];
    if (actionItemRows.length > 0) {
      const aRes = await supabase
        .from("action_items")
        .insert(actionItemRows)
        .select();
      if (aRes.error) throw new Error(`Failed to save action items: ${aRes.error.message}`);
      savedItems = aRes.data as ActionItem[];
    }

    // 3. Mark meeting as ready
    await supabase
      .from("meetings")
      .update({ status: "ready" })
      .eq("id", meetingId);

    return {
      summary: sRes.data as Summary,
      actionItems: savedItems,
    };
  }

  // Fallback
  mockStore.summaries.set(meetingId, { ...summaryRow });
  for (const [key, item] of Array.from(mockStore.actionItems.entries())) {
    if (item.meeting_id === meetingId) {
      mockStore.actionItems.delete(key);
    }
  }
  for (const item of actionItemRows) {
    mockStore.actionItems.set(item.id, { ...item });
  }
  const meeting = mockStore.meetings.get(meetingId);
  if (meeting) {
    mockStore.meetings.set(meetingId, { ...meeting, status: "ready" });
  }

  return {
    summary: { ...summaryRow },
    actionItems: actionItemRows.map((a) => ({ ...a })),
  };
}

/**
 * 10. listMeetingsForUser(userId)
 * Lists meetings where user is host or participant, ordered by started_at DESC.
 */
export async function listMeetingsForUser(userId: string): Promise<Meeting[]> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServerClient();

    const { data: participations } = await supabase
      .from("participants")
      .select("meeting_id")
      .eq("user_id", userId);

    const participantMeetingIds = Array.from(
      new Set((participations || []).map((p) => p.meeting_id))
    );

    let query = supabase.from("meetings").select("*");
    if (participantMeetingIds.length > 0) {
      query = query.or(
        `host_id.eq.${userId},id.in.(${participantMeetingIds.join(",")})`
      );
    } else {
      query = query.eq("host_id", userId);
    }

    const { data, error } = await query.order("started_at", {
      ascending: false,
    });
    if (error) {
      throw new Error(`Failed to list meetings: ${error.message}`);
    }
    return (data as Meeting[]) || [];
  }

  // Fallback
  const result: Meeting[] = [];
  const participantMeetingIds = new Set<string>();
  for (const p of mockStore.participants.values()) {
    if (p.user_id === userId) {
      participantMeetingIds.add(p.meeting_id);
    }
  }

  for (const m of mockStore.meetings.values()) {
    if (m.host_id === userId || participantMeetingIds.has(m.id)) {
      result.push({ ...m });
    }
  }

  return result.sort(
    (a, b) =>
      new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
  );
}

/**
 * 11. getTodosForUser(userId)
 * Returns action items for the user, with joined meeting title, ordered by due_date nulls last.
 */
export async function getTodosForUser(
  userId: string
): Promise<Array<ActionItem & { meeting_title?: string }>> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("action_items")
      .select("*, meetings(title)")
      .eq("owner_id", userId)
      .order("due_date", { ascending: true, nullsFirst: false });

    if (error) {
      throw new Error(`Failed to get todos for user: ${error.message}`);
    }

    type DbItem = ActionItem & {
      meetings?: { title: string } | null;
    };

    return ((data as DbItem[]) || []).map((item) => ({
      id: item.id,
      meeting_id: item.meeting_id,
      owner_id: item.owner_id,
      owner_name: item.owner_name,
      title: item.title,
      due_date: item.due_date,
      priority: item.priority,
      status: item.status,
      source_quote: item.source_quote,
      t_ms: item.t_ms,
      created_at: item.created_at,
      meeting_title: item.meetings?.title,
    }));
  }

  // Fallback
  const results: Array<ActionItem & { meeting_title?: string }> = [];
  for (const item of mockStore.actionItems.values()) {
    if (item.owner_id === userId) {
      const meeting = mockStore.meetings.get(item.meeting_id);
      results.push({
        ...item,
        meeting_title: meeting?.title,
      });
    }
  }

  // Ordered by due_date nulls last (earlier dates first, nulls at the end)
  return results.sort((a, b) => {
    if (a.due_date && b.due_date) {
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    }
    if (a.due_date && !b.due_date) return -1;
    if (!a.due_date && b.due_date) return 1;
    return 0;
  });
}

/**
 * 12. getActionItem(id)
 * Fetches a single action item by ID.
 */
export async function getActionItem(id: string): Promise<ActionItem | null> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("action_items")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to get action item: ${error.message}`);
    }
    return (data as ActionItem) || null;
  }

  // Fallback
  const item = mockStore.actionItems.get(id);
  if (item) {
    return { ...item };
  }
  return null;
}

/**
 * 13. updateTodoStatus(id, userId, status)
 * Updates the status ('todo' | 'done') of an action item.
 */
export async function updateTodoStatus(
  id: string,
  userId: string,
  status: "todo" | "done"
): Promise<ActionItem> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServerClient();
    let query = supabase
      .from("action_items")
      .update({ status })
      .eq("id", id);

    if (userId) {
      query = query.eq("owner_id", userId);
    }

    const { data, error } = await query.select().single();
    if (error) {
      throw new Error(`Failed to update todo status: ${error.message}`);
    }
    return data as ActionItem;
  }

  // Fallback
  const item = mockStore.actionItems.get(id);
  if (!item) {
    throw new Error(`Action item ${id} not found`);
  }
  if (userId && item.owner_id && item.owner_id !== userId) {
    throw new Error(`Action item ${id} does not belong to user ${userId}`);
  }

  const updated: ActionItem = {
    ...item,
    status,
  };
  mockStore.actionItems.set(id, updated);
  return { ...updated };
}
