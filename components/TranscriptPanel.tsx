"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { RoomEvent } from "livekit-client";
import { useRoomContext } from "@livekit/components-react";
import { ChevronDown, AlertTriangle, ArrowDown, Copy, Check, FileText, Globe, Sparkles } from "lucide-react";
import { SUPPORTED_LANGUAGES } from "../lib/speech";

export type TranscriptLine = {
  speakerName: string;
  text: string;
  tMs: number;
  originalText?: string;
  detectedLanguage?: string;
  isTranslated?: boolean;
};

export interface TranscriptPanelProps {
  supported?: boolean | null;
  speechError?: string | null;
  localLines?: TranscriptLine[];
  className?: string;
  language?: string;
  onLanguageChange?: (lang: string) => void;
}

/**
 * Deterministically generates a vibrant, accessible HSL color from any speaker name.
 * Uses golden-ratio hue hopping so similar names receive distinctly contrasting colors.
 */
export function getSpeakerColor(name: string): string {
  if (!name || !name.trim()) return "hsl(210, 85%, 75%)";
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  const hue = Math.round((hash * 137.5) % 360);
  return `hsl(${hue}, 85%, 74%)`;
}

/**
 * Formats elapsed meeting time (milliseconds) as mm:ss.
 */
export function formatTime(tMs: number): string {
  const totalSeconds = Math.max(0, Math.floor((tMs || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function TranscriptPanel({
  supported,
  speechError,
  localLines = [],
  className = "",
  language = "en-IN",
  onLanguageChange,
}: TranscriptPanelProps) {
  const room = useRoomContext();
  const [receivedLines, setReceivedLines] = useState<TranscriptLine[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);

  // Synchronize state and ref
  const setScrolledUpState = (val: boolean) => {
    userScrolledUpRef.current = val;
    setUserScrolledUp(val);
  };

  // Subscribe to the LiveKit data channel topic "transcript"
  useEffect(() => {
    if (!room) return;

    const handleData = (
      payload: Uint8Array,
      _participant?: unknown,
      _kind?: unknown,
      topic?: string
    ) => {
      if (topic !== "transcript") return;
      try {
        let rawStr = "";
        if (payload instanceof Uint8Array) {
          rawStr = new TextDecoder().decode(payload);
        } else if (typeof payload === "string") {
          rawStr = payload;
        } else {
          rawStr = new TextDecoder().decode(new Uint8Array(payload as ArrayBuffer));
        }

        const data = JSON.parse(rawStr) as Record<string, unknown>;
        if (!data || typeof data.text !== "string" || !data.text.trim()) return;

        const speakerName =
          typeof data.speakerName === "string" && data.speakerName.trim()
            ? data.speakerName.trim()
            : "Speaker";
        const tMs =
          typeof data.tMs === "number"
            ? data.tMs
            : typeof data.t_ms === "number"
            ? data.t_ms
            : typeof data.timestamp_ms === "number"
            ? data.timestamp_ms
            : Date.now();

        const newLine: TranscriptLine = {
          speakerName,
          text: data.text.trim(),
          tMs,
          originalText: typeof data.originalText === "string" ? data.originalText : undefined,
          detectedLanguage: typeof data.detectedLanguage === "string" ? data.detectedLanguage : undefined,
          isTranslated: Boolean(data.isTranslated),
        };

        setReceivedLines((current) => [...current, newLine]);
      } catch {
        // Silently ignore unrelated or malformed packets
      }
    };

    room.on(RoomEvent.DataReceived, handleData);
    return () => {
      room.off(RoomEvent.DataReceived, handleData);
    };
  }, [room]);

  // Combine and deduplicate local + received lines, sorted deterministically in order of tMs
  // This guarantees that all participants see the exact same chronological merged transcript.
  const lines = useMemo(() => {
    const unique = new Map<string, TranscriptLine>();
    const all = [...localLines, ...receivedLines];

    for (const line of all) {
      if (!line || !line.text) continue;
      // Deduplicate identical speaker + timestamp + text combinations
      const key = `${line.tMs}\u0000${line.speakerName}\u0000${line.text.trim()}`;
      if (!unique.has(key)) {
        unique.set(key, {
          speakerName: line.speakerName || "Speaker",
          text: line.text.trim(),
          tMs: Number(line.tMs) || 0,
          originalText: line.originalText,
          detectedLanguage: line.detectedLanguage,
          isTranslated: line.isTranslated,
        });
      }
    }

    return Array.from(unique.values()).sort(
      (left, right) =>
        left.tMs - right.tMs ||
        left.speakerName.localeCompare(right.speakerName) ||
        left.text.localeCompare(right.text)
    );
  }, [localLines, receivedLines]);

  // Auto-scroll to bottom whenever new lines arrive unless the user has scrolled up
  useEffect(() => {
    if (collapsed) return;
    const list = listRef.current;
    if (!list) return;

    if (!userScrolledUpRef.current) {
      list.scrollTop = list.scrollHeight;
    }
  }, [lines, collapsed]);

  // Handle scroll events to detect if user has scrolled up
  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    // Consider user at bottom if within 36px threshold
    const atBottom = distanceFromBottom <= 36;
    setScrolledUpState(!atBottom);
  };

  const scrollToBottom = useCallback(() => {
    const list = listRef.current;
    if (list) {
      list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
      setScrolledUpState(false);
    }
  }, []);

  const copyTranscript = async () => {
    if (lines.length === 0) return;
    const textToCopy = lines
      .map((l) => `[${formatTime(l.tMs)}] ${l.speakerName}: ${l.text}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const isBrowserUnsupported =
    typeof window !== "undefined" &&
    supported === undefined &&
    !(
      window.SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown })
        .webkitSpeechRecognition
    );

  const showWarning =
    supported === false || isBrowserUnsupported || Boolean(speechError);

  return (
    <section
      className={`flex flex-col rounded-2xl border-2 border-[#800020]/25 bg-white shadow-md transition-all duration-200 ${
        collapsed ? "h-auto shrink-0" : "h-full min-h-64"
      } ${className}`}
      aria-label="Live transcript"
    >
      {/* Header */}
      <header className="flex items-center justify-between gap-3 border-b-2 border-[#800020]/15 bg-[#FFF0F3] px-4 py-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-[#800020]" />
          <h2 className="text-sm font-bold text-[#800020] flex items-center gap-2">
            Live Transcript
            <span className="rounded-full bg-[#800020] px-2 py-0.5 text-xs font-bold text-white">
              {lines.length}
            </span>
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-[#800020] px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
              <Sparkles className="h-2.5 w-2.5" />
              <span>Auto-Translate EN</span>
            </span>
          </h2>
        </div>

        <div className="flex items-center gap-1.5">
          {onLanguageChange && (
            <select
              value={language}
              onChange={(e) => onLanguageChange(e.target.value)}
              aria-label="Speech language"
              className="rounded-lg border border-[#F0B8C4] bg-white px-2 py-1 text-[11px] font-bold text-[#800020] hover:border-[#800020] transition shadow-xs cursor-pointer focus:outline-none"
              title="Speech recognition accent/language"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  🌐 {l.label}
                </option>
              ))}
            </select>
          )}

          {lines.length > 0 && !collapsed && (
            <button
              type="button"
              onClick={copyTranscript}
              title="Copy transcript to clipboard"
              className="rounded-lg p-1.5 text-[#800020] transition hover:bg-[#800020]/10"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-[#800020]" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          )}

          <button
            type="button"
            aria-expanded={!collapsed}
            aria-controls="live-transcript-lines"
            onClick={() => {
              setCollapsed((v) => !v);
              if (collapsed) setScrolledUpState(false);
            }}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold text-[#800020] transition hover:bg-[#800020]/10 cursor-pointer"
          >
            <span>{collapsed ? "Expand" : "Collapse"}</span>
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform duration-200 ${
                collapsed ? "-rotate-90" : ""
              }`}
            />
          </button>
        </div>
      </header>

      {/* Warning banner */}
      {showWarning && (
        <div
          role="alert"
          className="flex items-start gap-2.5 border-b border-[#F0B8C4] bg-[#FFF0F3] px-4 py-2.5 text-xs text-[#9C0E2E]"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#800020]" />
          <div className="leading-snug">
            <p className="font-semibold">
              Live transcription is active on your microphone.
            </p>
            {speechError && (
              <p className="mt-0.5 text-[#9C0E2E]">{speechError}</p>
            )}
          </div>
        </div>
      )}

      {/* Transcript line list */}
      <div
        id="live-transcript-lines"
        hidden={collapsed}
        ref={listRef}
        onScroll={handleScroll}
        className="relative flex-1 space-y-3 overflow-y-auto p-4 text-sm bg-white"
        aria-live="polite"
      >
        {lines.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-[#800020]/50 py-8">
            <p className="text-sm font-semibold">
              Transcript lines appear here as participants speak.
            </p>
            <p className="mt-1 text-xs text-[#800020]/40">
              Unmute your microphone to speak and transcribe.
            </p>
          </div>
        ) : (
          lines.map((line, index) => {
            const initial = line.speakerName.charAt(0).toUpperCase() || "S";

            return (
              <article
                key={`${line.tMs}-${line.speakerName}-${index}`}
                className="group rounded-xl border border-[#F0B8C4] bg-[#FFF5F7] p-2.5 transition-colors hover:border-[#800020]/40"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#800020] text-[10px] font-bold text-white">
                      {initial}
                    </span>
                    <strong className="truncate text-xs font-bold text-[#800020]">
                      {line.speakerName}
                    </strong>
                  </div>

                  <time className="shrink-0 font-mono text-[11px] font-medium text-[#800020]/60">
                    {formatTime(line.tMs)}
                  </time>
                </div>

                <div className="pl-6 space-y-1">
                  <p className="text-[13px] leading-relaxed text-[#2B050D] break-words">
                    {line.text}
                  </p>
                  {line.isTranslated && line.detectedLanguage && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                      <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold bg-[#800020]/10 text-[#800020] border border-[#F0B8C4]">
                        <Globe className="h-2.5 w-2.5" />
                        <span>{line.detectedLanguage} → English</span>
                      </span>
                      {line.originalText && line.originalText.trim() !== line.text.trim() && (
                        <span className="text-[11px] text-[#800020]/60 italic">
                          (original: &ldquo;{line.originalText}&rdquo;)
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })
        )}

        {/* Floating pill */}
        {userScrolledUp && lines.length > 0 && !collapsed && (
          <div className="sticky bottom-1 left-0 right-0 flex justify-center pointer-events-none">
            <button
              type="button"
              onClick={scrollToBottom}
              className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/30 bg-[#800020] px-3.5 py-1 text-xs font-bold text-white shadow-lg transition hover:bg-[#600018] cursor-pointer"
            >
              <ArrowDown className="h-3 w-3" />
              <span>New lines below</span>
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
