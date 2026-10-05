/**
 * lib/ai/pipeline.ts
 * AI summarization and action item extraction pipeline (Owned by P3).
 *
 * RULES:
 * - Server-only: never imported in client components.
 * - Never log or expose secret API keys.
 * - Enforces strict network timeouts (AbortSignal) so failing keys or down LLMs never hang.
 * - Fails fast with clear errors when LLM keys are revoked, killed, or invalid.
 */

import { MeetingData, Summary, ActionItem } from "@/lib/db";

export interface PipelineResult {
  summary: Omit<Summary, "meeting_id">;
  actionItems: Array<Omit<ActionItem, "id" | "meeting_id">>;
}

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Executes the AI meeting intelligence pipeline.
 * Throws immediately if LLM key is revoked/killed/invalid or if API call fails.
 */
export async function runPipeline(
  meetingData: MeetingData
): Promise<PipelineResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  // 1. Check for explicitly killed, invalid, or revoked LLM keys
  if (
    process.env.KILL_LLM_KEY === "true" ||
    apiKey === "killed" ||
    apiKey === "invalid" ||
    apiKey === "revoked" ||
    apiKey === ""
  ) {
    throw new Error(
      "LLM API key is invalid or revoked (killed). AI pipeline execution failed."
    );
  }

  // 2. Check for missing key
  if (!apiKey) {
    // If explicit mock mode is set for pipeline testing, generate structured mock result
    if (process.env.MOCK_AI === "true" || process.env.MOCK_PIPELINE === "true") {
      return generateMockPipelineResult(meetingData);
    }
    throw new Error(
      "LLM API key is not configured: GEMINI_API_KEY is missing."
    );
  }

  // 3. Handle mock/test keys
  if (
    apiKey === "mock" ||
    apiKey === "test" ||
    apiKey.startsWith("mock-") ||
    apiKey.startsWith("test-")
  ) {
    return generateMockPipelineResult(meetingData);
  }

  // 4. Real Gemini API call with strict timeout (no hang!)
  return await callGemini(meetingData, apiKey);
}

/**
 * Calls Google Gemini REST API with strict AbortSignal timeout.
 */
async function callGemini(
  meetingData: MeetingData,
  apiKey: string
): Promise<PipelineResult> {
  const transcriptLines = (meetingData.segments || []).map(
    (s) => `[${formatMs(s.t_ms)}] ${s.speaker_name}: ${s.text}`
  );

  const visualLines = (meetingData.visualNotes || []).map(
    (v) => `[${formatMs(v.t_ms)}] Visual Note: ${v.description}`
  );

  const prompt = `You are MeetMate, an AI meeting assistant. Analyze the following meeting information and generate a concise executive summary and individual action items.

Meeting Title: ${meetingData.meeting?.title || "Meeting"}
Participants: ${(meetingData.participants || []).map((p) => p.display_name).join(", ")}

Transcript:
${transcriptLines.length > 0 ? transcriptLines.join("\n") : "(No transcript available)"}

${visualLines.length > 0 ? `Visual Whiteboard Notes:\n${visualLines.join("\n")}` : ""}

Respond ONLY with valid JSON matching this schema:
{
  "summary": {
    "tldr": "1-2 sentence executive overview of what was discussed and agreed upon",
    "key_points": ["bullet 1", "bullet 2", "..."],
    "decisions": ["concrete decision 1", "..."],
    "open_questions": ["unresolved question or follow up", "..."]
  },
  "actionItems": [
    {
      "owner_name": "Name of assigned participant or null if unassigned",
      "title": "Action item description",
      "due_date": "YYYY-MM-DD or null",
      "priority": "low | medium | high",
      "status": "todo",
      "source_quote": "Verbatim quote or relevant sentence from transcript",
      "t_ms": 0
    }
  ]
}`;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  // Enforce a strict 20-second timeout so bad connections or API issues never hang
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    // Sanitize any potential key reflections
    const cleanError = errorBody.replace(new RegExp(apiKey, "g"), "[REDACTED]");
    throw new Error(
      `Gemini LLM request failed with status ${response.status}: ${cleanError.slice(0, 150)}`
    );
  }

  const payload = await response.json();
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini returned an empty completion");
  }

  const parsed = JSON.parse(text);
  if (!parsed.summary || typeof parsed.summary.tldr !== "string") {
    throw new Error("Invalid summary format returned by LLM");
  }

  return {
    summary: {
      tldr: parsed.summary.tldr,
      key_points: Array.isArray(parsed.summary.key_points)
        ? parsed.summary.key_points
        : [],
      decisions: Array.isArray(parsed.summary.decisions)
        ? parsed.summary.decisions
        : [],
      open_questions: Array.isArray(parsed.summary.open_questions)
        ? parsed.summary.open_questions
        : [],
    },
    actionItems: Array.isArray(parsed.actionItems)
      ? parsed.actionItems.map((item: {
          owner_name?: string | null;
          owner_id?: string | null;
          title?: string;
          due_date?: string | null;
          priority?: string;
          source_quote?: string;
          t_ms?: number;
        }) => ({
          owner_name: item.owner_name || null,
          owner_id: item.owner_id || null,
          title: String(item.title || "Action item"),
          due_date: item.due_date || null,
          priority: (["low", "medium", "high"].includes(String(item.priority))
            ? item.priority
            : "medium") as "low" | "medium" | "high",
          status: "todo" as const,
          source_quote: String(item.source_quote || ""),
          t_ms: typeof item.t_ms === "number" ? item.t_ms : 0,
        }))
      : [],
  };
}

