"use client";

import {
  ControlBar,
  GridLayout,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useLocalParticipant,
  useRoomContext,
  useTracks,
} from "@livekit/components-react";
import { MediaDeviceFailure, RoomEvent, Track } from "livekit-client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import "@livekit/components-styles";
import AssistantTile from "./AssistantTile";
import ChatPanel from "./ChatPanel";
import Lobby from "./Lobby";
import TranscriptPanel from "./TranscriptPanel";
import { getLiveKitCredentials, getMeetingUser, type LiveKitCredentials } from "../lib/livekit";
import { useSpeech } from "../lib/speech";

type RoomProps = {
  code: string;
  meetingId?: string;
  hostId?: string;
  userId?: string;
  startedAt?: string;
};
type Notice = { kind: "error" | "info"; message: string };

function permissionMessage(error: unknown): string | null {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/NotAllowedError|PermissionDeniedError|PermissionDenied/i.test(`${name} ${message}`)) {
    return "Camera or microphone access was denied. Allow access in your browser settings, then rejoin.";
  }
  return null;
}

function ConnectionNotices({ onNotice, onMeetingEnded }: {
  onNotice: (notice: Notice) => void;
  onMeetingEnded: () => void;
}) {
  const room = useRoomContext();

  useEffect(() => {
    const reconnecting = () => onNotice({ kind: "info", message: "Connection interrupted. Reconnecting…" });
    const reconnected = () => onNotice({ kind: "info", message: "Reconnected to the meeting." });
    const receiveData = (payload: Uint8Array, _participant?: unknown, _kind?: unknown, topic?: string) => {
      if (topic !== "meetmate-control") return;
      try {
        const data = JSON.parse(new TextDecoder().decode(payload)) as { type?: string };
        if (data.type === "meeting-ended") onMeetingEnded();
      } catch {
        // Ignore non-control data on this topic.
      }
    };

    room.on(RoomEvent.Reconnecting, reconnecting);
    room.on(RoomEvent.Reconnected, reconnected);
    room.on(RoomEvent.DataReceived, receiveData);
    return () => {
      room.off(RoomEvent.Reconnecting, reconnecting);
      room.off(RoomEvent.Reconnected, reconnected);
      room.off(RoomEvent.DataReceived, receiveData);
    };
  }, [onMeetingEnded, onNotice, room]);

  return null;
}

