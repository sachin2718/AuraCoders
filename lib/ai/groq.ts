export type GroqMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type GroqResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const FALLBACK_MODEL = "llama-3.1-8b-instant";

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
    const response = await fetch(GROQ_URL, {
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
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(25_000),
    });

    const data = (await response.json().catch(() => ({}))) as GroqResponse;
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
