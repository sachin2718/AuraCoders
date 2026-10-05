"use client";

export default function AssistantTile() {
  return (
    <aside className="flex items-center gap-3 rounded-xl border border-indigo-400/30 bg-indigo-500/10 px-4 py-3" aria-label="MeetMate Assistant is listening">
      <span className="grid size-10 place-items-center rounded-full bg-indigo-400/20 text-xl" aria-hidden="true">🤖</span>
      <span>
        <strong className="block text-sm text-slate-100">MeetMate Assistant</strong>
        <span className="mt-0.5 flex items-center gap-2 text-xs text-indigo-200">
          <span className="size-2 animate-pulse rounded-full bg-emerald-400" /> Listening
        </span>
      </span>
    </aside>
  );
}
