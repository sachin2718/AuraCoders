"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useChat } from "@livekit/components-react";

type ChatPanelProps = {
  roomKey?: string;
  senderName?: string;
  mockMode?: boolean;
};

type DemoMessage = { id: string; senderName: string; message: string };

export default function ChatPanel({ roomKey = "demo", senderName = "Guest", mockMode = false }: ChatPanelProps) {
  const { chatMessages, send, isSending } = useChat();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [demoMessages, setDemoMessages] = useState<DemoMessage[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mockMode || typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(`meetmate-chat-${roomKey}`);
    channel.onmessage = (event: MessageEvent<DemoMessage>) => {
      if (!event.data?.id || !event.data.message) return;
      setDemoMessages((current) => current.some((item) => item.id === event.data.id) ? current : [...current, event.data]);
    };
    return () => channel.close();
  }, [mockMode, roomKey]);

  const messages = mockMode ? demoMessages : chatMessages;

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || (!mockMode && isSending)) return;
    setError(null);
    try {
      if (mockMode) {
        const next: DemoMessage = { id: crypto.randomUUID(), senderName, message };
        setDemoMessages((current) => [...current, next]);
        if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") {
          const channel = new BroadcastChannel(`meetmate-chat-${roomKey}`);
          channel.postMessage(next);
          channel.close();
        }
      } else {
        await send(message);
      }
      setDraft("");
    } catch {
      setError("Message could not be sent. Check your connection and try again.");
    }
  }

  return (
    <section className="flex h-full min-h-64 flex-col rounded-xl border border-slate-700 bg-slate-900" aria-label="Meeting chat">
      <h2 className="border-b border-slate-700 px-4 py-3 text-sm font-semibold">In-call chat</h2>
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {messages.length === 0 && <p className="text-sm text-slate-500">Messages in this meeting appear here.</p>}
        {mockMode ? demoMessages.map((message) => (
          <article key={message.id} className="text-sm">
            <p className="mb-1 text-xs font-semibold text-indigo-300">{message.senderName}</p>
            <p className="break-words text-slate-100">{message.message}</p>
          </article>
        )) : chatMessages.map((message) => (
          <article key={`${message.timestamp}-${message.from?.identity}-${message.message}`} className="text-sm">
            <p className="mb-1 text-xs font-semibold text-indigo-300">{message.from?.name || message.from?.identity || "Participant"}</p>
            <p className="break-words text-slate-100">{message.message}</p>
          </article>
        ))}
      </div>
      {error && <p className="px-4 pb-2 text-xs text-red-300" role="alert">{error}</p>}
      <form onSubmit={submit} className="flex gap-2 border-t border-slate-700 p-3">
        <label className="sr-only" htmlFor="meeting-chat-input">Write a chat message</label>
        <input
          id="meeting-chat-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={2000}
          placeholder="Write a message…"
          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-400"
        />
        <button disabled={!draft.trim() || isSending} className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-medium disabled:opacity-40">Send</button>
      </form>
    </section>
  );
}
