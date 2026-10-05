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

  return `You extract action items from a meeting transcript.

Participants:
${formatParticipants(input.participantNames)}
Meeting date: ${anchor} (${input.timezone})

════════════════════════════════════════
TRANSCRIPT
════════════════════════════════════════
${formatTranscript(input.transcriptLines)}

════════════════════════════════════════
VISUAL NOTES (whiteboard / screen captures)
════════════════════════════════════════
${formatVisualNotes(input.visualNotes)}

Return ONLY a JSON array. Each item:
{
  "title": string (imperative, <= 12 words),
  "owner_name": string | null,
  "due_date": "YYYY-MM-DD" | null,
  "priority": "low" | "medium" | "high",
  "source_quote": string (copied EXACTLY from the transcript, <= 25 words),
  "timestamp_ms": number
}

Rules:
- Only include real commitments or assignments. Do NOT turn opinions, decisions or discussion into tasks.
- "Priya, can you ..." -> owner Priya. "I'll ..." / "Let me ..." -> owner = the speaker.
- "Someone should ..." / unclear owner -> owner_name null.
- Resolve relative dates ("by Friday", "next week") from the meeting date. Unknown -> null.
- Priority: high if urgent/blocking/deadline within 2 days; low if "when you get a chance"; else medium.
- Never invent tasks, owners, dates or quotes. If there are no action items, return [].
- Output ONLY the JSON array — no markdown fences, no commentary.`.trim();
}
