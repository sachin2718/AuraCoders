import { z } from "zod";
import {
  MeetingStatus,
  ActionStatus,
  CreateMeetingResponse,
  CreateMeetingResponseSchema,
  MeetingListItem,
  MeetingListItemSchema,
  MeetingDetail,
  MeetingDetailSchema,
  LivekitTokenResponse,
  LivekitTokenResponseSchema,
  OkResponse,
  OkResponseSchema,
  VisualResponse,
  VisualResponseSchema,
  TranscribeResponse,
  TranscribeResponseSchema,
  EndMeetingResponse,
  EndMeetingResponseSchema,
  TodoItem,
  TodoItemSchema,
} from "./types";
import {
  mockMeetingDetail,
  mockMeetingsList,
  mockTodos,
  mockLivekitToken,
} from "./mocks";

// ─── Typed API Error ────────────────────────────────────────────────
export class ApiError extends Error {
  public status: number;
  public data?: unknown;

  constructor(message: string, status: number = 500, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

// ─── Mock Helpers ───────────────────────────────────────────────────
const isMock = (): boolean => {
  return process.env.NEXT_PUBLIC_MOCK === "true";
};

const delay = (ms = 400): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

// ─── Fetch Helper with Zod Validation & Typed Error ─────────────────
async function fetchClient<T>(
  endpoint: string,
  schema: z.ZodType<T>,
  options?: RequestInit,
  timeoutMs = 20_000,
): Promise<T> {
  let response: Response;
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
  try {
    response = await fetch(endpoint, {
      ...options,
      signal: options?.signal ?? timeoutController.signal,
      headers: {
        ...(options?.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        "x-user-id": typeof window !== "undefined"
          ? (localStorage.getItem("meetmate_user_id") || (() => {
              const newId = "user-" + Math.random().toString(36).substring(2, 10);
              localStorage.setItem("meetmate_user_id", newId);
              return newId;
            })())
          : "local-user",
        ...options?.headers,
      },
    });
  } catch (err: unknown) {
    if (timeoutController.signal.aborted) {
      throw new ApiError("The request timed out. Please try again.", 408);
    }
    const message = err instanceof Error ? err.message : "Network request failed";
    throw new ApiError(`Network error: ${message}`, 0);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let errorData: unknown;
    let errorMessage = `API error ${response.status}: ${response.statusText}`;
    try {
      errorData = await response.json();
      if (
        errorData &&
        typeof errorData === "object" &&
        "error" in errorData &&
        typeof (errorData as { error: unknown }).error === "string"
      ) {
        errorMessage = (errorData as { error: string }).error;
      }
    } catch {
      // Body not JSON
    }
    throw new ApiError(errorMessage, response.status, errorData);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to parse JSON";
    throw new ApiError(`Invalid JSON response: ${message}`, response.status);
  }

  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ApiError(
      `Response schema validation failed: ${result.error.issues.map((i) => i.message).join(", ")}`,
      422,
      result.error.issues
    );
  }

  return result.data;
}

// ─── Mock In-Memory State for Simulations ───────────────────────────
const mockMeetingStatusMap = new Map<string, { status: MeetingStatus; count: number }>();
const mockMeetingsByCode = new Map<string, MeetingListItem>();

export function setMockMeetingStatus(id: string, status: MeetingStatus) {
  mockMeetingStatusMap.set(id, { status, count: 0 });
}

// ─── Typed API Client ───────────────────────────────────────────────
export const api = {
  /**
   * Set simulated mock status for a meeting (dev/testing helper)
   */
  setMockStatus(id: string, status: MeetingStatus) {
    mockMeetingStatusMap.set(id, { status, count: 0 });
  },

  /**
   * POST /api/meetings {title} -> {id, code}
   */
  async createMeeting(title: string): Promise<CreateMeetingResponse> {
    return fetchClient("/api/meetings", CreateMeetingResponseSchema, {
      method: "POST",
      body: JSON.stringify({ title }),
    });
  },

  /**
   * GET /api/meetings -> [{id, code, title, status, started_at}]
   */
  async listMeetings(): Promise<MeetingListItem[]> {
    const listSchema = z.array(MeetingListItemSchema);
    try {
      return await fetchClient("/api/meetings", listSchema, {
        method: "GET",
      });
    } catch {
      return [];
    }
  },

  /** Resolve the meeting metadata needed by the lobby from its shared code. */
  async findMeetingByCode(code: string): Promise<MeetingListItem> {
    const list = await fetchClient(
      `/api/meetings?code=${encodeURIComponent(code.trim())}`,
      z.array(MeetingListItemSchema),
      { method: "GET" },
    );
    if (!list[0]) throw new ApiError("Meeting code was not found.", 404);
    return list[0];
  },

  /**
   * GET /api/meetings/:id -> {meeting, participants, summary?, action_items?}
   * Calling api.getMeeting("demo") returns the ready mock meeting with summary & action items.
   * If status is set to "processing", polls 2 times before completing to "ready".
   */
  async getMeeting(id: string): Promise<MeetingDetail> {
    if (id === "demo") {
      return MeetingDetailSchema.parse(mockMeetingDetail);
    }
    try {
      return await fetchClient(`/api/meetings/${encodeURIComponent(id)}`, MeetingDetailSchema, {
        method: "GET",
      });
    } catch (err) {
      if (isMock()) {
        return MeetingDetailSchema.parse({
          ...mockMeetingDetail,
          meeting: {
            ...mockMeetingDetail.meeting,
            id,
            status: "ready",
          },
          participants: [],
        });
      }
      throw err;
    }
  },

  /**
   * POST /api/livekit-token {code, displayName} -> {token, url}
   */
  async getLivekitToken(code: string, displayName: string): Promise<LivekitTokenResponse> {
    if (isMock()) {
      await delay(400);
      return LivekitTokenResponseSchema.parse(mockLivekitToken);
    }
    return fetchClient("/api/livekit-token", LivekitTokenResponseSchema, {
      method: "POST",
      body: JSON.stringify({ code, displayName }),
    });
  },

  /**
   * POST /api/meetings/:id/consent {userId} -> {ok: true}
   */
  async postConsent(meetingId: string, userId: string): Promise<OkResponse> {
    if (isMock()) {
      await delay(400);
      return OkResponseSchema.parse({ ok: true });
    }
    return fetchClient(`/api/meetings/${encodeURIComponent(meetingId)}/consent`, OkResponseSchema, {
      method: "POST",
      body: JSON.stringify({ userId }),
    });
  },

  /**
   * POST /api/transcript {meetingId, speakerName, text, tMs} -> {ok: true}
   */
  async postTranscript(payload: {
    meetingId: string;
    speakerName: string;
    text: string;
    tMs: number;
  }): Promise<OkResponse> {
    if (isMock()) {
      await delay(400);
      return OkResponseSchema.parse({ ok: true });
    }
    return fetchClient("/api/transcript", OkResponseSchema, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /**
   * POST /api/visual {meetingId, tMs, imageBase64} -> {description}
   */
  async postVisual(payload: {
    meetingId: string;
    tMs: number;
    imageBase64: string;
  }): Promise<VisualResponse> {
    if (isMock()) {
      await delay(400);
      return VisualResponseSchema.parse({
        description: "Shared screen displaying architecture diagram of MeetMate pipeline.",
      });
    }
    return fetchClient("/api/visual", VisualResponseSchema, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /**
   * POST /api/transcribe multipart {meetingId, speakerName, tMs, audio} -> {text}
   */
  async postTranscribe(
    data: FormData | { meetingId: string; speakerName: string; tMs: number; audio: Blob }
  ): Promise<TranscribeResponse> {
    let body: FormData;
    if (data instanceof FormData) {
      body = data;
    } else {
      body = new FormData();
      body.append("meetingId", data.meetingId);
      body.append("speakerName", data.speakerName);
      body.append("tMs", data.tMs.toString());
      body.append("audio", data.audio);
    }

    if (isMock()) {
      await delay(400);
      return TranscribeResponseSchema.parse({
        text: "Mock fallback audio transcription completed successfully.",
      });
    }

    return fetchClient("/api/transcribe", TranscribeResponseSchema, {
      method: "POST",
      body,
    });
  },

  /**
   * POST /api/meetings/:id/end -> {status: 'processing'}
   */
  async endMeeting(meetingId: string): Promise<EndMeetingResponse> {
    if (isMock()) {
      await delay(400);
      return EndMeetingResponseSchema.parse({ status: "processing" });
    }
    return fetchClient(`/api/meetings/${encodeURIComponent(meetingId)}/end`, EndMeetingResponseSchema, {
      method: "POST",
    });
  },

  /**
   * POST /api/meetings/:id/load-sample {sampleId} -> {ok: true}
   */
  async loadSample(meetingId: string, sampleId: string): Promise<OkResponse> {
    if (isMock()) {
      await delay(400);
      mockMeetingStatusMap.set(meetingId, { status: "processing", count: 0 });
      return OkResponseSchema.parse({ ok: true });
    }
    return fetchClient(`/api/meetings/${encodeURIComponent(meetingId)}/load-sample`, OkResponseSchema, {
      method: "POST",
      body: JSON.stringify({ sampleId }),
    });
  },

  /**
   * GET /api/todos/me -> [action_item + meeting_title]
   */
  async getTodos(): Promise<TodoItem[]> {
    const todosSchema = z.array(TodoItemSchema);
    if (isMock()) {
      await delay(400);
      return todosSchema.parse(mockTodos);
    }
    return fetchClient("/api/todos/me", todosSchema, {
      method: "GET",
    });
  },

  /**
   * Alias for getTodos
   */
  async getMyTodos(): Promise<TodoItem[]> {
    return this.getTodos();
  },

  /**
   * PATCH /api/todos/:id {status} -> {ok: true}
   */
  async updateTodo(id: string, status: ActionStatus): Promise<OkResponse> {
    if (isMock()) {
      await delay(400);
      const target = mockTodos.find((t) => t.id === id);
      if (target) {
        target.status = status;
      }
      return OkResponseSchema.parse({ ok: true });
    }
    return fetchClient(`/api/todos/${encodeURIComponent(id)}`, OkResponseSchema, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  },
};
