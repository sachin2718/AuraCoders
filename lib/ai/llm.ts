/**
 * lib/ai/llm.ts
 *
 * Gemini-first LLM wrapper used by the meeting synthesis pipeline.
 * When Gemini is not configured, it uses the server-side Groq wrapper so the
 * demo still produces summaries with the Groq key already used by the bot.
 *
 * Env vars required:
 *   GEMINI_API_KEY or LLM_API_KEY – Gemini API key (never logged)
 *   GROQ_API_KEY – fallback provider (never logged)
 *   GEMINI_MODEL or LLM_MODEL – Gemini Flash model name
 */

import { callGroq } from "./groq";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LLMOpts {
  /** Optional system instruction prepended to the conversation. */
  system?: string;
  /** Sampling temperature. Default 0.1 for deterministic outputs. */
  temperature?: number;
  /**
   * When true (default): asks Gemini for application/json MIME type and
   * returns the parsed object.
   * When false: returns the raw text string.
   */
  json?: boolean;
}

/** Thrown when Gemini returns 429 or 5xx after all retries are exhausted. */
export class RateLimitError extends Error {
  public readonly status: number;
  public readonly attempts: number;

  constructor(message: string, status: number, attempts: number) {
    super(message);
    this.name = "RateLimitError";
    this.status = status;
    this.attempts = attempts;
    // Restore prototype chain (required when extending built-ins in TS)
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/** Internal error thrown by providerCall() to signal the caller should retry. */
class RetryableError extends Error {
  public readonly status: number;
  constructor(status: number) {
    super(`HTTP ${status} — retryable`);
    this.name = "RetryableError";
    this.status = status;
    Object.setPrototypeOf(this, RetryableError.prototype);
  }
}

// ─── In-memory cache ──────────────────────────────────────────────────────────

type CacheEntry = { value: unknown; cachedAt: number };
const cache = new Map<string, CacheEntry>();

/** djb2 hash — fast, zero-dependency, good enough for cache keying. */
function hashKey(parts: string[]): string {
  let h = 5381;
  const str = parts.join("\x00");
  for (let i = 0; i < str.length; i++) {
    // eslint-disable-next-line no-bitwise
    h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0; // keep 32-bit unsigned
  }
  return h.toString(36);
}

// ─── Retry config ─────────────────────────────────────────────────────────────

const MAX_TRIES = 4;
const BASE_DELAY_MS = 1_000;

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Gemini REST shapes (minimal — only what we read/write) ───────────────────

interface GeminiContent {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

interface GeminiRequest {
  system_instruction?: { parts: Array<{ text: string }> };
  contents: GeminiContent[];
  generationConfig: {
    temperature: number;
    responseMimeType?: string;
  };
}

interface GeminiCandidate {
  content: { parts: Array<{ text: string }> };
  finishReason: string;
}

interface GeminiUsage {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsage;
  error?: { message: string; code: number };
}

// ─── Provider call (swap here to change providers) ────────────────────────────

/**
 * Makes exactly ONE HTTP request to the Gemini generateContent REST endpoint.
 *
 * Throws:
 *   RetryableError  – for 429 / 5xx (caller retries with back-off)
 *   Error           – for all other non-OK responses or Gemini-level errors
 */
async function providerCall(
  prompt: string,
  opts: Required<LLMOpts>,
): Promise<{ text: string; promptTokens: number; outputTokens: number }> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.LLM_API_KEY;
  if (!apiKey && process.env.GROQ_API_KEY) {
    const expectsArray = prompt.includes("Return ONLY a JSON array");
    const groqPrompt = expectsArray
      ? `${prompt}\n\nThe provider requires a JSON object. Return {"items":[...]} where items contains the requested array.`
      : prompt;
    const text = await callGroq([
      ...(opts.system ? [{ role: "system" as const, content: opts.system }] : []),
      { role: "user" as const, content: groqPrompt },
    ]);
    return { text, promptTokens: 0, outputTokens: 0 };
  }

  if (!apiKey) {
    throw new Error("Configure GEMINI_API_KEY, LLM_API_KEY, or GROQ_API_KEY on the server.");
  }

  const model = process.env.GEMINI_MODEL || process.env.LLM_MODEL || "gemini-1.5-flash";
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${model}:generateContent?key=${apiKey}`;

  const body: GeminiRequest = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: opts.temperature,
      ...(opts.json ? { responseMimeType: "application/json" } : {}),
    },
  };

  if (opts.system) {
    body.system_instruction = { parts: [{ text: opts.system }] };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    if (isRetryableStatus(res.status)) {
      // Use a dedicated typed error — no property-mutation hacks needed
      throw new RetryableError(res.status);
    }
    let apiMessage = res.statusText;
    try {
      const errBody = (await res.json()) as { error?: { message?: string } };
      if (errBody?.error?.message) apiMessage = errBody.error.message;
    } catch {
      // ignore JSON parse failure on error body
    }
    throw new Error(`Gemini API error ${res.status}: ${apiMessage}`);
  }

  const data = (await res.json()) as GeminiResponse;

  if (data.error) {
    throw new Error(`Gemini error ${data.error.code}: ${data.error.message}`);
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const promptTokens = data.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = data.usageMetadata?.candidatesTokenCount ?? 0;

  return { text, promptTokens, outputTokens };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Call the LLM with caching, retries, and optional JSON mode.
 *
 * @param prompt - The user-facing prompt string.
 * @param opts   - Options: system prompt, temperature, json mode.
 * @returns      Parsed JSON object when opts.json=true, raw string otherwise.
 */
export async function callLLM(prompt: string, opts: LLMOpts = {}): Promise<unknown> {
  const resolved: Required<LLMOpts> = {
    system: opts.system ?? "",
    temperature: opts.temperature ?? 0.1,
    json: opts.json ?? true,
  };

  const model = process.env.GEMINI_MODEL || process.env.LLM_MODEL || "gemini-1.5-flash";
  const cacheKey = hashKey([
    model,
    resolved.system,
    prompt,
    String(resolved.temperature),
    String(resolved.json),
  ]);

  // ── Cache hit ────────────────────────────────────────────────────────────────
  const hit = cache.get(cacheKey);
  if (hit) {
    if (process.env.NODE_ENV === "development") {
      console.log(`[LLM] cache hit (key=${cacheKey})`);
    }
    return hit.value;
  }

  // ── Retry loop ───────────────────────────────────────────────────────────────
  let lastError: Error = new Error("Unknown LLM error"); // always overwritten below

  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    const t0 = Date.now();

    try {
      const { text, promptTokens, outputTokens } = await providerCall(prompt, resolved);

      if (process.env.NODE_ENV === "development") {
        console.log(
          `[LLM] ok  attempt=${attempt}  latency=${Date.now() - t0}ms  ` +
            `prompt_tokens=${promptTokens}  output_tokens=${outputTokens}  model=${model}`,
        );
      }

      let result: unknown = text;
      if (resolved.json) {
        // Strip markdown fences Gemini occasionally wraps around JSON output
        const cleaned = text
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```\s*$/, "")
          .trim();
        result = JSON.parse(cleaned);
        if (result && typeof result === "object" && !Array.isArray(result)) {
          const wrapped = result as { items?: unknown; action_items?: unknown };
          if (Array.isArray(wrapped.items)) result = wrapped.items;
          if (Array.isArray(wrapped.action_items)) result = wrapped.action_items;
        }
      }

      cache.set(cacheKey, { value: result, cachedAt: Date.now() });
      return result;

    } catch (err) {
      // Normalise to Error so we always have .message
      lastError = err instanceof Error ? err : new Error(String(err));

      const shouldRetry = lastError instanceof RetryableError;

      if (!shouldRetry || attempt === MAX_TRIES) {
        break;
      }

      const delayMs = BASE_DELAY_MS * Math.pow(2, attempt - 1); // 1 s, 2 s, 4 s, 8 s
      if (process.env.NODE_ENV === "development") {
        console.warn(
          `[LLM] retryable error on attempt ${attempt}/${MAX_TRIES} — ` +
            `backing off ${delayMs}ms…`,
        );
      }
      await sleep(delayMs);
    }
  }

  // ── All retries exhausted ────────────────────────────────────────────────────
  const status = lastError instanceof RetryableError ? lastError.status : 0;
  if (status > 0) {
    throw new RateLimitError(
      `Gemini unavailable after ${MAX_TRIES} attempts (HTTP ${status}): ${lastError.message}`,
      status,
      MAX_TRIES,
    );
  }

  throw lastError;
}
