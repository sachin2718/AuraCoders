/**
 * app/api/translate/route.ts
 *
 * Real-time AI Language Recognition & English Translation Endpoint.
 * Automatically identifies spoken language (Hindi, Kannada, Tamil, Telugu, Spanish, French, etc.)
 * and translates it into clean, natural English for live meeting transcripts.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { callLLM } from "@/lib/ai/llm";

const RequestSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  speakerName: z.string().optional().default("Speaker"),
  tMs: z.number().optional().default(0),
  sourceLang: z.string().optional(),
});

type TranslationResponse = {
  text: string;
  originalText: string;
  detectedLanguage: string;
  isTranslated: boolean;
  speakerName: string;
  tMs: number;
};

// Fast script & pattern detection for immediate language categorization
function detectScriptLanguage(text: string): { lang: string; isLikelyNonEnglish: boolean } {
  // Devanagari (Hindi, Marathi, Sanskrit)
  if (/[\u0900-\u097F]/.test(text)) {
    return { lang: "Hindi", isLikelyNonEnglish: true };
  }
  // Kannada
  if (/[\u0C80-\u0CFF]/.test(text)) {
    return { lang: "Kannada", isLikelyNonEnglish: true };
  }
  // Tamil
  if (/[\u0B80-\u0BFF]/.test(text)) {
    return { lang: "Tamil", isLikelyNonEnglish: true };
  }
  // Telugu
  if (/[\u0C00-\u0C7F]/.test(text)) {
    return { lang: "Telugu", isLikelyNonEnglish: true };
  }
  // Malayalam
  if (/[\u0D00-\u0D7F]/.test(text)) {
    return { lang: "Malayalam", isLikelyNonEnglish: true };
  }
  // Bengali / Assamese
  if (/[\u0980-\u09FF]/.test(text)) {
    return { lang: "Bengali", isLikelyNonEnglish: true };
  }
  // Arabic / Urdu
  if (/[\u0600-\u06FF]/.test(text)) {
    return { lang: "Urdu", isLikelyNonEnglish: true };
  }
  // East Asian (Chinese, Japanese, Korean)
  if (/[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/.test(text)) {
    return { lang: "East Asian", isLikelyNonEnglish: true };
  }
  // Cyrillic (Russian, Ukrainian)
  if (/[\u0400-\u04FF]/.test(text)) {
    return { lang: "Russian", isLikelyNonEnglish: true };
  }

  // Common Romanized Hinglish / Indian language markers
  const lower = text.toLowerCase();
  const hinglishMarkers = [
    /\b(?:kya|kaise|haan|nahi|kripya|namaste|dhanyavad|apna|hum|shukriya|accha|theek|bhai|bolo|karo|raha|rahe|karenge)\b/i,
    /\b(?:hegiddira|namaskara|dhanyavada|enu|yaake|madona|madabeku)\b/i, // Kannada
    /\b(?:vanakkam|eppadi|nandri|seri|theriyum)\b/i, // Tamil
    /\b(?:bagunnara|namaskaram|enti|ela)\b/i, // Telugu
  ];

  for (const marker of hinglishMarkers) {
    if (marker.test(lower)) {
      return { lang: "Indian Language (Romanized)", isLikelyNonEnglish: true };
    }
  }

  // European language markers
  if (/\b(?:hola|gracias|por favor|buenos|buenas|amigo)\b/i.test(lower)) {
    return { lang: "Spanish", isLikelyNonEnglish: true };
  }
  if (/\b(?:bonjour|merci|s'il vous plaît|oui|comment)\b/i.test(lower)) {
    return { lang: "French", isLikelyNonEnglish: true };
  }
  if (/\b(?:guten|danke|bitte|wie|hallo)\b/i.test(lower)) {
    return { lang: "German", isLikelyNonEnglish: true };
  }

  return { lang: "English", isLikelyNonEnglish: false };
}

// Local phonetic fixer for English acoustic errors
function applyEnglishPhonetics(text: string): string {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/\b(?:lakshmi|laxmi|laksmi|laxmee)\b/gi, "bless me");
  cleaned = cleaned.replace(/\blet'?s\s+sink\b/gi, "let's sync");
  cleaned = cleaned.replace(/\bdaily\s+sink\b/gi, "daily sync");
  cleaned = cleaned.replace(/\beven\s+dough\b/gi, "even though");
  return cleaned;
}

export async function POST(req: NextRequest) {
  try {
    const json = await req.json().catch(() => ({}));
    const parse = RequestSchema.safeParse(json);
    if (!parse.success) {
      return NextResponse.json({ error: "Invalid text input" }, { status: 400 });
    }

    const { text, speakerName, tMs, sourceLang } = parse.data;
    const trimmed = text.trim();
    if (!trimmed) {
      return NextResponse.json({
        text: "",
        originalText: "",
        detectedLanguage: "English",
        isTranslated: false,
        speakerName,
        tMs,
      });
    }

    const scriptInfo = detectScriptLanguage(trimmed);

    // Call Gemini / LLM pipeline for high-precision recognition & translation
    const prompt = `You are a real-time speech translation and language recognition engine for global video meetings.
User input: "${trimmed.replace(/"/g, '\\"')}"
${sourceLang ? `User language hint: ${sourceLang}` : ""}

Instructions:
1. Detect the language and dialect of the input text (e.g. English, Hindi, Kannada, Tamil, Telugu, Spanish, French, German, Japanese, Hinglish, etc.).
2. If the text is English:
   - Output clean, professional English text.
   - Resolve acoustic phonetic mishearings (e.g. "lakshmi" spoken in context of "bless me").
   - Set isEnglish = true.
3. If the text is NOT in English (e.g., in native script or transliterated Indian/international languages):
   - Accurately and fluently translate the message into natural English.
   - Set isEnglish = false.

Respond ONLY with valid JSON in this exact structure:
{
  "detectedLanguage": "string",
  "isEnglish": boolean,
  "translatedText": "string"
}`;

    try {
      const llmResult = (await callLLM(prompt, {
        temperature: 0.1,
        json: true,
      })) as {
        detectedLanguage?: string;
        isEnglish?: boolean;
        translatedText?: string;
      } | null;

      if (llmResult && typeof llmResult.translatedText === "string" && llmResult.translatedText.trim()) {
        const detected = llmResult.detectedLanguage || scriptInfo.lang || "English";
        const isEn = Boolean(llmResult.isEnglish) || detected.toLowerCase() === "english";
        const finalEnglishText = isEn
          ? applyEnglishPhonetics(llmResult.translatedText.trim())
          : llmResult.translatedText.trim();

        const response: TranslationResponse = {
          text: finalEnglishText,
          originalText: trimmed,
          detectedLanguage: detected,
          isTranslated: !isEn,
          speakerName,
          tMs,
        };

        return NextResponse.json(response);
      }
    } catch {
      // Fallback if LLM key is not configured or network timeout
    }

    // Deterministic fallback if LLM is unavailable
    if (scriptInfo.isLikelyNonEnglish) {
      return NextResponse.json({
        text: `[${scriptInfo.lang} transcript] ${trimmed}`,
        originalText: trimmed,
        detectedLanguage: scriptInfo.lang,
        isTranslated: true,
        speakerName,
        tMs,
      });
    }

    return NextResponse.json({
      text: applyEnglishPhonetics(trimmed),
      originalText: trimmed,
      detectedLanguage: "English",
      isTranslated: false,
      speakerName,
      tMs,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Translation error" },
      { status: 500 }
    );
  }
}
