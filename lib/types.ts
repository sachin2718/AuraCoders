import { z } from "zod";

// ─── Enums & Literals ───────────────────────────────────────────────
export const MeetingStatusSchema = z.enum(["live", "processing", "ready", "failed"]);
export type MeetingStatus = z.infer<typeof MeetingStatusSchema>;

export const PrioritySchema = z.enum(["low", "medium", "high"]);
export type Priority = z.infer<typeof PrioritySchema>;

export const ActionStatusSchema = z.enum(["todo", "done"]);
export type ActionStatus = z.infer<typeof ActionStatusSchema>;

// ─── Core Models ────────────────────────────────────────────────────
export const MeetingSchema = z.object({
  id: z.string(),
  code: z.string(),
  title: z.string(),
  host_id: z.string().nullable(),
  status: MeetingStatusSchema,
  started_at: z.string(),
  ended_at: z.string().nullable().optional(),
});
export type Meeting = z.infer<typeof MeetingSchema>;

export const ParticipantSchema = z.object({
  meeting_id: z.string(),
  user_id: z.string(),
  display_name: z.string(),
  consented_at: z.string().nullable().optional(),
});
export type Participant = z.infer<typeof ParticipantSchema>;

export const SummarySchema = z.object({
  meeting_id: z.string(),
  tldr: z.string(),
  key_points: z.array(z.string()),
  decisions: z.array(z.string()),
  open_questions: z.array(z.string()),
});
export type Summary = z.infer<typeof SummarySchema>;

export const ActionItemSchema = z.object({
  id: z.string(),
  meeting_id: z.string(),
  owner_id: z.string().nullable(),
  owner_name: z.string().nullable(),
  title: z.string(),
  due_date: z.string().nullable().optional(),
  priority: PrioritySchema,
  status: ActionStatusSchema,
  source_quote: z.string(),
  t_ms: z.number().nullable().optional(),
});
export type ActionItem = z.infer<typeof ActionItemSchema>;

export const TodoItemSchema = ActionItemSchema.extend({
  meeting_title: z.string(),
});
export type TodoItem = z.infer<typeof TodoItemSchema>;

// ─── Endpoint Response Schemas ──────────────────────────────────────
export const CreateMeetingResponseSchema = z.object({
  id: z.string(),
  code: z.string(),
});
export type CreateMeetingResponse = z.infer<typeof CreateMeetingResponseSchema>;

export const MeetingListItemSchema = z.object({
  id: z.string(),
  code: z.string(),
  title: z.string(),
  status: MeetingStatusSchema,
  started_at: z.string(),
  host_id: z.string().nullable().optional(),
});
export type MeetingListItem = z.infer<typeof MeetingListItemSchema>;

export const MeetingDetailSchema = z.object({
  meeting: MeetingSchema,
  participants: z.array(ParticipantSchema),
  summary: SummarySchema.nullable().optional(),
  action_items: z.array(ActionItemSchema).optional(),
});
export type MeetingDetail = z.infer<typeof MeetingDetailSchema>;

export const LivekitTokenResponseSchema = z.object({
  token: z.string(),
  url: z.string(),
});
export type LivekitTokenResponse = z.infer<typeof LivekitTokenResponseSchema>;

export const OkResponseSchema = z.object({
  ok: z.boolean(),
});
export type OkResponse = z.infer<typeof OkResponseSchema>;

export const VisualResponseSchema = z.object({
  description: z.string(),
});
export type VisualResponse = z.infer<typeof VisualResponseSchema>;

export const TranscribeResponseSchema = z.object({
  text: z.string(),
});
export type TranscribeResponse = z.infer<typeof TranscribeResponseSchema>;

export const EndMeetingResponseSchema = z.object({
  status: z.string(),
});
export type EndMeetingResponse = z.infer<typeof EndMeetingResponseSchema>;
