/**
 * lib/ai/pipeline.ts
 *
 * runPipeline(input) → PipelineOutput
 *
 * Steps:
 *  0. Guard: short transcript → return stub without calling LLM.
 *  1. Format transcript segments into "[mm:ss] Speaker: text" lines.
 *  2. Chunk if > 10 minutes of content → hierarchical summarisation.
 *  3. Run summary + action-item LLM calls IN PARALLEL.
 *  4. Parse/validate with Zod; retry once on failure.
 *  5. Map owner names → user IDs (owners.ts).
 *  6. Verify source quotes (verify.ts); drop unverified items.
 *  7. Return PipelineOutput.
 */

import { callLLM } from "./llm";
import {
  SummarySchema,
  ActionItemsSchema,
  type Summary,
  type ActionItem,
  type ActionItems,
} from "./schemas";
import { buildSummaryPrompt, buildActionPrompt, type PromptInput } from "./prompts";
import { resolveOwners, type Participant } from "./owners";
import { quoteExistsInTranscript } from "./verify";

// ─── Public Types ─────────────────────────────────────────────────────────────

/** One DB transcript_segments row (only the fields we need). */
export interface TranscriptSegment {
  speaker_name: string;
  text: string;
  t_ms: number;
}

/** One DB visual_notes row. */
export interface VisualNote {
  t_ms: number;
  description: string;
}

export interface PipelineInput {
  meetingId: string;
  meetingDate: string; // ISO date string, e.g. "2025-03-14"
  timezone: string;    // IANA, e.g. "Asia/Kolkata"
  participants: Participant[];
  segments: TranscriptSegment[];
  visualNotes?: VisualNote[];
}

export interface EnrichedActionItem extends ActionItem {
  /** Resolved from owner_name via fuzzy matching. null if unresolved. */
  owner_id: string | null;
  /** True if the source_quote was found (or near-found) in the transcript. */
  quote_verified: boolean;
  /** 0-1 confidence from the quote verifier. */
  quote_confidence: number;
}

