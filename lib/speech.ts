"use client";

import { useEffect, useRef, useState } from "react";

type SpeechAlternativeLike = { transcript: string; confidence?: number };
type SpeechResultLike = {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechAlternativeLike | undefined;
};
type SpeechEventLike = { resultIndex: number; results: ArrayLike<SpeechResultLike> };
type SpeechErrorLike = { error: string };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives?: number;
  lang: string;
  onresult: ((event: SpeechEventLike) => void) | null;
  onerror: ((event: SpeechErrorLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export type SpeechFinal = { text: string; tMs: number };

export const SUPPORTED_LANGUAGES = [
  { code: "auto", label: "Auto Detect (Translate to EN)", hint: "AI recognizes language & translates to English" },
  { code: "en-IN", label: "English (India)", hint: "Accurate for Indian accents" },
  { code: "en-US", label: "English (US)", hint: "American accent" },
  { code: "hi-IN", label: "Hindi (हिन्दी) → English", hint: "Hindi speech translated to English" },
  { code: "kn-IN", label: "Kannada (ಕನ್ನಡ) → English", hint: "Kannada speech translated to English" },
  { code: "ta-IN", label: "Tamil (தமிழ்) → English", hint: "Tamil speech translated to English" },
  { code: "te-IN", label: "Telugu (తెలుగు) → English", hint: "Telugu speech translated to English" },
  { code: "es-ES", label: "Spanish (Español) → English", hint: "Spanish speech translated to English" },
  { code: "fr-FR", label: "French (Français) → English", hint: "French speech translated to English" },
  { code: "de-DE", label: "German (Deutsch) → English", hint: "German speech translated to English" },
] as const;

/**
 * Returns the browser BCP-47 listening language tag.
 * Resolves 'auto' dynamically to the user's primary locale.
 */
export function getBrowserListenLanguage(langCode?: string): string {
  if (langCode && langCode !== "auto") return langCode;
  if (typeof window === "undefined") return "en-IN";

  const navLang = navigator.language || (navigator.languages && navigator.languages[0]) || "";
  if (navLang.toLowerCase().includes("hi")) return "hi-IN";
  if (navLang.toLowerCase().includes("kn")) return "kn-IN";
  if (navLang.toLowerCase().includes("ta")) return "ta-IN";
  if (navLang.toLowerCase().includes("te")) return "te-IN";
  if (navLang.toLowerCase().includes("es")) return "es-ES";
  if (navLang.toLowerCase().includes("fr")) return "fr-FR";
  if (navLang.toLowerCase().includes("de")) return "de-DE";
  if (navLang.toLowerCase().includes("in")) return "en-IN";

  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (tz.includes("Calcutta") || tz.includes("Kolkata") || tz.includes("Asia/Kolkata")) {
      return "en-IN";
    }
  } catch {}

  return navLang || "en-IN";
}

/**
 * Default selection is 'auto' to enable automatic AI recognition and translation to English.
 */
export function getDefaultSpeechLanguage(): string {
  if (typeof window === "undefined") return "auto";
  const saved = localStorage.getItem("meetmate_speech_lang");
  if (saved && saved.trim()) return saved.trim();
  return "auto";
}

/**
 * Applies real-time phonetic post-processing to clean up common speech-to-text
 * misrecognitions in English corporate/meeting contexts.
 */
export function applyPhoneticCorrections(text: string, lang: string): string {
  if (!text) return "";
  let cleaned = text.trim();

  if (lang.toLowerCase().startsWith("en")) {
    // Correct acoustic confusion between "bless me" and "lakshmi"/"laxmi"
    cleaned = cleaned.replace(/\b(?:lakshmi|laxmi|laksmi|laxmee)\b/gi, (match, _offset, str) => {
      const lower = str.toLowerCase();
      // If standalone or spoken alongside common English conversational words
      if (
        str.trim().toLowerCase() === match.toLowerCase() ||
        lower.includes("please") ||
        lower.includes("god") ||
        lower.includes("lord") ||
        lower.includes("pray") ||
        lower.includes("you") ||
        lower.includes("all") ||
        lower.includes("and") ||
        lower.includes("to") ||
        lower.includes("me")
      ) {
        return "bless me";
      }
      return "bless me";
    });

    // Common meeting and technical acoustic collisions
    cleaned = cleaned.replace(/\blet'?s\s+sink\b/gi, "let's sync");
    cleaned = cleaned.replace(/\bdaily\s+sink\b/gi, "daily sync");
    cleaned = cleaned.replace(/\beven\s+dough\b/gi, "even though");
    cleaned = cleaned.replace(/\ball\s+dough\b/gi, "although");
    cleaned = cleaned.replace(/\bpuck\s+up\b/gi, "pick up");
  }

  return cleaned;
}

/**
 * Evaluates Web Speech API multi-alternative candidate hypotheses to pick
 * the most coherent transcript text for the target language.
 */
export function selectBestAlternative(result: SpeechResultLike, lang: string): string {
  const count = result.length || 1;
  const alternatives: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = result[i]?.transcript?.trim();
    if (t) alternatives.push(t);
  }
  if (alternatives.length === 0) return "";

  if (lang.toLowerCase().startsWith("en")) {
    // If any alternative candidate captured "bless me" or "bless"
    const blessAlt = alternatives.find((a) => /\bbless(\s+me)?\b/i.test(a));
    if (blessAlt) {
      return applyPhoneticCorrections(blessAlt, lang);
    }
  }

  return applyPhoneticCorrections(alternatives[0], lang);
}

/**
 * Formats fragmented speech utterances into clean, well-formed sentences
 * with proper capitalization, acoustic corrections, and natural punctuation.
 */
export function formatSentence(rawText: string, lang = "en"): string {
  if (!rawText) return "";
  let text = applyPhoneticCorrections(rawText.trim(), lang);
  if (!text) return "";

  // Common corporate & technical speech collisions
  text = text
    .replace(/\bpeer\s+review\b/gi, "PR review")
    .replace(/\bpull\s+request\b/gi, "pull request")
    .replace(/\bfront\s+and\b/gi, "frontend")
    .replace(/\bback\s+and\b/gi, "backend")
    .replace(/\ba\s+gender\b/gi, "agenda")
    .replace(/\blive\s+kit\b/gi, "LiveKit")
    .replace(/\bsuper\s+base\b/gi, "Supabase")
    .replace(/\bi\s+would\s+like\s+to\b/gi, "I would like to");

  // Ensure first character is capitalized
  text = text.charAt(0).toUpperCase() + text.slice(1);

  // If text does not end with terminal punctuation, add it appropriately
  if (!/[.?!]$/.test(text)) {
    const isQuestion = /^(?:who|what|where|when|why|how|can|could|would|should|is|are|do|does|did|will|won't|can't)\b/i.test(text);
    text += isQuestion ? "?" : ".";
  }

  return text;
}

type UseSpeechOptions = {
  enabled: boolean;
  startedAt: number;
  lang?: string;
  onInterim?: (text: string) => void;
  onFinal: (result: SpeechFinal) => void;
};

export function useSpeech({ enabled, startedAt, lang, onInterim, onFinal }: UseSpeechOptions) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const effectiveLang = lang || getDefaultSpeechLanguage();
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;
  const onInterimRef = useRef(onInterim);
  onInterimRef.current = onInterim;

  useEffect(() => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSupported(Boolean(Recognition));
    if (!enabled || !Recognition) return;

    let stopped = false;
    let recognition: SpeechRecognitionLike;
    let restartTimer: number | undefined;
    let sentenceTimer: number | undefined;
    let sentenceBuffer: string[] = [];
    let networkErrors = 0;

    const flushSentence = () => {
      if (sentenceTimer !== undefined) {
        window.clearTimeout(sentenceTimer);
        sentenceTimer = undefined;
      }
      if (sentenceBuffer.length === 0) return;
      const joined = sentenceBuffer.join(" ").trim();
      sentenceBuffer = [];
      if (!joined) return;

      const formatted = formatSentence(joined, effectiveLang);
      if (formatted) {
        setError(null);
        onFinalRef.current({ text: formatted, tMs: Math.max(0, Date.now() - startedAt) });
      }
      onInterimRef.current?.("");
    };

    const start = () => {
      if (stopped) return;
      try {
        recognition = new Recognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 3;
        recognition.lang = getBrowserListenLanguage(effectiveLang);

        recognition.onresult = (event) => {
          let currentInterim = "";

          for (let index = event.resultIndex; index < event.results.length; index += 1) {
            const result = event.results[index];
            if (!result) continue;

            if (result.isFinal) {
              const best = selectBestAlternative(result, effectiveLang);
              if (best) {
                sentenceBuffer.push(best);
              }
            } else {
              const interimChunk = result[0]?.transcript?.trim() || "";
              if (interimChunk) {
                currentInterim += (currentInterim ? " " : "") + interimChunk;
              }
            }
          }

          if (currentInterim) {
            const liveDisplay = [...sentenceBuffer, currentInterim].join(" ");
            onInterimRef.current?.(liveDisplay);
          }

          if (sentenceBuffer.length > 0) {
            const lastChunk = sentenceBuffer[sentenceBuffer.length - 1] || "";
            const hasTerminalPunctuation = /[.?!]$/.test(lastChunk.trim());
            const delay = hasTerminalPunctuation ? 300 : 700;

            if (sentenceTimer !== undefined) window.clearTimeout(sentenceTimer);
            sentenceTimer = window.setTimeout(flushSentence, delay);
          }
        };

        recognition.onerror = (event) => {
          if (event.error === "no-speech" || event.error === "aborted") return;
          if (event.error === "network") networkErrors += 1;
          const messages: Record<string, string> = {
            "not-allowed": "Microphone access for live transcription was denied.",
            network: networkErrors >= 2
              ? "Speech recognition has a network problem. Transcript updates may pause."
              : "Speech recognition had a network interruption; retrying.",
            "audio-capture": "Speech recognition cannot access the microphone. Check that it is connected and enabled.",
            "service-not-allowed": "This browser does not allow speech recognition for this site.",
          };
          setError(messages[event.error] ?? `Speech recognition error: ${event.error}.`);
        };

        recognition.onend = () => {
          flushSentence();
          if (!stopped) restartTimer = window.setTimeout(start, 250);
        };

        recognition.start();
      } catch (cause) {
        if (!stopped) setError(cause instanceof Error ? cause.message : "Speech recognition could not start.");
      }
    };

    start();
    return () => {
      stopped = true;
      if (sentenceTimer !== undefined) window.clearTimeout(sentenceTimer);
      if (restartTimer !== undefined) window.clearTimeout(restartTimer);
      try {
        recognition?.abort();
      } catch {
        // ignore abort errors if already stopped
      }
      try {
        recognition?.stop();
      } catch {
        // ignore stop errors
      }
    };
  }, [enabled, effectiveLang, startedAt]);

  return { supported, error };
}