function InCall({
  code,
  meetingId,
  hostId,
  userId,
  startedAt,
  onNotice,
  onMeetingEnded,
  onLeave,
}: {
  code: string;
  meetingId?: string;
  hostId?: string;
  userId: string | null;
  startedAt: number;
  onNotice: (notice: Notice) => void;
  onMeetingEnded: () => void;
  onLeave: () => void;
}) {
  const room = useRoomContext();
  const { isMicrophoneEnabled, localParticipant } = useLocalParticipant();
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: true },
  ]);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  const [savingTranscript, setSavingTranscript] = useState(false);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const isHost = Boolean(meetingId && hostId && userId && hostId === userId);
  const speechEnabled = isMicrophoneEnabled && !ending;

  const postTranscript = useCallback((text: string, tMs: number) => {
    const line = { speakerName: localParticipant.name || localParticipant.identity || "Participant", text, tMs };
    void localParticipant.publishData(new TextEncoder().encode(JSON.stringify(line)), {
      reliable: true,
      topic: "transcript",
    }).catch(() => onNotice({ kind: "error", message: "Transcript could not be shared with the room." }));

    if (!meetingId) {
      onNotice({ kind: "info", message: "Transcript is visible to participants but cannot be saved until meeting metadata is supplied." });
      return;
    }

    setSavingTranscript(true);
    queueRef.current = queueRef.current.then(async () => {
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const response = await fetch("/api/transcript", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ meetingId, speakerName: line.speakerName, text, tMs }),
          });
          if (!response.ok) throw new Error(`Transcript API returned ${response.status}.`);
          return;
        } catch (error) {
          lastError = error;
          if (attempt < 2) await new Promise((resolve) => window.setTimeout(resolve, 500 * (attempt + 1)));
        }
      }
      onNotice({ kind: "error", message: lastError instanceof Error
        ? `Could not save transcript: ${lastError.message}`
        : "Could not save transcript after three attempts." });
    }).finally(() => setSavingTranscript(false));
  }, [localParticipant, meetingId, onNotice]);

  const { supported, error: speechError } = useSpeech({
    enabled: speechEnabled,
    startedAt,
    onFinal: ({ text, tMs }) => postTranscript(text, tMs),
  });

  const endMeeting = async () => {
    if (!meetingId || !isHost || ending) return;
    if (!window.confirm("End this meeting for everyone?")) return;
    setEnding(true);
    setEndError(null);
    try {
      const response = await fetch(`/api/meetings/${encodeURIComponent(meetingId)}/end`, { method: "POST" });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`End meeting failed (${response.status})${detail ? `: ${detail}` : ""}`);
      }
      await localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ type: "meeting-ended" })), {
        reliable: true,
        topic: "meetmate-control",
      });
      onMeetingEnded();
    } catch (error) {
      setEnding(false);
      setEndError(error instanceof Error ? error.message : "Could not end this meeting.");
    }
  };

  useEffect(() => {
    const disconnected = () => {
      if (ending) return;
      onNotice({ kind: "error", message: "You left the meeting or were disconnected." });
      if (meetingId) {
        void fetch(`/api/meetings/${encodeURIComponent(meetingId)}`)
          .then((response) => response.ok ? response.json() : null)
          .then((data: { meeting?: { status?: string } } | null) => {
            if (data?.meeting?.status && data.meeting.status !== "live") onMeetingEnded();
          })
          .catch(() => undefined);
      }
    };
    room.on(RoomEvent.Disconnected, disconnected);
    return () => { room.off(RoomEvent.Disconnected, disconnected); };
  }, [ending, meetingId, onMeetingEnded, onNotice, room]);

  return (
    <div className="grid min-h-[calc(100vh-73px)] grid-rows-[auto_1fr_auto] gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_1fr_auto]">
      <div className="flex flex-wrap items-center justify-between gap-3 lg:col-span-2">
        <div className="flex flex-wrap items-center gap-3">
          <p className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-xs text-emerald-100">
            Assistant is active — AI-generated notes
          </p>
          <span className="text-xs text-slate-400">Room {code}</span>
        </div>
        {isHost && (
          <button type="button" disabled={ending} onClick={() => void endMeeting()} className="rounded-lg border border-red-400/40 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/15 disabled:opacity-50">
            {ending ? "Ending…" : "End meeting"}
          </button>
        )}
      </div>

      <section className="flex min-h-[360px] flex-col overflow-hidden rounded-xl border border-slate-700 bg-[#080d18]">
        <div className="flex-1 p-2">
          <GridLayout tracks={tracks} className="h-full">
            <ParticipantTile />
          </GridLayout>
        </div>
        <div aria-label="Meeting participants" className="flex flex-wrap items-center gap-3 border-t border-slate-700 px-3 py-2">
          <AssistantTile />
        </div>
        <div className="flex justify-center border-t border-slate-700 bg-slate-900/80 p-3">
          <ControlBar
            variation="verbose"
            controls={{ microphone: true, camera: true, screenShare: true, leave: false, chat: false, settings: true }}
            onDeviceError={({ source, error }) => onNotice({
              kind: "error",
              message: permissionMessage(error) ?? `Could not start ${source === Track.Source.Microphone ? "microphone" : source === Track.Source.Camera ? "camera" : "device"}: ${error.message}`,
            })}
          />
          <button type="button" onClick={onLeave} className="ml-2 rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">Leave</button>
        </div>
      </section>

      <aside className="grid min-h-0 gap-4 lg:grid-rows-2">
        <TranscriptPanel supported={supported} speechError={speechError} />
        <ChatPanel />
      </aside>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 lg:col-span-2">
        <span>{supported === false ? "Live transcription needs Chrome or Edge." : speechError || (isMicrophoneEnabled ? "Transcribing your microphone while it is on." : "Turn on your microphone to transcribe your speech.")}</span>
        {savingTranscript && <span role="status">Saving transcript…</span>}
        {endError && <span role="alert" className="text-red-300">{endError}</span>}
      </div>
      <RoomAudioRenderer />
    </div>
  );
}

