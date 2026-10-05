/**
 * lib/mock-data.ts
 * Central fixture store for all stub API endpoints.
 * No database access — everything lives in memory per-process.
 * Replace with real DB calls in later sprints.
 */

// No external uuid package needed — crypto.randomUUID() is built into Node 18+ and the Web platform.

// ─── Types (mirroring the DB schema) ────────────────────────────────────────

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
}

// ─── Stable IDs ─────────────────────────────────────────────────────────────

export const MEETING_ID = "a1b2c3d4-0000-0000-0000-000000000001";
export const MEETING_CODE = "MEET-2025";

export const USER_IDS = {
  priya: "user-priya-0001",
  arjun: "user-arjun-0002",
  meera: "user-meera-0003",
  sam: "user-sam-0004",
};

// ─── Fixture: Meeting ────────────────────────────────────────────────────────

export const FIXTURE_MEETING: Meeting = {
  id: MEETING_ID,
  code: MEETING_CODE,
  title: "Q4 Product Planning - MeetMate Demo",
  host_id: USER_IDS.priya,
  status: "ready", // overridden by polling counter (see getMeetingStatus)
  started_at: "2025-10-05T09:00:00.000Z",
  ended_at: "2025-10-05T10:00:00.000Z",
};

// ─── Polling simulation: first 3 GETs → "processing", then "ready" ──────────
// Stored as a plain object so it survives across route calls in the same process.
const _pollCounters: Record<string, number> = {};

export function getMeetingStatus(meetingId: string): MeetingStatus {
  _pollCounters[meetingId] = (_pollCounters[meetingId] ?? 0) + 1;
  return _pollCounters[meetingId] <= 3 ? "processing" : "ready";
}

export function resetPollCounter(meetingId: string) {
  _pollCounters[meetingId] = 0;
}

// ─── Fixture: Participants ───────────────────────────────────────────────────

export const FIXTURE_PARTICIPANTS: Participant[] = [
  {
    meeting_id: MEETING_ID,
    user_id: USER_IDS.priya,
    display_name: "Priya",
    consented_at: "2025-10-05T09:00:30.000Z",
  },
  {
    meeting_id: MEETING_ID,
    user_id: USER_IDS.arjun,
    display_name: "Arjun",
    consented_at: "2025-10-05T09:01:00.000Z",
  },
  {
    meeting_id: MEETING_ID,
    user_id: USER_IDS.meera,
    display_name: "Meera",
    consented_at: "2025-10-05T09:01:30.000Z",
  },
  {
    meeting_id: MEETING_ID,
    user_id: USER_IDS.sam,
    display_name: "Sam",
    consented_at: null, // Sam hasn't consented yet
  },
];

// ─── Fixture: Summary ────────────────────────────────────────────────────────

export const FIXTURE_SUMMARY: Summary = {
  meeting_id: MEETING_ID,
  tldr:
    "The team aligned on shipping the AI summary feature by Oct 12, agreed to drop real-time translation from scope, and identified three open technical risks that need owners before the next standup.",
  key_points: [
    "AI summary MVP scoped to post-meeting mode only; live captioning deferred to v2.",
    "Transcript architecture: each browser transcribes its own mic via Web Speech API and POSTs final sentences to /api/transcript.",
    "LiveKit free tier supports up to 100 concurrent participants — sufficient for the hackathon demo.",
    "Supabase row-level security to ensure each user sees only their own action items.",
    "Demo script: use load-sample endpoint to seed a finished meeting without running a real call.",
  ],
  decisions: [
    "Ship AI summary (post-meeting) in the hackathon build; defer live captioning.",
    "Drop real-time translation — out of scope for the 24-hour window.",
    "Use Gemini Flash (free tier) as the sole LLM; no fallback model.",
    "Vercel Hobby tier for hosting; no custom domain for the demo.",
  ],
  open_questions: [
    "Who owns the Supabase RLS policy review before Friday?",
    "Do we need consent banners per GDPR for the hackathon judges demo?",
    "What happens if the Gemini API rate-limits during the live demo?",
  ],
};

// ─── Fixture: Action Items ───────────────────────────────────────────────────