/**
 * Generates structured summaries and action items from transcripts when using mock/test keys.
 */
function generateMockPipelineResult(meetingData: MeetingData): PipelineResult {
  const segments = meetingData.segments || [];
  const participants = meetingData.participants || [];
  const title = meetingData.meeting?.title || "Meeting";

  const speakerNames = Array.from(
    new Set(segments.map((s) => s.speaker_name))
  ).filter(Boolean);
  const participantsSummary =
    speakerNames.length > 0
      ? speakerNames.join(", ")
      : participants.map((p) => p.display_name).join(", ") || "the team";

  const tldr =
    segments.length > 0
      ? `The team (${participantsSummary}) aligned on ${title.toLowerCase()} priorities, discussed deliverables, and assigned follow-up action items.`
      : `Meeting concluded for ${title} without recorded transcript segments.`;

  const keyPoints =
    segments.length > 0
      ? segments.slice(0, 4).map((s) => `${s.speaker_name}: "${s.text}"`)
      : [`Discussion on ${title}`];

  const decisions = [
    `Aligned on action items and execution timeline for ${title}.`,
    "Post-meeting review and task tracking approved.",
  ];

  const openQuestions = [
    "Are there any blocking dependencies before the next sync?",
  ];

  const actionItems: Array<Omit<ActionItem, "id" | "meeting_id">> = [];

  // Look for action phrases in segments
  const actionKeywords = [
    "i will",
    "i'll",
    "handle",
    "action item",
    "todo",
    "need to",
    "review",
    "build",
    "write",
    "create",
    "set up",
  ];

  for (const s of segments) {
    const lower = s.text.toLowerCase();
    if (actionKeywords.some((kw) => lower.includes(kw))) {
      actionItems.push({
        owner_name: s.speaker_name,
        owner_id: null,
        title: s.text.replace(/^(i'll|i will|let's|we need to)\s+/i, "").trim(),
        due_date: null,
        priority: "medium",
        status: "todo",
        source_quote: `${s.speaker_name}: "${s.text}"`,
        t_ms: s.t_ms,
      });
    }
  }

  // Ensure at least 1-2 action items exist if there were segments
  if (actionItems.length === 0 && segments.length > 0) {
    for (let i = 0; i < Math.min(segments.length, 2); i++) {
      const seg = segments[i];
      actionItems.push({
        owner_name: seg.speaker_name,
        owner_id: null,
        title: `Follow up on: ${seg.text}`,
        due_date: null,
        priority: "medium",
        status: "todo",
        source_quote: `${seg.speaker_name}: "${seg.text}"`,
        t_ms: seg.t_ms,
      });
    }
  }

  return {
    summary: {
      tldr,
      key_points: keyPoints,
      decisions,
      open_questions: openQuestions,
    },
    actionItems,
  };
}
