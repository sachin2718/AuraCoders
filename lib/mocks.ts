import {
  Meeting,
  Participant,
  Summary,
  ActionItem,
  TodoItem,
  MeetingDetail,
  MeetingListItem,
  LivekitTokenResponse,
} from "./types";

export const MOCK_MEETING_ID = "demo-meeting-1";

export const mockParticipants: Participant[] = [
  {
    meeting_id: MOCK_MEETING_ID,
    user_id: "user-priya-01",
    display_name: "Priya Sharma",
    consented_at: "2026-10-05T09:00:15.000Z",
  },
  {
    meeting_id: MOCK_MEETING_ID,
    user_id: "user-arjun-02",
    display_name: "Arjun Mehta",
    consented_at: "2026-10-05T09:00:22.000Z",
  },
  {
    meeting_id: MOCK_MEETING_ID,
    user_id: "user-meera-03",
    display_name: "Meera Patel",
    consented_at: "2026-10-05T09:00:30.000Z",
  },
  {
    meeting_id: MOCK_MEETING_ID,
    user_id: "user-sam-04",
    display_name: "Sam Wilson",
    consented_at: "2026-10-05T09:00:45.000Z",
  },
];

export const mockMeeting: Meeting = {
  id: MOCK_MEETING_ID,
  code: "DEMO-882",
  title: "MeetMate Sprint Planning & Architecture Sync",
  host_id: "user-priya-01",
  status: "ready",
  started_at: "2026-10-05T09:00:00.000Z",
  ended_at: "2026-10-05T09:45:00.000Z",
};

export const mockSummary: Summary = {
  meeting_id: MOCK_MEETING_ID,
  tldr: "Team finalized the core architecture for MeetMate: client-side Web Speech transcription for per-user capture, LiveKit Cloud for low-latency A/V and data channel chat, and Google Gemini Flash for post-meeting structured summary and action item extraction. All 24h hackathon workstreams were agreed upon.",
  key_points: [
    "Agreed to run SpeechRecognition client-side per participant to eliminate expensive server-side audio ingestion.",
    "LiveKit Cloud will handle real-time audio/video tracks and in-meeting chat messages via data channel.",
    "Post-meeting background pipeline invokes callLLM(prompt) with complete transcript to populate summaries and action items.",
    "Individual participant to-dos view will filter action items matching the user's name or authenticated user ID.",
  ],
  decisions: [
    "Use client-side Web Speech API with audio-chunk fallback.",
    "Store timestamps in milliseconds (t_ms) to display exact transcript source quote jumps in UI.",
    "Rely 100% on zero-cost free tiers (Supabase, LiveKit Cloud, Gemini Flash).",
  ],
  open_questions: [
    "Will Chrome Web Speech API handle intermittent disconnections during longer calls?",
    "Do we need a fallback audio record worker when running in unsupported browsers like Firefox?",
  ],
};

export const mockActionItems: ActionItem[] = [
  {
    id: "action-1",
    meeting_id: MOCK_MEETING_ID,
    owner_id: "user-priya-01",
    owner_name: "Priya",
    title: "Draft product requirements doc and hackathon pitch deck",
    due_date: "2026-10-06",
    priority: "high",
    status: "todo",
    source_quote: "I will finalize the hackathon slide deck and have the PRD deliverables ready by tomorrow morning.",
    t_ms: 320000,
  },
  {
    id: "action-2",
    meeting_id: MOCK_MEETING_ID,
    owner_id: "user-arjun-02",
    owner_name: "Arjun",
    title: "Set up LiveKit Cloud room configuration and token generator endpoint",
    due_date: "2026-10-05",
    priority: "high",
    status: "done",
    source_quote: "I'll take care of the LiveKit server credentials and wire up the token generation endpoint today.",
    t_ms: 615000,
  },
  {
    id: "action-3",
    meeting_id: MOCK_MEETING_ID,
    owner_id: "user-meera-03",
    owner_name: "Meera",
    title: "Design dark-mode meeting room layout and summary card UI in Figma",
    due_date: "2026-10-05",
    priority: "medium",
    status: "done",
    source_quote: "I can deliver the high-fidelity UI components for the call room and summary drawer this afternoon.",
    t_ms: 840000,
  },
  {
    id: "action-4",
    meeting_id: MOCK_MEETING_ID,
    owner_id: "user-sam-04",
    owner_name: "Sam",
    title: "Implement Web Speech recognition hook with micro-buffering in the frontend",
    due_date: "2026-10-06",
    priority: "high",
    status: "todo",
    source_quote: "I'll build the speech recognition hook and stream transcript chunks with their millisecond timestamps.",
    t_ms: 1220000,
  },
  {
    id: "action-5",
    meeting_id: MOCK_MEETING_ID,
    owner_id: "user-priya-01",
    owner_name: "Priya",
    title: "Curate 3 realistic sample meeting transcripts for end-to-end evaluation",
    due_date: "2026-10-07",
    priority: "low",
    status: "todo",
    source_quote: "I'll record and curate three sample transcripts so we can test the Gemini summarizer reliably.",
    t_ms: 1540000,
  },
  {
    id: "action-6",
    meeting_id: MOCK_MEETING_ID,
    owner_id: null,
    owner_name: null, // Unassigned
    title: "Benchmark latency of Gemini Flash summary generation on long transcripts",
    due_date: null,
    priority: "medium",
    status: "todo",
    source_quote: "Someone needs to benchmark whether Gemini Flash handles 45-minute transcript payloads within our timeout.",
    t_ms: 1890000,
  },
];

export const mockMeetingDetail: MeetingDetail = {
  meeting: mockMeeting,
  participants: mockParticipants,
  summary: mockSummary,
  action_items: mockActionItems,
};

export const mockMeetingsList: MeetingListItem[] = [
  {
    id: mockMeeting.id,
    code: mockMeeting.code,
    title: mockMeeting.title,
    status: mockMeeting.status,
    started_at: mockMeeting.started_at,
  },
  {
    id: "demo-meeting-2",
    code: "SY-104",
    title: "Daily Standup & LiveKit Smoke Test",
    status: "live",
    started_at: "2026-10-05T10:30:00.000Z",
  },
];

export const mockTodos: TodoItem[] = [
  ...mockActionItems.map((item, idx) => ({
    ...item,
    meeting_title: mockMeeting.title,
    // Make one item clearly overdue for testing
    due_date: idx === 0 ? "2026-10-01" : item.due_date,
  })),
  {
    id: "action-7",
    meeting_id: "demo-meeting-2",
    owner_id: "user-priya-01",
    owner_name: "Priya",
    title: "Verify microphone permissions banner in Safari and Firefox",
    due_date: "2026-10-04", // Overdue
    priority: "high",
    status: "todo",
    source_quote: "Let's make sure the microphone permission banner doesn't break Safari users.",
    t_ms: 180000,
    meeting_title: "Daily Standup & LiveKit Smoke Test",
  },
  {
    id: "action-8",
    meeting_id: "demo-meeting-2",
    owner_id: "user-priya-01",
    owner_name: "Priya",
    title: "Configure LiveKit audio noise suppression filter",
    due_date: "2026-10-05",
    priority: "medium",
    status: "done",
    source_quote: "I tested the background noise suppression toggle and it is performing well.",
    t_ms: 450000,
    meeting_title: "Daily Standup & LiveKit Smoke Test",
  },
];

export const mockLivekitToken: LivekitTokenResponse = {
  token: "mock-jwt-token-livekit-meetmate-dev",
  url: "wss://meetmate-demo.livekit.cloud",
};
