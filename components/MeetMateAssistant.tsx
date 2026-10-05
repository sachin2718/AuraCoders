"use client";

import { FormEvent, useMemo, useState } from "react";
import { Bot, CalendarClock, Check, Loader2, Send, Sparkles, StickyNote, X } from "lucide-react";

type AssistantProps = {
  meetingId?: string;
  meetingTitle?: string;
  className?: string;
};

type AssistantMessage = { role: "user" | "assistant"; content: string };
type AssistantResult = {
  reply: string;
  notes: string[];
  tasks: Array<{ title: string; due_date: string | null; priority: "low" | "medium" | "high"; source_quote: string | null }>;
  deadlines: Array<{ label: string; date: string }>;
};

const starters = [
  { label: "My tasks", prompt: "What are my action items and deadlines?" },
  { label: "Meeting notes", prompt: "Give me a concise set of notes and decisions from this meeting." },
  { label: "Find risks", prompt: "What open questions or risks should I follow up on?" },
];

export default function MeetMateAssistant({ meetingId, meetingTitle, className = "" }: AssistantProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [lastResult, setLastResult] = useState<AssistantResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const history = useMemo(() => messages.slice(-10), [messages]);

  async function ask(rawMessage: string) {
    const message = rawMessage.trim();
    if (!message || busy) return;
    setOpen(true);
    setDraft("");
    setError(null);
    setLastResult(null);
    const nextMessages = [...messages, { role: "user" as const, content: message }];
    setMessages(nextMessages);
    setBusy(true);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, meetingId, conversation: history }),
      });
      const data = (await response.json().catch(() => ({}))) as Partial<AssistantResult> & { error?: string };
      if (!response.ok) throw new Error(data.error || "Assistant could not respond.");
      const result: AssistantResult = {
        reply: typeof data.reply === "string" ? data.reply : "I could not form a response.",
        notes: Array.isArray(data.notes) ? data.notes : [],
        tasks: Array.isArray(data.tasks) ? data.tasks as AssistantResult["tasks"] : [],
        deadlines: Array.isArray(data.deadlines) ? data.deadlines : [],
      };
      setLastResult(result);
      setMessages((current) => [...current, { role: "assistant", content: result.reply }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Assistant could not respond.");
      setMessages((current) => current.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(draft);
  }

  return (
    <div className={`fixed bottom-5 right-5 z-[120] ${className}`}>
      {open && (
        <section className="mb-3 flex h-[min(680px,calc(100vh-110px))] w-[min(390px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-[#4b2a30] bg-[#211516] text-[#fff8f5] shadow-2xl shadow-black/30" aria-label="MeetMate personal assistant">
          <header className="flex items-center justify-between border-b border-[#4b2a30] bg-[#722F37] px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 text-lg">🤖</span>
              <div>
                <p className="text-sm font-semibold">MeetMate Assistant</p>
                <p className="text-[11px] text-[#f6cbd2]">{meetingTitle ? `Helping with ${meetingTitle}` : "Your private meeting copilot"}</p>
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close assistant" className="rounded-lg p-1.5 text-[#f9d9de] hover:bg-white/10"><X size={17} /></button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
            {messages.length === 0 && (
              <div className="rounded-xl border border-[#59363c] bg-[#2a191b] p-4 text-sm leading-6 text-[#f5dfe2]">
                <p className="font-medium text-white">I’m here for the meeting.</p>
                <p className="mt-1 text-xs text-[#cdb0b0]">Ask about your tasks, decisions, notes, or deadlines. I’ll keep the answer tied to meeting evidence.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {starters.map((starter) => <button key={starter.label} type="button" onClick={() => void ask(starter.prompt)} className="rounded-full border border-[#74434c] px-3 py-1.5 text-xs text-[#f7cbd1] hover:bg-[#3a2025]">{starter.label}</button>)}
                </div>
              </div>
            )}
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <p className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-6 ${message.role === "user" ? "rounded-br-md bg-[#8e3b48] text-white" : "rounded-bl-md bg-[#332124] text-[#f7e8e8]"}`}>{message.content}</p>
              </div>
            ))}
            {busy && <div className="flex items-center gap-2 text-xs text-[#d7b8bb]"><Loader2 size={14} className="animate-spin" /> Thinking from your meeting context…</div>}
            {error && <p role="alert" className="rounded-lg border border-red-400/30 bg-red-950/40 px-3 py-2 text-xs text-red-200">{error}</p>}
            {lastResult && (lastResult.notes.length > 0 || lastResult.tasks.length > 0 || lastResult.deadlines.length > 0) && (
              <div className="space-y-2 border-t border-[#4b2a30] pt-3">
                {lastResult.notes.length > 0 && <div className="rounded-xl border border-[#59434a] bg-[#2a1c1e] p-3"><p className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#f1c9ce]"><StickyNote size={14} /> Notes</p><ul className="space-y-1 text-xs leading-5 text-[#ead7d8]">{lastResult.notes.map((note) => <li key={note} className="flex gap-2"><Check size={13} className="mt-1 shrink-0 text-[#e8a2b0]" />{note}</li>)}</ul></div>}
                {lastResult.tasks.length > 0 && <div className="rounded-xl border border-[#59434a] bg-[#2a1c1e] p-3"><p className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#f1c9ce]"><Sparkles size={14} /> Suggested tasks</p><div className="space-y-2">{lastResult.tasks.map((task) => <div key={`${task.title}-${task.due_date}`} className="rounded-lg bg-[#211719] p-2.5 text-xs"><p className="font-medium text-white">{task.title}</p><p className="mt-1 text-[#cdb0b0]">{task.due_date ? `Due ${task.due_date}` : "No date found"} · {task.priority} priority</p>{task.source_quote && <p className="mt-1 border-l-2 border-[#8e3b48] pl-2 italic text-[#bfa5a8]">“{task.source_quote}”</p>}</div>)}</div></div>}
                {lastResult.deadlines.length > 0 && <div className="rounded-xl border border-[#59434a] bg-[#2a1c1e] p-3"><p className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#f1c9ce]"><CalendarClock size={14} /> Deadlines</p><ul className="space-y-1 text-xs text-[#ead7d8]">{lastResult.deadlines.map((deadline) => <li key={`${deadline.label}-${deadline.date}`} className="flex justify-between gap-3"><span>{deadline.label}</span><strong className="text-[#f2c3ca]">{deadline.date}</strong></li>)}</ul></div>}
              </div>
            )}
          </div>

          <form onSubmit={submit} className="flex gap-2 border-t border-[#4b2a30] p-3">
            <label className="sr-only" htmlFor="meetmate-assistant-input">Ask MeetMate Assistant</label>
            <input id="meetmate-assistant-input" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} placeholder="Ask about tasks or deadlines…" className="min-w-0 flex-1 rounded-xl border border-[#5e3b40] bg-[#160e0f] px-3 py-2.5 text-sm text-white outline-none placeholder:text-[#96777b] focus:border-[#d98a97]" />
            <button type="submit" disabled={!draft.trim() || busy} aria-label="Send message" className="grid h-10 w-10 place-items-center rounded-xl bg-[#a64b5a] text-white hover:bg-[#bb5b6b] disabled:opacity-40"><Send size={16} /></button>
          </form>
        </section>
      )}
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={open ? "Close MeetMate Assistant" : "Open MeetMate Assistant"} className="ml-auto flex items-center gap-2 rounded-full border border-[#8e3b48] bg-[#722F37] px-4 py-3 text-sm font-semibold text-white shadow-xl shadow-black/20 transition hover:-translate-y-0.5 hover:bg-[#853b46]">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-white/15 text-base">🤖</span>
        <span className="hidden sm:inline">Ask MeetMate</span>
      </button>
    </div>
  );
}