export const FIXTURE_ACTION_ITEMS: ActionItem[] = [
  {
    id: "ai-0001",
    meeting_id: MEETING_ID,
    owner_id: USER_IDS.priya,
    owner_name: "Priya",
    title: "Write Supabase RLS policies for action_items and summaries tables",
    due_date: "2025-10-08",
    priority: "high",
    status: "todo",
    source_quote:
      "Priya: I'll handle the row-level security policies — I need them done by Wednesday so QA can test the privacy guarantees.",
    t_ms: 1200000,
  },
  {
    id: "ai-0002",
    meeting_id: MEETING_ID,
    owner_id: USER_IDS.arjun,
    owner_name: "Arjun",
    title: "Integrate LiveKit token endpoint and test multi-participant video grid",
    due_date: "2025-10-07",
    priority: "high",
    status: "todo",
    source_quote:
      "Arjun: I can have the LiveKit token endpoint wired up by tomorrow evening and run a quick 4-person test call.",
    t_ms: 900000,
  },
  {
    id: "ai-0003",
    meeting_id: MEETING_ID,
    owner_id: USER_IDS.meera,
    owner_name: "Meera",
    title: "Build the /api/transcript ingest route with Zod validation",
    due_date: "2025-10-07",
    priority: "medium",
    status: "todo",
    source_quote:
      "Meera: transcript ingestion is straightforward — I'll add Zod validation and return {ok:true} by end of day.",
    t_ms: 1500000,
  },
  {
    id: "ai-0004",
    meeting_id: MEETING_ID,
    owner_id: USER_IDS.sam,
    owner_name: "Sam",
    title: "Set up Electron wrapper skeleton in desktop/ folder",
    due_date: "2025-10-09",
    priority: "low",
    status: "todo",
    source_quote:
      "Sam: I'll stub out the desktop folder with a minimal Electron shell — nothing fancy, just enough to package the app as a Windows exe.",
    t_ms: 2700000,
  },
  {
    id: "ai-0005",
    meeting_id: MEETING_ID,
    owner_id: USER_IDS.priya,
    owner_name: "Priya",
    title: "Create demo sample fixture (load-sample endpoint) with 4 participants",
    due_date: "2025-10-06",
    priority: "high",
    status: "done",
    source_quote:
      "Priya: the load-sample endpoint is the safest fallback during the live demo — let me own that and have it ready by tomorrow morning.",
    t_ms: 3000000,
  },
  {
    id: "ai-0006",
    meeting_id: MEETING_ID,
    owner_id: null, // intentionally unassigned
    owner_name: null,
    title: "Decide on GDPR consent banner copy and flow before hackathon submission",
    due_date: null,
    priority: "medium",
    status: "todo",
    source_quote:
      "We need someone to own the consent UX — it's unclear who, but it has to be settled before we submit.",
    t_ms: 3300000,
  },
];

// ─── In-memory stores (for POST endpoints) ──────────────────────────────────

// Meetings list (new meetings created via POST get appended here)
export const meetingsStore: Meeting[] = [{ ...FIXTURE_MEETING }];

// Transcript segments (accumulated via POST /api/transcript)
export const transcriptStore: TranscriptSegment[] = [
  {
    id: "seg-001",
    meeting_id: MEETING_ID,
    speaker_id: USER_IDS.priya,
    speaker_name: "Priya",
    text: "Alright everyone, let's kick off. Today we're locking the scope for the hackathon build.",
    t_ms: 0,
  },
  {
    id: "seg-002",
    meeting_id: MEETING_ID,
    speaker_id: USER_IDS.arjun,
    speaker_name: "Arjun",
    text: "Sounds good. I've been looking at the LiveKit free tier — 100 concurrent participants should be plenty.",
    t_ms: 15000,
  },
  {
    id: "seg-003",
    meeting_id: MEETING_ID,
    speaker_id: USER_IDS.meera,
    speaker_name: "Meera",
    text: "Agreed. And the Web Speech API approach for transcription means we don't need a server-side STT budget.",
    t_ms: 30000,
  },
  {
    id: "seg-004",
    meeting_id: MEETING_ID,
    speaker_id: USER_IDS.sam,
    speaker_name: "Sam",
    text: "Quick question — are we shipping the Electron wrapper in 24 hours or is that a stretch?",
    t_ms: 45000,
  },
];

// Todos store (mutable status updates via PATCH)
export const todosStore: (ActionItem & { meeting_title: string })[] =
  FIXTURE_ACTION_ITEMS.map((item) => ({
    ...item,
    meeting_title: FIXTURE_MEETING.title,
  }));

// ─── Helper ─────────────────────────────────────────────────────────────────

export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso() {
  return new Date().toISOString();
}
