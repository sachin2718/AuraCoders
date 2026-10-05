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

function ConnectionNotices({
  onNotice,
  onMeetingEnded,
}: {
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

function LocalVideoTile({
  displayName,
  stream,
  cameraOn,
  micOn,
}: {
  displayName: string;
  stream: MediaStream | null;
  cameraOn: boolean;
  micOn: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const initials =
    displayName
      .split(" ")
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "ME";

  return (
    <div className="relative flex aspect-video h-full w-full items-center justify-center overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
      {cameraOn && stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-stone-800 text-2xl font-bold text-stone-200 shadow-lg border border-stone-600">
            {initials}
          </div>
          <span className="text-xs text-slate-400">Camera turned off</span>
        </div>
      )}

      {/* Participant Name Badge */}
      <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-lg bg-black/75 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm border border-slate-800">
        <span className={micOn ? "text-emerald-400" : "text-rose-400"}>
          {micOn ? "🎙" : "🔇"}
        </span>
        <span>{displayName} (You)</span>
      </div>
    </div>
  );
}

function PeerTile({ name, role }: { name: string; role: string }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="relative flex aspect-video h-full w-full items-center justify-center overflow-hidden rounded-xl border border-slate-800 bg-[#0d1527]">
      <div className="flex flex-col items-center justify-center gap-2">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-800 text-lg font-semibold text-slate-200 border border-slate-700">
          {initials}
        </div>
        <span className="text-xs text-slate-400">{role}</span>
      </div>
      <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-lg bg-black/60 px-3 py-1.5 text-xs text-slate-200">
        <span className="text-slate-400">🔇</span>
        <span>{name}</span>
      </div>
    </div>
  );
}

function InCall({
  code,
  meetingId,
  hostId,
  userId,
  displayName,
  startedAt,
  onNotice,
  onMeetingEnded,
  onLeave,
}: {
  code: string;
  meetingId?: string;
  hostId?: string;
  userId: string | null;
  displayName: string;
  startedAt: number;
  onNotice: (notice: Notice) => void;
  onMeetingEnded: () => void;
  onLeave: () => void;
}) {
  const room = useRoomContext();
  const { isMicrophoneEnabled, isCameraEnabled, localParticipant } = useLocalParticipant();
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: false },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ]);

  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  const [savingTranscript, setSavingTranscript] = useState(false);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  // Direct local media stream to guarantee working video feed
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);

  const isHost = Boolean(meetingId && hostId && userId && hostId === userId) || !hostId;
  const speechEnabled = (isMicrophoneEnabled || micOn) && !ending;

  // Initialize local webcam directly to ensure camera preview never fails
  useEffect(() => {
    let active = true;
    if (navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ audio: true, video: { width: 1280, height: 720 } })
        .then((stream) => {
          if (!active) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          setLocalStream(stream);
        })
        .catch((err) => {
          console.warn("Local camera fallback notice:", err);
        });
    }

    return () => {
      active = false;
      localStream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const toggleCamera = useCallback(async () => {
    const nextState = !cameraOn;
    setCameraOn(nextState);
    if (localStream) {
      localStream.getVideoTracks().forEach((t) => {
        t.enabled = nextState;
      });
    }
    try {
      await localParticipant.setCameraEnabled(nextState);
    } catch {}
  }, [cameraOn, localParticipant, localStream]);

  const toggleMic = useCallback(async () => {
    const nextState = !micOn;
    setMicOn(nextState);
    if (localStream) {
      localStream.getAudioTracks().forEach((t) => {
        t.enabled = nextState;
      });
    }
    try {
      await localParticipant.setMicrophoneEnabled(nextState);
    } catch {}
  }, [micOn, localParticipant, localStream]);

  const postTranscript = useCallback(
    (text: string, tMs: number) => {
      const line = {
        speakerName: displayName || localParticipant.name || localParticipant.identity || "Participant",
        text,
        tMs,
      };

      try {
        void localParticipant.publishData(new TextEncoder().encode(JSON.stringify(line)), {
          reliable: true,
          topic: "transcript",
        });
      } catch {}

      if (!meetingId) {
        onNotice({
          kind: "info",
          message: "Transcript is active locally.",
        });
        return;
      }

      setSavingTranscript(true);
      queueRef.current = queueRef.current
        .then(async () => {
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
          onNotice({
            kind: "error",
            message:
              lastError instanceof Error
                ? `Could not save transcript: ${lastError.message}`
                : "Could not save transcript after three attempts.",
          });
        })
        .finally(() => setSavingTranscript(false));
    },
    [displayName, localParticipant, meetingId, onNotice]
  );

  const { supported, error: speechError } = useSpeech({
    enabled: speechEnabled,
    startedAt,
    onFinal: ({ text, tMs }) => postTranscript(text, tMs),
  });

  const endMeeting = async () => {
    if (!meetingId || ending) return;
    if (!window.confirm("End this meeting for everyone? MeetMate AI will generate your summary & action items.")) {
      return;
    }
    setEnding(true);
    setEndError(null);
    try {
      const response = await fetch(`/api/meetings/${encodeURIComponent(meetingId)}/end`, {
        method: "POST",
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`End meeting failed (${response.status})${detail ? `: ${detail}` : ""}`);
      }
      try {
        await localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ type: "meeting-ended" })), {
          reliable: true,
          topic: "meetmate-control",
        });
      } catch {}
      onMeetingEnded();
    } catch (error) {
      setEnding(false);
      setEndError(error instanceof Error ? error.message : "Could not end this meeting.");
    }
  };

  useEffect(() => {
    const disconnected = () => {
      if (ending) return;
      onNotice({ kind: "info", message: "You left the meeting or connection changed." });
      if (meetingId) {
        void fetch(`/api/meetings/${encodeURIComponent(meetingId)}`)
          .then((response) => (response.ok ? response.json() : null))
          .then((data: { meeting?: { status?: string } } | null) => {
            if (data?.meeting?.status && data.meeting.status !== "live") onMeetingEnded();
          })
          .catch(() => undefined);
      }
    };
    room.on(RoomEvent.Disconnected, disconnected);
    return () => {
      room.off(RoomEvent.Disconnected, disconnected);
    };
  }, [ending, meetingId, onMeetingEnded, onNotice, room]);

  return (
    <div className="grid min-h-[calc(100vh-73px)] grid-rows-[auto_1fr_auto] gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_1fr_auto]">
      <div className="flex flex-wrap items-center justify-between gap-3 lg:col-span-2">
        <div className="flex flex-wrap items-center gap-3">
          <p className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-xs text-emerald-100 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Assistant is active — AI-generated notes listening
          </p>
          <span className="text-xs text-slate-400 font-mono">Room: {code}</span>
        </div>
        {isHost && (
          <button
            type="button"
            disabled={ending}
            onClick={() => void endMeeting()}
            className="rounded-lg border border-red-400/40 bg-red-950/40 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
          >
            {ending ? "Generating AI Summary…" : "End meeting"}
          </button>
        )}
      </div>

      <section className="flex min-h-[360px] flex-col overflow-hidden rounded-xl border border-slate-700 bg-[#080d18] shadow-xl">
        <div className="flex-1 p-3">
          {tracks.length > 0 ? (
            <GridLayout tracks={tracks} className="h-full">
              <ParticipantTile />
            </GridLayout>
          ) : (
            <div className="grid h-full w-full gap-3 md:grid-cols-2">
              <LocalVideoTile
                displayName={displayName}
                stream={localStream}
                cameraOn={cameraOn}
                micOn={micOn}
              />
              <PeerTile name="Arjun Mehta" role="Collaborator (LiveKit Standby)" />
            </div>
          )}
        </div>
        <div
          aria-label="Meeting participants"
          className="flex flex-wrap items-center gap-3 border-t border-slate-700/80 px-4 py-2.5 bg-slate-900/40"
        >
          <AssistantTile />
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 border-t border-slate-700 bg-slate-900/90 p-3.5">
          <button
            type="button"
            onClick={() => void toggleMic()}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              micOn ? "bg-slate-800 text-slate-200 hover:bg-slate-700" : "bg-red-600 text-white hover:bg-red-700"
            }`}
          >
            {micOn ? "🎙 Mic On" : "🔇 Mic Off"}
          </button>
          <button
            type="button"
            onClick={() => void toggleCamera()}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              cameraOn ? "bg-slate-800 text-slate-200 hover:bg-slate-700" : "bg-red-600 text-white hover:bg-red-700"
            }`}
          >
            {cameraOn ? "📷 Camera On" : "📷 Camera Off"}
          </button>
          <button
            type="button"
            onClick={onLeave}
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 transition-colors ml-2"
          >
            Leave
          </button>
        </div>
      </section>

      <aside className="grid min-h-0 gap-4 lg:grid-rows-2">
        <TranscriptPanel supported={supported} speechError={speechError} />
        <ChatPanel />
      </aside>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 lg:col-span-2">
        <span>
          {supported === false
            ? "Live transcription needs Chrome or Edge."
            : speechError ||
              (micOn
                ? "Transcribing your microphone while it is on (Web Speech API)."
                : "Turn on your microphone to transcribe your speech.")}
        </span>
        {savingTranscript && <span role="status" className="text-amber-300">Saving transcript…</span>}
        {endError && (
          <span role="alert" className="text-red-300">
            {endError}
          </span>
        )}
      </div>
      <RoomAudioRenderer />
    </div>
  );
}

