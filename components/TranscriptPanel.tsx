"use client";

import { useEffect, useRef, useState } from "react";
import { RoomEvent } from "livekit-client";
import { useRoomContext } from "@livekit/components-react";

export type TranscriptLine = { speakerName: string; text: string; tMs: number };

type TranscriptPanelProps = { supported: boolean | null; speechError: string | null };

function colorForSpeaker(name: string) {
  const colors = ["text-cyan-300", "text-amber-300", "text-fuchsia-300", "text-emerald-300", "text-violet-300", "text-orange-300"];
  let hash = 0;
  for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

function formatTime(tMs: number) {
  const totalSeconds = Math.max(0, Math.floor(tMs / 1000));
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

export default function TranscriptPanel({ supported, speechError }: TranscriptPanelProps) {
  const room = useRoomContext();
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);

  useEffect(() => {
    const receive = (payload: Uint8Array, _participant?: unknown, _kind?: unknown, topic?: string) => {
      if (topic !== "transcript") return;
      try {
        const line = JSON.parse(new TextDecoder().decode(payload)) as Partial<TranscriptLine>;
        if (typeof line.speakerName !== "string" || typeof line.text !== "string" || typeof line.tMs !== "number") return;
        setLines((current) => [...current, line as TranscriptLine]);
      } catch {
        // Ignore unrelated or malformed data packets.
      }
    };
    room.on(RoomEvent.DataReceived, receive);
    return () => { room.off(RoomEvent.DataReceived, receive); };
  }, [room]);

  useEffect(() => {
    const list = listRef.current;
    if (list && followLatest.current) list.scrollTop = list.scrollHeight;
  }, [lines]);

  return (
    <section className="flex h-full min-h-64 flex-col rounded-xl border border-slate-700 bg-slate-900" aria-label="Live transcript">
      <h2 className="border-b border-slate-700 px-4 py-3 text-sm font-semibold">Live transcript</h2>
      {supported === false && <p className="border-b border-amber-300/20 bg-amber-400/10 px-4 py-2 text-xs text-amber-100">Live transcription needs Chrome or Edge.</p>}
      {speechError && <p role="status" className="border-b border-amber-300/20 bg-amber-400/10 px-4 py-2 text-xs text-amber-100">{speechError}</p>}
      <div
        ref={listRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          followLatest.current = element.scrollHeight - element.scrollTop - element.clientHeight < 32;
        }}
        className="flex-1 space-y-3 overflow-y-auto p-4"
        aria-live="polite"
      >
        {lines.length === 0 && <p className="text-sm text-slate-500">Transcript lines appear here as people speak.</p>}
        {lines.map((line, index) => (
          <article key={`${line.tMs}-${line.speakerName}-${index}`} className="text-sm">
            <div className="mb-1 flex items-center justify-between gap-2">
              <strong className={colorForSpeaker(line.speakerName)}>{line.speakerName}</strong>
              <time className="shrink-0 font-mono text-[11px] text-slate-500">{formatTime(line.tMs)}</time>
            </div>
            <p className="leading-5 text-slate-200">{line.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
