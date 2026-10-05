"use client";

import { useEffect, useRef, useState } from "react";

type SpeechAlternativeLike = { transcript: string };
type SpeechResultLike = { isFinal: boolean; 0: SpeechAlternativeLike };
type SpeechEventLike = { resultIndex: number; results: ArrayLike<SpeechResultLike> };
type SpeechErrorLike = { error: string };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
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
type UseSpeechOptions = {
  enabled: boolean;
  startedAt: number;
  lang?: string;
  onFinal: (result: SpeechFinal) => void;
};

export function useSpeech({ enabled, startedAt, lang = "en-US", onFinal }: UseSpeechOptions) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
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
        recognition.lang = lang;
        recognition.onresult = (event) => {
          for (let index = event.resultIndex; index < event.results.length; index += 1) {
            const result = event.results[index];
            if (!result?.isFinal) continue;
            const text = result[0]?.transcript?.trim();
            if (text) onFinalRef.current({ text, tMs: Math.max(0, Date.now() - startedAt) });
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
        setError(null);
      } catch (cause) {
        if (!stopped) setError(cause instanceof Error ? cause.message : "Speech recognition could not start.");
      }
    };

    start();
    return () => {
      stopped = true;
      if (restartTimer !== undefined) window.clearTimeout(restartTimer);
      recognition?.stop();
    };
  }, [enabled, lang, startedAt]);

  return { supported, error };
}
