/**
 * lib/ai/prompts.ts
 *
 * Prompt builders for the MeetMate AI pipeline.
 * Both functions return a single string ready to pass to callLLM().
 *
 * Design goals:
 *  - All rules are inline so the prompt is self-contained.
 *  - JSON schema is described precisely so Gemini can fill it without ambiguity.
 *  - Visual notes are optional; the model is told to ignore that section if absent.
 */

// ─── Shared input type ────────────────────────────────────────────────────────

export interface PromptInput {
  /** All display names of everyone in the meeting, in join order. */
  participantNames: string[];

  /** ISO date string of the meeting, e.g. "2025-03-14". */
  meetingDate: string;

  /**
   * IANA timezone of the host, e.g. "Asia/Kolkata".
   * Used to anchor relative time references ("tomorrow", "end of week").
   */
  timezone: string;

  /**
   * Full transcript as an array of pre-formatted lines.
   * Each element: "[mm:ss] Speaker Name: sentence text"
   */
  transcriptLines: string[];

  /**
   * Optional visual notes captured during the meeting.
   * Each element: "[mm:ss] <description of whiteboard / screen share>"
   */
  visualNotes?: string[];
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function formatParticipants(names: string[]): string {
  if (names.length === 0) return "(no participants listed)";
  return names.map((n) => `  • ${n}`).join("\n");
}

function formatTranscript(lines: string[]): string {
  if (lines.length === 0) return "(transcript is empty)";
  return lines.join("\n");
}

function formatVisualNotes(notes?: string[]): string {
  if (!notes || notes.length === 0) return "(none)";
  return notes.map((n) => `  ${n}`).join("\n");
}

/**
 * Returns today as a YYYY-MM-DD string in the given IANA timezone.
 * Used so the model can resolve "next Friday" → absolute date.
 */
function resolveAnchorDate(meetingDate: string, timezone: string): string {
  try {
    // Format the supplied meeting date using the host timezone so
    // "due tomorrow" is computed relative to when the meeting happened.
    const d = new Date(meetingDate);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return meetingDate; // fallback: use as-is
  }
}

// ─── buildSummaryPrompt ───────────────────────────────────────────────────────

/**
 * Returns a prompt that asks the model to produce a meeting summary.
 * The model must output ONLY valid JSON matching SummarySchema.
 */
export function buildSummaryPrompt(input: PromptInput): string {
  const anchor = resolveAnchorDate(input.meetingDate, input.timezone);

  return `You are MeetMate, a professional meeting analyst.
Your job is to read a meeting transcript and produce a structured summary.

════════════════════════════════════════
MEETING METADATA
════════════════════════════════════════
Date        : ${anchor}
Timezone    : ${input.timezone}
Participants:
${formatParticipants(input.participantNames)}

════════════════════════════════════════
TRANSCRIPT
════════════════════════════════════════
${formatTranscript(input.transcriptLines)}

════════════════════════════════════════
VISUAL NOTES (whiteboard / screen captures)
════════════════════════════════════════
${formatVisualNotes(input.visualNotes)}

════════════════════════════════════════
RULES — follow every rule exactly
════════════════════════════════════════
1. Read the entire transcript before writing anything.
2. tldr: Write ONE paragraph (3-5 sentences) that would let a busy stakeholder
   understand what happened without reading anything else.
3. key_points: List the 3-8 most important discussion points in the order they arose.
   Each point is a single concise sentence. Do NOT duplicate decisions here.
4. decisions: List only explicit, final decisions ("we agreed to…", "the team decided…").
   Omit tentative plans or things still under discussion.
5. open_questions: List questions explicitly raised but NOT resolved by meeting end.
6. Do NOT invent information not present in the transcript or visual notes.
7. Use the participants' names exactly as they appear in the transcript.
8. Output ONLY the JSON object below — no markdown fences, no commentary.

════════════════════════════════════════
REQUIRED JSON OUTPUT SCHEMA
════════════════════════════════════════
{
  "tldr": "<string>",
  "key_points": ["<string>", ...],
  "decisions": ["<string>", ...],
  "open_questions": ["<string>", ...]
}

Respond with the JSON object and nothing else.`.trim();
}

// ─── buildActionPrompt ────────────────────────────────────────────────────────

/**
 * Returns a prompt that asks the model to extract all action items.
 * The model must output ONLY valid JSON matching ActionItemsSchema (an array).
 */
export function buildActionPrompt(input: PromptInput): string {
  const anchor = resolveAnchorDate(input.meetingDate, input.timezone);

  return `You are MeetMate, a professional meeting analyst specialising in task extraction.
Your job is to extract every action item from a meeting transcript.

════════════════════════════════════════
MEETING METADATA
════════════════════════════════════════
Date        : ${anchor}   ← use this as "today" when resolving relative dates
Timezone    : ${input.timezone}
Participants:
${formatParticipants(input.participantNames)}

════════════════════════════════════════
TRANSCRIPT
════════════════════════════════════════
${formatTranscript(input.transcriptLines)}

════════════════════════════════════════
VISUAL NOTES (whiteboard / screen captures)
════════════════════════════════════════
${formatVisualNotes(input.visualNotes)}

════════════════════════════════════════
RULES — follow every rule exactly
════════════════════════════════════════
1. Read the ENTIRE transcript before extracting anything.
2. An action item is any commitment, task, follow-up, or deliverable that someone
   agreed to do — explicitly or clearly implied.
3. title: Start with an imperative verb. Max 12 words. Be specific (not "follow up").
4. owner_name: Use the exact name from the transcript. Set to null ONLY if nobody is
   assigned and it cannot reasonably be inferred. Do NOT invent names.
5. due_date: Convert relative references ("by Friday", "next week", "end of month")
   to absolute YYYY-MM-DD using the meeting date above as the anchor.
   Set to null when no deadline is mentioned at all.
6. priority:
   - "high"   → blocking, urgent, or the speaker used words like "critical / ASAP / today"
   - "medium" → normal business items with a stated deadline
   - "low"    → nice-to-have, background tasks, no deadline mentioned
7. source_quote: Copy the EXACT verbatim sentence(s) from the transcript that justify
   this action item. Do not paraphrase. Include the speaker name prefix as it appears.
8. timestamp_ms: Convert the [mm:ss] timestamp at the start of the source line to
   milliseconds (mm*60000 + ss*1000).
9. If the same task is mentioned multiple times, emit it ONCE using the most
   informative occurrence as the source_quote.
10. If there are NO action items, output an empty array [].
11. Output ONLY the JSON array below — no markdown fences, no commentary.

════════════════════════════════════════
REQUIRED JSON OUTPUT SCHEMA
════════════════════════════════════════
[
  {
    "title": "<imperative sentence, ≤12 words>",
    "owner_name": "<string | null>",
    "due_date": "<YYYY-MM-DD | null>",
    "priority": "low" | "medium" | "high",
    "source_quote": "<verbatim text from transcript>",
    "timestamp_ms": <integer ≥ 0>
  },
  ...
]

Respond with the JSON array and nothing else.`.trim();
}