export default function Room({ code, meetingId, hostId, userId: suppliedUserId, startedAt: suppliedStartedAt }: RoomProps) {
  const router = useRouter();
  const [credentials, setCredentials] = useState<LiveKitCredentials | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [userId, setUserId] = useState<string | null>(suppliedUserId?.trim() || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [consented, setConsented] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<number>(Date.now());

  const handleNotice = useCallback((nextNotice: Notice) => {
    setNotice(nextNotice);
    window.setTimeout(() => setNotice((current) => current === nextNotice ? null : current), 5000);
  }, []);
  const navigateToSummary = useCallback(() => {
    if (meetingId) router.replace(`/summary/${encodeURIComponent(meetingId)}`);
  }, [meetingId, router]);

  useEffect(() => {
    let cancelled = false;
    async function prepare() {
      try {
        const localName = new URLSearchParams(window.location.search).get("name") ?? undefined;
        const user = await getMeetingUser(localName, suppliedUserId);
        if (cancelled) return;
        setDisplayName(user.displayName);
        setUserId(suppliedUserId?.trim() || user.id);
        const result = await getLiveKitCredentials(code, user.displayName);
        if (!cancelled) setCredentials(result);
      } catch (cause) {
        if (!cancelled) setError(permissionMessage(cause) ?? (cause instanceof Error ? cause.message : "Unable to prepare the meeting."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void prepare();
    return () => { cancelled = true; };
  }, [code, suppliedUserId]);

  const leaveLobby = () => router.push("/dashboard");

  const joinMeeting = async () => {
    if (!consented || joining) return;
    setJoining(true);
    setJoinError(null);
    if (!meetingId || !userId) {
      setJoining(false);
      setJoinError("Meeting metadata is missing. Ask P1 to include meetingId and userId in the meeting URL.");
      return;
    }

    try {
      const response = await fetch(`/api/meetings/${encodeURIComponent(meetingId)}/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!response.ok) throw new Error(`Consent could not be recorded (${response.status}).`);
    } catch (cause) {
      if (process.env.NODE_ENV === "production") {
        setJoining(false);
        setJoinError(cause instanceof Error ? cause.message : "Consent could not be recorded. Try again.");
        return;
      }
      handleNotice({ kind: "info", message: "Local demo: consent API is unavailable; continuing without server logging." });
    }

    const parsedStart = suppliedStartedAt ? Date.parse(suppliedStartedAt) : Number.NaN;
    setSessionStartedAt(Number.isFinite(parsedStart) ? parsedStart : Date.now());
    setJoined(true);
    setJoining(false);
  };

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#0b1020] text-white">Preparing meeting {code}…</main>;
  if (error || !credentials) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#0b1020] p-6 text-white">
        <section role="alert" className="max-w-lg rounded-2xl border border-red-400/30 bg-slate-900 p-6">
          <h1 className="text-xl font-semibold">Could not join the meeting</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">{error ?? "Meeting credentials are unavailable."}</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-5 rounded-lg bg-indigo-500 px-4 py-2 font-medium">Try again</button>
        </section>
      </main>
    );
  }

  if (!joined) {
    return (
      <Lobby
        code={code}
        displayName={displayName}
        consented={consented}
        serverConsentAvailable={Boolean(meetingId && userId)}
        joining={joining}
        joinError={joinError}
        onConsentChange={setConsented}
        onJoin={() => void joinMeeting()}
        onLeave={leaveLobby}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[#0b1020] text-white">
      <header className="flex min-h-[73px] flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3 sm:px-6">
        <div>
          <p className="text-[11px] uppercase tracking-[.16em] text-slate-400">MeetMate meeting</p>
          <h1 className="font-semibold">{code}</h1>
        </div>
        <p className="text-sm text-slate-300">Joining as <strong className="text-white">{displayName}</strong></p>
      </header>
      {notice && <div className={`fixed left-1/2 top-20 z-[100] max-w-[90vw] -translate-x-1/2 rounded-lg px-4 py-3 text-sm shadow-xl ${notice.kind === "error" ? "bg-red-800" : "bg-sky-800"}`} role="status" aria-live="polite">{notice.message}</div>}
      <LiveKitRoom
        serverUrl={credentials.url}
        token={credentials.token}
        connect
        audio
        video
        onError={(cause) => handleNotice({ kind: "error", message: permissionMessage(cause) ?? (cause instanceof Error ? cause.message : "Meeting connection failed.") })}
        onMediaDeviceFailure={(failure, kind) => {
          const device = kind === "audioinput" ? "microphone" : "camera";
          handleNotice({ kind: "error", message: failure === MediaDeviceFailure.PermissionDenied
            ? `Allow ${device} access in your browser settings, then rejoin.`
            : `Could not start ${device} (${failure}). Check that the device is connected and not in use.` });
        }}
      >
        <ConnectionNotices onNotice={handleNotice} onMeetingEnded={navigateToSummary} />
        <InCall
          code={code}
          meetingId={meetingId}
          hostId={hostId}
          userId={userId}
          startedAt={sessionStartedAt}
          onNotice={handleNotice}
          onMeetingEnded={navigateToSummary}
          onLeave={() => router.push("/dashboard")}
        />
      </LiveKitRoom>
    </main>
  );
}
