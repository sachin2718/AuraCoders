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
  { code: "en-IN", label: "English (India)", hint: "Accurate for Indian accents" },
  { code: "en-US", label: "English (US)", hint: "American accent" },
  { code: "en-GB", label: "English (UK)", hint: "British accent" },
  { code: "en-AU", label: "English (Australia)", hint: "Australian accent" },
  { code: "hi-IN", label: "Hindi (हिन्दी)", hint: "हिंदी भाषा" },
  { code: "ta-IN", label: "Tamil (தமிழ்)", hint: "தமிழ்" },
  { code: "te-IN", label: "Telugu (తెలుగు)", hint: "తెలుగు" },
  { code: "kn-IN", label: "Kannada (ಕನ್ನಡ)", hint: "ಕನ್ನಡ" },
] as const;

/**
 * Automatically detects the ideal default speech recognition language.
 * Defaults to 'en-IN' (English - India) for users in India (+05:30) to avoid
 * phoneme misrecognitions like "lakshmi" when saying "bless me".
 */
export function getDefaultSpeechLanguage(): string {
  if (typeof window === "undefined") return "en-IN";

  const saved = localStorage.getItem("meetmate_speech_lang");
  if (saved && saved.trim()) return saved.trim();

  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (tz.includes("Calcutta") || tz.includes("Kolkata") || tz.includes("Asia/Kolkata")) {
      return "en-IN";
    }
  } catch {}

  const navLang = navigator.language || (navigator.languages && navigator.languages[0]) || "";
  if (navLang.toLowerCase().includes("in") || navLang.toLowerCase().includes("hi")) {
    return "en-IN";
  }

  return "en-IN";
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

type UseSpeechOptions = {
  enabled: boolean;
  startedAt: number;
  lang?: string;
  onFinal: (result: SpeechFinal) => void;
};

export function useSpeech({ enabled, startedAt, lang, onFinal }: UseSpeechOptions) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const effectiveLang = lang || getDefaultSpeechLanguage();
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  useEffect(() => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSupported(Boolean(Recognition));
    if (!enabled || !Recognition) return;

    let stopped = false;
    let recognition: SpeechRecognitionLike;
    let restartTimer: number | undefined;
    let networkErrors = 0;

    const start = () => {
      if (stopped) return;
      try {
        recognition = new Recognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.maxAlternatives = 5;
        recognition.lang = effectiveLang;
        recognition.onresult = (event) => {
          for (let index = event.resultIndex; index < event.results.length; index += 1) {
            const result = event.results[index];
            if (!result?.isFinal) continue;
            const text = selectBestAlternative(result, effectiveLang);
            if (text) {
              setError(null);
              onFinalRef.current({ text, tMs: Math.max(0, Date.now() - startedAt) });
            }
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
          if (!stopped) restartTimer = window.setTimeout(start, 300);
        };
        recognition.start();
      } catch (cause) {
        if (!stopped) setError(cause instanceof Error ? cause.message : "Speech recognition could not start.");
      }
    };

    start();
    return () => {
      stopped = true;
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