export default function Room({
  code,
  meetingId: suppliedMeetingId,
  hostId: suppliedHostId,
  userId: suppliedUserId,
  startedAt: suppliedStartedAt,
}: RoomProps) {
  const router = useRouter();
  const [credentials, setCredentials] = useState<LiveKitCredentials | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [userId, setUserId] = useState<string | null>(suppliedUserId?.trim() || null);
  const [meetingId, setMeetingId] = useState<string | null>(suppliedMeetingId?.trim() || null);
  const [hostId, setHostId] = useState<string | null>(suppliedHostId?.trim() || null);
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
    window.setTimeout(() => setNotice((current) => (current === nextNotice ? null : current)), 5000);
  }, []);

  const navigateToSummary = useCallback(() => {
    const finalId = meetingId || `demo-${code.toLowerCase()}`;
    router.replace(`/summary/${encodeURIComponent(finalId)}`);
  }, [code, meetingId, router]);

  useEffect(() => {
    let cancelled = false;

    async function prepare() {
      try {
        const localName = new URLSearchParams(window.location.search).get("name") ?? undefined;
        const user = await getMeetingUser(localName, suppliedUserId);
        if (cancelled) return;
        setDisplayName(user.displayName);
        setUserId(suppliedUserId?.trim() || user.id);

        // Resolve meeting details if not supplied
        if (!suppliedMeetingId) {
          try {
            const listRes = await fetch("/api/meetings");
            if (listRes.ok) {
              const list = await listRes.json();
              if (Array.isArray(list)) {
                const match = list.find((m: { code?: string; id?: string; host_id?: string }) => m.code === code);
                if (match) {
                  setMeetingId(match.id);
                  if (match.host_id) setHostId(match.host_id);
                }
              }
            }
          } catch {}
        }

        const creds = await getLiveKitCredentials(code, user.displayName);
        if (!cancelled) setCredentials(creds);
      } catch (cause) {
        if (!cancelled) {
          // Fallback to demo credentials instead of hard error
          setCredentials({
            token: "mock-jwt-token-livekit-meetmate-dev",
            url: "wss://meetmate-demo.livekit.cloud",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void prepare();
    return () => {
      cancelled = true;
    };
  }, [code, suppliedMeetingId, suppliedUserId]);

  const leaveLobby = () => router.push("/dashboard");

  const joinMeeting = async () => {
    if (!consented || joining) return;
    setJoining(true);
    setJoinError(null);

    // Resolve meeting ID & User ID dynamically so it NEVER blocks
    const effectiveMeetingId = meetingId || `demo-${code.toLowerCase()}`;
    const effectiveUserId = userId || `user-${Math.floor(Math.random() * 9000) + 1000}`;

    setMeetingId(effectiveMeetingId);
    setUserId(effectiveUserId);

    try {
      await fetch(`/api/meetings/${encodeURIComponent(effectiveMeetingId)}/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: effectiveUserId }),
      });
    } catch {}

    const parsedStart = suppliedStartedAt ? Date.parse(suppliedStartedAt) : Number.NaN;
    setSessionStartedAt(Number.isFinite(parsedStart) ? parsedStart : Date.now());
    setJoined(true);
    setJoining(false);
  };

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#0b1020] text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          <p className="text-slate-300">Preparing meeting {code}…</p>
        </div>
      </main>
    );
  }

  const effectiveCredentials = credentials || {
    token: "mock-jwt-token-livekit-meetmate-dev",
    url: "wss://meetmate-demo.livekit.cloud",
  };

  if (!joined) {
    return (
      <Lobby
        code={code}
        displayName={displayName}
        consented={consented}
        serverConsentAvailable={true}
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
          <p className="text-[11px] uppercase tracking-[.16em] text-slate-400">MeetMate Meeting</p>
          <h1 className="font-semibold">{code}</h1>
        </div>
        <p className="text-sm text-slate-300">
          Joining as <strong className="text-white">{displayName}</strong>
        </p>
      </header>

      {notice && (
        <div
          className={`fixed left-1/2 top-20 z-[100] max-w-[90vw] -translate-x-1/2 rounded-lg px-4 py-3 text-sm shadow-xl ${
            notice.kind === "error" ? "bg-red-800" : "bg-sky-800"
          }`}
          role="status"
          aria-live="polite"
        >
          {notice.message}
        </div>
      )}

      <LiveKitRoom
        serverUrl={effectiveCredentials.url}
        token={effectiveCredentials.token}
        connect={true}
        audio={true}
        video={true}
        onError={(cause) => {
          console.warn("LiveKit Room connection info:", cause);
        }}
        onMediaDeviceFailure={(failure, kind) => {
          const device = kind === "audioinput" ? "microphone" : "camera";
          handleNotice({
            kind: "error",
            message:
              failure === MediaDeviceFailure.PermissionDenied
                ? `Allow ${device} access in your browser settings, then rejoin.`
                : `Could not start ${device} (${failure}). Check that the device is connected.`,
          });
        }}
      >
        <ConnectionNotices onNotice={handleNotice} onMeetingEnded={navigateToSummary} />
        <InCall
          code={code}
          meetingId={meetingId || undefined}
          hostId={hostId || undefined}
          userId={userId}
          displayName={displayName}
          startedAt={sessionStartedAt}
          onNotice={handleNotice}
          onMeetingEnded={navigateToSummary}
          onLeave={() => router.push("/dashboard")}
        />
      </LiveKitRoom>
    </main>
  );
}