export interface PipelineOutput {
  summary: Summary;
  action_items: EnrichedActionItem[];
  /** Diagnostics for debugging / logging. */
  meta: {
    segmentCount: number;
    wordCount: number;
    chunked: boolean;
    chunkCount: number;
    droppedItems: number;
    elapsedMs: number;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_SEGMENTS = 5;
const MIN_WORDS = 40;
const CHUNK_WINDOW_MS = 10 * 60 * 1000; // 10 minutes in ms
const JSON_RETRY_SUFFIX =
  "\n\nIMPORTANT: Your previous response was not valid JSON. Return ONLY the JSON — no prose, no markdown fences.";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function msToTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatSegments(segments: TranscriptSegment[]): string[] {
  return segments.map(
    (s) => `[${msToTimestamp(s.t_ms)}] ${s.speaker_name}: ${s.text.trim()}`,
  );
}

function formatVisualNotes(notes: VisualNote[]): string[] {
  return notes.map((n) => `[${msToTimestamp(n.t_ms)}] ${n.description.trim()}`);
}

function countWords(segments: TranscriptSegment[]): number {
  return segments.reduce((acc, s) => acc + s.text.split(/\s+/).filter(Boolean).length, 0);
}

function buildTranscriptText(segments: TranscriptSegment[]): string {
  return segments.map((s) => s.text).join(" ");
}

/** Split segments into ~10-minute windows by t_ms. */
function chunkSegments(segments: TranscriptSegment[]): TranscriptSegment[][] {
  const chunks: TranscriptSegment[][] = [];
  let current: TranscriptSegment[] = [];
  let windowStart = segments[0]?.t_ms ?? 0;

  for (const seg of segments) {
    if (seg.t_ms - windowStart >= CHUNK_WINDOW_MS && current.length > 0) {
      chunks.push(current);
      current = [];
      windowStart = seg.t_ms;
    }
    current.push(seg);
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

// ─── LLM call with one retry ──────────────────────────────────────────────────

async function callWithRetry<T>(
  prompt: string,
  schema: { parse: (v: unknown) => T },
  label: string,
): Promise<T> {
  // First attempt
  try {
    const raw = await callLLM(prompt, { json: true, temperature: 0.1 });
    return schema.parse(raw);
  } catch (firstErr) {
    if (process.env.NODE_ENV === "development") {
      console.warn(`[pipeline] ${label} parse failed on attempt 1, retrying…`, firstErr);
    }
  }

  // Retry with reminder appended
  const raw2 = await callLLM(prompt + JSON_RETRY_SUFFIX, {
    json: true,
    temperature: 0.1,
  });
  try {
    return schema.parse(raw2);
  } catch (secondErr) {
    throw new Error(
      `[pipeline] ${label} parse failed after 2 attempts: ${String(secondErr)}`,
    );
  }
}

// ─── Short-circuit stub ───────────────────────────────────────────────────────

function makeStubOutput(
  segments: TranscriptSegment[],
  wordCount: number,
  startMs: number,
): PipelineOutput {
  return {
    summary: {
      tldr: "Not enough content to summarise.",
      key_points: [],
      decisions: [],
      open_questions: [],
    },
    action_items: [],
    meta: {
      segmentCount: segments.length,
      wordCount,
      chunked: false,
      chunkCount: 0,
      droppedItems: 0,
      elapsedMs: Date.now() - startMs,
    },
  };
}

// ─── Hierarchical chunked summarisation ──────────────────────────────────────

async function summariseChunks(
  chunks: TranscriptSegment[][],
  baseInput: PromptInput,
): Promise<Summary> {
  // Summarise each chunk in parallel
  const chunkSummaries = await Promise.all(
    chunks.map(async (chunk, i) => {
      const lines = formatSegments(chunk);
      const chunkPrompt = buildSummaryPrompt({ ...baseInput, transcriptLines: lines });
      const summary = await callWithRetry<Summary>(chunkPrompt, SummarySchema, `summary-chunk-${i}`);
      // Flatten into a mini-transcript for the meta-summary
      return [
        `[Chunk ${i + 1}]`,
        `TL;DR: ${summary.tldr}`,
        `Key points: ${summary.key_points.join(" | ")}`,
        `Decisions: ${summary.decisions.join(" | ") || "none"}`,
        `Open questions: ${summary.open_questions.join(" | ") || "none"}`,
      ].join("\n");
    }),
  );

  // Meta-summary: summarise the summaries
  const metaPrompt = buildSummaryPrompt({
    ...baseInput,
    transcriptLines: chunkSummaries,
    visualNotes: [], // already embedded in chunk summaries
  });
  return callWithRetry(metaPrompt, SummarySchema, "meta-summary");
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

export async function runPipeline(input: PipelineInput): Promise<PipelineOutput> {
  const startMs = Date.now();
  const { segments, participants, visualNotes = [], meetingDate, timezone } = input;

  const wordCount = countWords(segments);
  const participantNames = participants.map((p) => p.display_name);

  // ── Step 0: Guard — too short ─────────────────────────────────────────────
  if (segments.length < MIN_SEGMENTS || wordCount < MIN_WORDS) {
    if (process.env.NODE_ENV === "development") {
      console.log(
        `[pipeline] transcript too short (${segments.length} segs, ${wordCount} words) — returning stub`,
      );
    }
    return makeStubOutput(segments, wordCount, startMs);
  }

  // ── Step 1: Format lines ──────────────────────────────────────────────────
  const transcriptLines = formatSegments(segments);
  const visualLines = formatVisualNotes(visualNotes);
  const transcriptText = buildTranscriptText(segments);

  const basePromptInput: PromptInput = {
    participantNames,
    meetingDate,
    timezone,
    transcriptLines,
    visualNotes: visualLines,
  };

  // ── Step 2: Chunking decision ─────────────────────────────────────────────
  const maxTms = segments.at(-1)?.t_ms ?? 0;
  const needsChunking = maxTms > CHUNK_WINDOW_MS;
  const chunks = needsChunking ? chunkSegments(segments) : [segments];

  if (process.env.NODE_ENV === "development") {
    console.log(
      `[pipeline] segments=${segments.length} words=${wordCount} ` +
        `chunked=${needsChunking} chunks=${chunks.length}`,
    );
  }

  // ── Step 3: Parallel LLM calls ────────────────────────────────────────────
  const actionPrompt = buildActionPrompt(basePromptInput);

  const [summary, rawActionItems] = await Promise.all([
    // Summary: chunked or single
    needsChunking
      ? summariseChunks(chunks, basePromptInput)
      : callWithRetry<Summary>(buildSummaryPrompt(basePromptInput), SummarySchema, "summary"),

    // Action items always run on the full transcript (needs global context)
    callWithRetry<ActionItems>(actionPrompt, ActionItemsSchema, "action-items"),
  ]);

  // ── Step 4: Map owner names → user IDs ───────────────────────────────────
  const ownerNames = rawActionItems.map((item: ActionItem) => item.owner_name);
  const ownerMap = resolveOwners(ownerNames, participants);

  // ── Step 5: Verify source quotes ──────────────────────────────────────────
  let droppedItems = 0;
  const action_items: EnrichedActionItem[] = [];

  for (let i = 0; i < rawActionItems.length; i++) {
    const item = rawActionItems[i];
    const { found: quote_verified, tMs, confidence } = quoteExistsInTranscript(
      item.source_quote,
      segments,
    );

    if (!quote_verified) {
      droppedItems++;
      if (process.env.NODE_ENV === "development") {
        console.warn(
          `[pipeline] dropping action item "${item.title}" — ` +
            `quote not found in transcript (confidence=${confidence.toFixed(2)})`,
        );
      }
      continue;
    }

    action_items.push({
      ...item,
      // Correct timestamp_ms to the verified segment's t_ms when available
      timestamp_ms: tMs ?? item.timestamp_ms,
      owner_id: ownerMap.get(item.owner_name) ?? null,
      quote_verified,
      quote_confidence: confidence,
    });
  }

  const elapsedMs = Date.now() - startMs;

  if (process.env.NODE_ENV === "development") {
    console.log(
      `[pipeline] done in ${elapsedMs}ms — ` +
        `${action_items.length} items kept, ${droppedItems} dropped`,
    );
  }

  return {
    summary,
    action_items,
    meta: {
      segmentCount: segments.length,
      wordCount,
      chunked: needsChunking,
      chunkCount: chunks.length,
      droppedItems,
      elapsedMs,
    },
  };
}
