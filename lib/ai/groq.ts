export type GroqMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type GroqResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

type GroqTranscriptionResponse = {
  text?: string;
  error?: { message?: string };
};

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// Groq retired the older Llama IDs for some projects. GPT-OSS is the current
// production model family and supports JSON object responses.
const DEFAULT_MODEL = "openai/gpt-oss-120b";
const FALLBACK_MODEL = "openai/gpt-oss-20b";

export async function callGroq(messages: GroqMessage[]): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured on the server.");
  }

  const configuredModel = process.env.GROQ_MODEL || DEFAULT_MODEL;
  const models = configuredModel === DEFAULT_MODEL
    ? [configuredModel, FALLBACK_MODEL]
    : [configuredModel];
  let lastError = "Groq request failed.";

  for (const model of models) {
    const request = async (jsonMode: boolean) => fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
        max_tokens: 1200,
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(25_000),
    });

    let response = await request(true);
    let data = (await response.json().catch(() => ({}))) as GroqResponse;
    if (
      !response.ok &&
      response.status === 400 &&
      data.error?.message?.toLowerCase().includes("failed_generation")
    ) {
      response = await request(false);
      data = (await response.json().catch(() => ({}))) as GroqResponse;
    }

    if (response.ok) {
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error("Groq returned an empty response.");
      return content;
    }

    lastError = data.error?.message || `Groq request failed (${response.status}).`;
    if (![400, 403, 404].includes(response.status) || model === models[models.length - 1]) {
      throw new Error(lastError);
    }
  }

  throw new Error(lastError);
}

/**
 * Transcribe a short audio clip with Groq Whisper.
 * This function is server-only by convention: the API key is read from the
 * server environment and is never sent to the browser.
 */
export async function transcribeGroqAudio(
  audio: Blob,
  filename = "meetmate-audio.webm",
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured on the server.");
  }

  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", process.env.GROQ_TRANSCRIPTION_MODEL || "whisper-large-v3-turbo");
  form.append("response_format", "json");
  form.append("language", "en");

  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  const data = (await response.json().catch(() => ({}))) as GroqTranscriptionResponse;

  if (!response.ok) {
    throw new Error(data.error?.message || `Groq transcription failed (${response.status}).`);
  }

  return data.text?.trim() || "";
}
