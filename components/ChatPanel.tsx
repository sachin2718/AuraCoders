"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useChat } from "@livekit/components-react";
import { Send, MessageSquare } from "lucide-react";

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
    <section className="flex h-full min-h-64 flex-col rounded-2xl border-2 border-[#800020]/25 bg-white shadow-md" aria-label="Meeting chat">
      <header className="flex items-center gap-2 border-b-2 border-[#800020]/15 bg-[#FFF0F3] px-4 py-3">
        <MessageSquare className="h-4 w-4 text-[#800020]" />
        <h2 className="text-sm font-bold text-[#800020]">Meeting Chat</h2>
      </header>
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {messages.length === 0 && (
          <p className="text-center text-xs font-medium text-[#800020]/60 py-6">
            No messages yet. Send a message to everyone in the room.
          </p>
        )}
        {mockMode ? demoMessages.map((message) => (
          <article key={message.id} className="rounded-xl border border-[#F0B8C4] bg-[#FFF5F7] p-2.5 text-sm">
            <p className="mb-0.5 text-xs font-bold text-[#800020]">{message.senderName}</p>
            <p className="break-words text-[#2B050D] text-xs leading-5">{message.message}</p>
          </article>
        )) : chatMessages.map((message) => (
          <article key={`${message.timestamp}-${message.from?.identity}-${message.message}`} className="rounded-xl border border-[#F0B8C4] bg-[#FFF5F7] p-2.5 text-sm">
            <p className="mb-0.5 text-xs font-bold text-[#800020]">{message.from?.name || message.from?.identity || "Participant"}</p>
            <p className="break-words text-[#2B050D] text-xs leading-5">{message.message}</p>
          </article>
        ))}
      </div>
      {error && <p className="px-4 pb-2 text-xs font-semibold text-[#9C0E2E]" role="alert">{error}</p>}
      <form onSubmit={submit} className="flex gap-2 border-t-2 border-[#800020]/15 bg-[#FFF0F3] p-3">
        <label className="sr-only" htmlFor="meeting-chat-input">Write a chat message</label>
        <input
          id="meeting-chat-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={2000}
          placeholder="Write a message…"
          className="min-w-0 flex-1 rounded-xl border border-[#F0B8C4] bg-white px-3 py-2 text-xs font-medium text-[#2B050D] outline-none placeholder:text-[#800020]/40 focus:border-[#800020]"
        />
        <button
          disabled={!draft.trim() || isSending}
          className="flex items-center justify-center rounded-xl bg-[#800020] px-3.5 py-2 text-xs font-bold text-white transition hover:bg-[#600018] disabled:opacity-40 cursor-pointer"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </section>
  );
}
