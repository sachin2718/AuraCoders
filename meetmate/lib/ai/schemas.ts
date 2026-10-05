/**
 * lib/ai/schemas.ts
 *
 * Zod schemas that validate every JSON object the LLM returns.
 * These are the canonical types shared between API routes and the UI.
 */

import { z } from "zod";

// ─── Summary ──────────────────────────────────────────────────────────────────

export const SummarySchema = z.object({
  /** One-paragraph TL;DR of the whole meeting. */
  tldr: z.string().min(1, "tldr must not be empty"),

  /** Ordered list of the most important discussion points. */
  key_points: z
    .array(z.string().min(1))
    .min(1, "At least one key point is required"),

  /** Explicit decisions made during the meeting (may be empty). */
  decisions: z.array(z.string().min(1)),

  /** Questions that were raised but NOT resolved (may be empty). */
  open_questions: z.array(z.string().min(1)),
});

export type Summary = z.infer<typeof SummarySchema>;

// ─── Action Item ──────────────────────────────────────────────────────────────

/** ISO 8601 date string, YYYY-MM-DD only. */
const DateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "due_date must be YYYY-MM-DD")
  .nullable();

export const ActionItemSchema = z.object({
  /** Short imperative title, e.g. "Send revised proposal to client". */
  title: z.string().min(1, "title must not be empty"),

  /**
   * Full name of the person responsible, exactly as spoken in the transcript.
   * null when the transcript doesn't assign it to anyone specific.
   */
  owner_name: z.string().nullable(),

  /** Optional deadline extracted from the transcript. null when not mentioned. */
  due_date: DateString,

  priority: z.enum(["low", "medium", "high"]),

  /**
   * Verbatim sentence(s) from the transcript that justify this action item.
   * Shown next to the to-do so the owner has full context.
   */
  source_quote: z.string().min(1, "source_quote must not be empty"),

  /** Milliseconds from meeting start when the action item was mentioned. */
  timestamp_ms: z.number().int().nonnegative(),
});

export type ActionItem = z.infer<typeof ActionItemSchema>;

export const ActionItemsSchema = z.array(ActionItemSchema);
export type ActionItems = z.infer<typeof ActionItemsSchema>;

// ─── Full AI output (summary + action items in one call) ──────────────────────

export const AIOutputSchema = z.object({
  summary: SummarySchema,
  action_items: ActionItemsSchema,
});

export type AIOutput = z.infer<typeof AIOutputSchema>;

// ─── Helper: parse + surface friendly validation errors ───────────────────────

export function parseSummary(raw: unknown): Summary {
  return SummarySchema.parse(raw);
}

export function parseActionItems(raw: unknown): ActionItems {
  return ActionItemsSchema.parse(raw);
}

export function parseAIOutput(raw: unknown): AIOutput {
  return AIOutputSchema.parse(raw);
}
