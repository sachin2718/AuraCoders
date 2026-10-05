"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RoomEvent } from "livekit-client";
import { useRoomContext } from "@livekit/components-react";

export type TranscriptLine = { speakerName: string; text: string; tMs: number };

type TranscriptPanelProps = {
  supported: boolean | null;
  speechError: string | null;
  localLines: TranscriptLine[];
};

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

export default function TranscriptPanel({ supported, speechError, localLines }: TranscriptPanelProps) {
  const room = useRoomContext();
  const [receivedLines, setReceivedLines] = useState<TranscriptLine[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const lines = useMemo(() => {
    const unique = new Map<string, TranscriptLine>();
    for (const line of [...localLines, ...receivedLines]) {
      unique.set(`${line.tMs}\u0000${line.speakerName}\u0000${line.text}`, line);
    }
    return [...unique.values()].sort((left, right) =>
      left.tMs - right.tMs || left.speakerName.localeCompare(right.speakerName) || left.text.localeCompare(right.text),
    );
  }, [localLines, receivedLines]);

  useEffect(() => {
    const receive = (payload: Uint8Array, _participant?: unknown, _kind?: unknown, topic?: string) => {
      if (topic !== "transcript") return;
      try {
        const line = JSON.parse(new TextDecoder().decode(payload)) as Partial<TranscriptLine>;
        if (typeof line.speakerName !== "string" || typeof line.text !== "string" || typeof line.tMs !== "number") return;
        setReceivedLines((current) => [...current, line as TranscriptLine]);
      } catch {
        // Ignore unrelated or malformed data packets.
      }
    };
    room.on(RoomEvent.DataReceived, receive);
    return () => { room.off(RoomEvent.DataReceived, receive); };
  }, [room]);

  useEffect(() => {
    const list = listRef.current;
    if (!collapsed && list && followLatest.current) list.scrollTop = list.scrollHeight;
  }, [collapsed, lines]);

  return (
    <section className={`flex h-full ${collapsed ? "min-h-0" : "min-h-64"} flex-col rounded-xl border border-slate-700 bg-slate-900`} aria-label="Live transcript">
      <header className="flex items-center justify-between gap-3 border-b border-slate-700 px-4 py-3">
        <h2 className="text-sm font-semibold">Live transcript <span className="font-normal text-slate-400">({lines.length})</span></h2>
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls="live-transcript-lines"
          onClick={() => setCollapsed((value) => !value)}
          className="rounded-md px-2 py-1 text-xs text-indigo-200 hover:bg-slate-800"
        >
          {collapsed ? "Expand" : "Collapse"}
        </button>
      </header>
      {(supported === false || speechError) && (
        <p role="status" className="border-b border-amber-300/20 bg-amber-400/10 px-4 py-2 text-xs text-amber-100">
          Live transcription needs Chrome or Edge.{speechError ? ` ${speechError}` : ""}
        </p>
      )}
      <div
        id="live-transcript-lines"
        hidden={collapsed}
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
