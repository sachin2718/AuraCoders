"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { RoomEvent } from "livekit-client";
import { useRoomContext } from "@livekit/components-react";
import { ChevronDown, AlertTriangle, ArrowDown, Copy, Check, FileText } from "lucide-react";

export type TranscriptLine = {
  speakerName: string;
  text: string;
  tMs: number;
};

export interface TranscriptPanelProps {
  supported?: boolean | null;
  speechError?: string | null;
  localLines?: TranscriptLine[];
  className?: string;
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
      className={`flex flex-col rounded-xl border border-slate-700 bg-slate-900 transition-all duration-200 ${
        collapsed ? "h-auto shrink-0" : "h-full min-h-64"
      } ${className}`}
      aria-label="Live transcript"
    >
      {/* Header */}
      <header className="flex items-center justify-between gap-3 border-b border-slate-700/80 px-4 py-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
            Live transcript
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-normal text-slate-400">
              {lines.length}
            </span>
          </h2>
        </div>

        <div className="flex items-center gap-1.5">
          {lines.length > 0 && !collapsed && (
            <button
              type="button"
              onClick={copyTranscript}
              title="Copy transcript to clipboard"
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
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
              // Reset scrolled up flag on expand so user sees latest
              if (collapsed) setScrolledUpState(false);
            }}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
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

      {/* Warning banner: speech recognition unsupported or errored */}
      {showWarning && (
        <div
          role="alert"
          className="flex items-start gap-2.5 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div className="leading-snug">
            <p className="font-medium">
              Live transcription needs Chrome or Edge.
            </p>
            {speechError && (
              <p className="mt-0.5 text-amber-300/80">{speechError}</p>
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
        className="relative flex-1 space-y-3.5 overflow-y-auto p-4 text-sm"
        aria-live="polite"
      >
        {lines.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-slate-500 py-8">
            <p className="text-sm">
              Transcript lines appear here as people speak.
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Unmute your microphone to add your speech.
            </p>
          </div>
        ) : (
          lines.map((line, index) => {
            const speakerColor = getSpeakerColor(line.speakerName);
            const initial = line.speakerName.charAt(0).toUpperCase() || "S";

            return (
              <article
                key={`${line.tMs}-${line.speakerName}-${index}`}
                className="group rounded-lg p-1.5 transition-colors hover:bg-slate-800/40"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <span
                      style={{
                        backgroundColor: speakerColor
                          .replace("hsl", "hsla")
                          .replace(")", ", 0.15)"),
                        color: speakerColor,
                      }}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                    >
                      {initial}
                    </span>
                    <strong
                      style={{ color: speakerColor }}
                      className="truncate text-xs font-semibold"
                    >
                      {line.speakerName}
                    </strong>
                  </div>

                  <time className="shrink-0 font-mono text-[11px] text-slate-400">
                    {formatTime(line.tMs)}
                  </time>
                </div>

                <p className="pl-6.5 text-[13px] leading-relaxed text-slate-200 break-words">
                  {line.text}
                </p>
              </article>
            );
          })
        )}

        {/* Floating pill: jump to latest if user scrolled up */}
        {userScrolledUp && lines.length > 0 && !collapsed && (
          <div className="sticky bottom-1 left-0 right-0 flex justify-center pointer-events-none">
            <button
              type="button"
              onClick={scrollToBottom}
              className="pointer-events-auto flex items-center gap-1 rounded-full border border-indigo-500/30 bg-indigo-600/90 px-3 py-1 text-xs font-medium text-white shadow-lg backdrop-blur transition hover:bg-indigo-500 hover:scale-105"
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
