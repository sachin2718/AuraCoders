"use client";

import {
  ControlBar,
  GridLayout,
  LayoutContextProvider,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useLocalParticipant,
  useRoomContext,
  useTracks,
} from "@livekit/components-react";
import { MediaDeviceFailure, RoomEvent, Track } from "livekit-client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PhoneOff, LogOut, Mic, MicOff, Video, VideoOff } from "lucide-react";
import "@livekit/components-styles";
import AssistantTile from "./AssistantTile";
import ChatPanel from "./ChatPanel";
import Lobby from "./Lobby";
import TranscriptPanel, { type TranscriptLine } from "./TranscriptPanel";
import MeetMateAssistant from "./MeetMateAssistant";
import { getLiveKitCredentials, getMeetingUser, type LiveKitCredentials } from "../lib/livekit";
import { useSpeech } from "../lib/speech";
import { useVisualShare } from "../lib/visual";
import { api } from "../lib/api";

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

function ConnectionNotices({ onNotice }: { onNotice: (notice: Notice) => void }) {
  const room = useRoomContext();

  useEffect(() => {
    const reconnecting = () => onNotice({ kind: "info", message: "Connection interrupted. Reconnecting…" });
    const reconnected = () => onNotice({ kind: "info", message: "Reconnected to the meeting." });

    room.on(RoomEvent.Reconnecting, reconnecting);
    room.on(RoomEvent.Reconnected, reconnected);
    return () => {
      room.off(RoomEvent.Reconnecting, reconnecting);
      room.off(RoomEvent.Reconnected, reconnected);
    };
  }, [onNotice, room]);

  return null;
}

function LocalCameraStage({
  displayName,
  cameraOn,
  micOn,
  streamRef,
  sharedStream,
}: {
  displayName: string;
  cameraOn: boolean;
  micOn: boolean;
  streamRef: React.MutableRefObject<MediaStream | null>;
  sharedStream?: MediaStream | null;
}) {
  const [stream, setStream] = useState<MediaStream | null>(sharedStream || streamRef.current);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Directly attach stream and play
  const bindStream = useCallback((video: HTMLVideoElement | null, mediaStream: MediaStream | null) => {
    if (!video || !mediaStream) return;
    if (video.srcObject !== mediaStream) {
      video.srcObject = mediaStream;
    }
    video.play().catch(() => {});
  }, []);

  const initCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Webcam not supported in this browser.");
      return;
    }

    setRetrying(true);
    setError(null);

    // Try up to 3 times to allow Windows camera sensor to release from previous preview
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        let mediaStream: MediaStream;
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
            audio: true,
          });
        } catch {
          // Fallback to video-only if audio exclusivity mode blocks it
          mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
        }

        streamRef.current = mediaStream;
        setStream(mediaStream);
        setError(null);
        setRetrying(false);

        if (videoRef.current) {
          bindStream(videoRef.current, mediaStream);
        }
        return;
      } catch (err) {
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 400));
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          setError(
            msg.includes("Permission") || msg.includes("NotAllowed")
              ? "Camera permission denied. Allow camera access in your browser."
              : `Camera unavailable (${msg}). Click retry below.`
          );
        }
      }
    }
    setRetrying(false);
  }, [bindStream, streamRef]);

  useEffect(() => {
    // If sharedStream is available from Lobby, adopt it immediately
    if (sharedStream && sharedStream.getVideoTracks().some((t) => t.readyState === "live")) {
      streamRef.current = sharedStream;
      setStream(sharedStream);
      if (videoRef.current) {
        bindStream(videoRef.current, sharedStream);
      }
      return;
    }

    // If streamRef already has an active stream
    if (streamRef.current && streamRef.current.getVideoTracks().some((t) => t.readyState === "live")) {
      setStream(streamRef.current);
      if (videoRef.current) {
        bindStream(videoRef.current, streamRef.current);
      }
      return;
    }

    void initCamera();
  }, [bindStream, initCamera, sharedStream, streamRef]);

  // Sync camera track enabled state
  useEffect(() => {
    const s = stream || streamRef.current;
    s?.getVideoTracks().forEach((track) => {
      track.enabled = cameraOn;
    });
  }, [cameraOn, stream, streamRef]);

  // Sync audio track enabled state
  useEffect(() => {
    const s = stream || streamRef.current;
    s?.getAudioTracks().forEach((track) => {
      track.enabled = micOn;
    });
  }, [micOn, stream, streamRef]);

  // Callback ref for <video> ensures srcObject is bound immediately on mount/remount
  const handleVideoRef = useCallback(
    (node: HTMLVideoElement | null) => {
      videoRef.current = node;
      const s = stream || streamRef.current;
      if (node && s) {
        bindStream(node, s);
      }
    },
    [bindStream, stream, streamRef]
  );

  return (
    <div className="relative flex h-full min-h-[380px] w-full items-center justify-center overflow-hidden rounded-xl bg-slate-950">
      {/* Video element is kept in the DOM to avoid re-initializing video decoding */}
      <video
        ref={handleVideoRef}
        autoPlay
        playsInline
        muted
        className={`h-full w-full object-cover -scale-x-100 transition-opacity duration-300 ${
          cameraOn && stream ? "opacity-100" : "opacity-0 absolute pointer-events-none"
        }`}
      />

      {/* Fallback View when camera is turned off or loading */}
      {(!cameraOn || !stream) && (
        <div className="flex flex-col items-center justify-center gap-3 p-6 text-center text-slate-300">
          <div className="relative flex h-28 w-28 items-center justify-center rounded-full border-2 border-slate-700 bg-gradient-to-br from-slate-800 to-slate-900 text-3xl font-bold text-slate-100 shadow-xl">
            {displayName.slice(0, 2).toUpperCase()}
            {cameraOn && !stream && (
              <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-xs">
                📷
              </span>
            )}
          </div>
          <span className="text-base font-semibold">{displayName}</span>
          <span className="text-xs text-slate-400">
            {!cameraOn
              ? "Camera is turned off"
              : error
              ? error
              : retrying
              ? "Connecting camera…"
              : "Camera initializing…"}
          </span>

          {error && (
            <button
              type="button"
              onClick={() => void initCamera()}
              disabled={retrying}
              className="mt-2 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {retrying ? "Retrying…" : "Retry Camera"}
            </button>
          )}
        </div>
      )}

      {/* Participant info badge */}
      <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-lg bg-black/70 px-3 py-1.5 backdrop-blur-md border border-white/10">
        <span className="text-xs font-medium text-white">{displayName} (You)</span>
        {!micOn && <span className="text-xs text-red-400 font-semibold">🔇 Muted</span>}
        {cameraOn && stream && (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </span>
        )}
      </div>
    </div>
  );
}

function InCall({
  code,
  displayName,
  consented,
  meetingId,
  hostId,
  userId,
  startedAt,
  isMockLiveKit,
  sharedStream,
  onNotice,
  onMeetingEnded,
  onLeave,
}: {
  code: string;
  displayName: string;
  consented: boolean;
  meetingId?: string;
  hostId?: string;
  userId: string | null;
  startedAt: number;
  isMockLiveKit: boolean;
  sharedStream?: MediaStream | null;
  onNotice: (notice: Notice) => void;
  onMeetingEnded: () => void;
  onLeave: () => void;
}) {
  const localStreamRef = useRef<MediaStream | null>(sharedStream || null);
  const [localCamOn, setLocalCamOn] = useState(true);
  const [localMicOn, setLocalMicOn] = useState(true);

  const room = useRoomContext();
  const { isMicrophoneEnabled, localParticipant } = useLocalParticipant();
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: false },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ]);
  const screenShareTracks = useTracks([
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ]);

  // Track the local participant's active screen share track
  const localScreenShareTrack = useMemo(() => {
    const localRef = screenShareTracks.find(
      (t) => t.participant.isLocal && t.publication?.track && !t.publication.isMuted
    );
    if (localRef?.publication?.track?.mediaStreamTrack) {
      return localRef.publication.track.mediaStreamTrack;
    }
    const pub = localParticipant.getTrackPublication(Track.Source.ScreenShare);
    if (pub?.track?.mediaStreamTrack && !pub.isMuted) {
      return pub.track.mediaStreamTrack;
    }
    return null;
  }, [screenShareTracks, localParticipant]);

  // When any participant shares their screen, the sharer's browser captures
  // a frame every 10s and POSTs to /api/visual (max 1024px, JPEG 0.6, diff check, max 20 frames)
  useVisualShare({
    meetingId,
    startedAt,
    localTrack: localScreenShareTrack,
    maxFrames: 20,
    intervalMs: 10000,
  });
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  const [savingTranscript, setSavingTranscript] = useState(false);
  const [localTranscriptLines, setLocalTranscriptLines] = useState<TranscriptLine[]>([]);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const hasEndedRef = useRef(false);

  // Host verification: Only the host (meeting.host_id === current user) is considered host
  const isHost = Boolean(meetingId && hostId && userId && hostId.trim() === userId.trim());
  const speechEnabled = consented && (isMockLiveKit ? localMicOn : isMicrophoneEnabled) && !ending;

  /**
   * Explicitly releases camera, microphone, screen share, and LiveKit tracks
   * ensuring the browser's hardware recording light turns off immediately.
   */
  const releaseMedia = useCallback(async () => {
    try {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      await localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
      await localParticipant.setCameraEnabled(false).catch(() => undefined);
      await localParticipant.setScreenShareEnabled(false).catch(() => undefined);
      localParticipant.trackPublications.forEach((publication) => {
        try {
          if (publication.track) {
            publication.track.stop();
            if (publication.track.mediaStreamTrack) {
              publication.track.mediaStreamTrack.stop();
            }
          }
        } catch {}
      });
      if (!isMockLiveKit) {
        await room.disconnect(true).catch(() => undefined);
      }
    } catch {}
  }, [isMockLiveKit, localParticipant, room]);

  // Handle meeting ended event for participants and redirect to summary
  const handleEndMeetingForClient = useCallback(async () => {
    if (hasEndedRef.current) return;
    hasEndedRef.current = true;
    setEnding(true);

    // Stop speech recognition and release mic/camera hardware
    await releaseMedia();

    // Redirect to summary page
    onMeetingEnded();
  }, [onMeetingEnded, releaseMedia]);

  // Clean up media on unmount
  useEffect(() => {
    return () => {
      void releaseMedia();
    };
  }, [releaseMedia]);

  const postTranscript = useCallback((text: string, tMs: number) => {
    if (!consented) return;
    const line = { speakerName: displayName, text, tMs };
    setLocalTranscriptLines((current) => [...current, line]);
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
      for (let attempt = 0; attempt < 4; attempt += 1) {
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
          if (attempt < 3) await new Promise((resolve) => window.setTimeout(resolve, 500 * (attempt + 1)));
        }
      }
      onNotice({ kind: "error", message: lastError instanceof Error
        ? `Could not save transcript: ${lastError.message}`
        : "Could not save transcript after three retries." });
    }).finally(() => setSavingTranscript(false));
  }, [consented, displayName, localParticipant, meetingId, onNotice]);

  const { supported, error: speechError } = useSpeech({
    enabled: speechEnabled,
    startedAt,
    onFinal: ({ text, tMs }) => postTranscript(text, tMs),
  });

  // Host-only meeting termination handler
  const endMeeting = async () => {
    if (!meetingId || !isHost || ending || hasEndedRef.current) return;
    if (!window.confirm("End this meeting for everyone? Live notes and action items will be generated.")) return;

    hasEndedRef.current = true;
    setEnding(true);
    setEndError(null);

    try {
      // 1. Call POST /api/meetings/:id/end
      const response = await fetch(`/api/meetings/${encodeURIComponent(meetingId)}/end`, {
        method: "POST",
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`End meeting failed (${response.status})${detail ? `: ${detail}` : ""}`);
      }

      // 2. Broadcast LiveKit data message {type:"meeting-ended"} to all participants
      const payload = new TextEncoder().encode(JSON.stringify({ type: "meeting-ended" }));
      await localParticipant.publishData(payload, {
        reliable: true,
        topic: "meetmate-control",
      }).catch(() => undefined);

      // 3. Stop speech recognition and release camera/mic
      await releaseMedia();

      // 4. Redirect host to summary page
      onMeetingEnded();
    } catch (error) {
      hasEndedRef.current = false;
      setEnding(false);
      setEndError(error instanceof Error ? error.message : "Could not end this meeting.");
    }
  };

  // Participant listener: Redirect when receiving {type:"meeting-ended"} broadcast by host
  useEffect(() => {
    const handleData = (payload: Uint8Array, _participant?: unknown, _kind?: unknown, topic?: string) => {
      if (topic && topic !== "meetmate-control") return;
      try {
        const raw = new TextDecoder().decode(payload);
        const data = JSON.parse(raw) as { type?: string };
        if (data.type === "meeting-ended") {
          void handleEndMeetingForClient();
        }
      } catch {
        // Ignore non-control or malformed data
      }
    };

    room.on(RoomEvent.DataReceived, handleData);
    return () => {
      room.off(RoomEvent.DataReceived, handleData);
    };
  }, [handleEndMeetingForClient, room]);

  // Participant listener: Redirect when room disconnects with meeting status != live
  useEffect(() => {
    if (isMockLiveKit) return; // Never show disconnect banner in mock/demo mode!

    const disconnected = () => {
      if (hasEndedRef.current || ending) return;

      if (meetingId) {
        void fetch(`/api/meetings/${encodeURIComponent(meetingId)}`)
          .then((response) => (response.ok ? response.json() : null))
          .then((data: { meeting?: { status?: string } } | null) => {
            if (data?.meeting?.status && data.meeting.status !== "live") {
              void handleEndMeetingForClient();
            } else {
              onNotice({ kind: "error", message: "You left the meeting or were disconnected." });
            }
          })
          .catch(() => {});
      }
    };

    room.on(RoomEvent.Disconnected, disconnected);
    return () => {
      room.off(RoomEvent.Disconnected, disconnected);
    };
  }, [ending, handleEndMeetingForClient, isMockLiveKit, meetingId, onNotice, room]);

  const handleLeave = async () => {
    await releaseMedia();
    onLeave();
  };

  return (
    <div className="grid min-h-[calc(100vh-73px)] grid-rows-[auto_1fr_auto] gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_1fr_auto]">
      <div className="flex flex-wrap items-center justify-between gap-3 lg:col-span-2">
        <div className="flex flex-wrap items-center gap-3">
          <p className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-xs text-emerald-100 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Assistant is active — AI-generated notes
          </p>
          <span className="text-xs text-slate-400">Room {code}</span>
        </div>

        {/* Host-only "End meeting" button in top toolbar */}
        {isHost && (
          <button
            type="button"
            disabled={ending}
            onClick={() => void endMeeting()}
            className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/25 hover:border-red-500/60 disabled:opacity-50"
          >
            <PhoneOff className="h-4 w-4 text-red-400" />
            <span>{ending ? "Ending meeting…" : "End meeting"}</span>
          </button>
        )}
      </div>

      <section className="flex min-h-[360px] flex-col overflow-hidden rounded-xl border border-slate-700 bg-[#080d18]">
        <div className="flex-1 p-2">
          {!isMockLiveKit && tracks.length > 0 ? (
            <GridLayout tracks={tracks} className="h-full">
              <ParticipantTile />
            </GridLayout>
          ) : (
            <LocalCameraStage
              displayName={displayName}
              cameraOn={localCamOn}
              micOn={localMicOn}
              streamRef={localStreamRef}
              sharedStream={sharedStream}
            />
          )}
        </div>
        <div aria-label="Meeting participants" className="flex flex-wrap items-center gap-3 border-t border-slate-700 px-3 py-2">
          <AssistantTile />
        </div>
        <div className="flex justify-center items-center border-t border-slate-700 bg-slate-900/80 p-3">
          {isMockLiveKit ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setLocalMicOn((m) => !m)}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                  localMicOn ? "bg-slate-800 text-slate-200 hover:bg-slate-700" : "bg-red-600/90 text-white hover:bg-red-700"
                }`}
              >
                {localMicOn ? <Mic className="h-4 w-4 text-emerald-400" /> : <MicOff className="h-4 w-4" />}
                <span>{localMicOn ? "Mute Mic" : "Unmute Mic"}</span>
              </button>
              <button
                type="button"
                onClick={() => setLocalCamOn((c) => !c)}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                  localCamOn ? "bg-slate-800 text-slate-200 hover:bg-slate-700" : "bg-red-600/90 text-white hover:bg-red-700"
                }`}
              >
                {localCamOn ? <Video className="h-4 w-4 text-emerald-400" /> : <VideoOff className="h-4 w-4" />}
                <span>{localCamOn ? "Stop Video" : "Start Video"}</span>
              </button>
            </div>
          ) : (
            <ControlBar
              variation="verbose"
              controls={{ microphone: true, camera: true, screenShare: true, leave: false, chat: false, settings: true }}
              onDeviceError={({ source, error }) => onNotice({
                kind: "error",
                message: permissionMessage(error) ?? `Could not start ${source === Track.Source.Microphone ? "microphone" : source === Track.Source.Camera ? "camera" : "device"}: ${error.message}`,
              })}
            />
          )}
          {/* Host has End meeting in control bar; non-host has Leave */}
          {isHost ? (
            <button
              type="button"
              disabled={ending}
              onClick={() => void endMeeting()}
              className="ml-2 flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
            >
              <PhoneOff className="h-4 w-4" />
              <span>{ending ? "Ending…" : "End meeting"}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleLeave()}
              className="ml-2 flex items-center gap-1.5 rounded-lg border border-slate-600 px-3.5 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
            >
              <LogOut className="h-4 w-4" />
              <span>Leave</span>
            </button>
          )}
        </div>
      </section>

      <aside className="grid min-h-0 gap-4 lg:grid-rows-2">
        <TranscriptPanel supported={supported} speechError={speechError} localLines={localTranscriptLines} />
        <ChatPanel roomKey={code} senderName={displayName} mockMode={isMockLiveKit} />
      </aside>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 lg:col-span-2">
        <span>{supported === false ? "Live transcription needs Chrome or Edge." : speechError || (isMicrophoneEnabled ? "Transcribing your microphone while it is on." : "Turn on your microphone to transcribe your speech.")}</span>
        {savingTranscript && <span role="status">Saving transcript…</span>}
        {endError && <span role="alert" className="text-red-300">{endError}</span>}
      </div>
      <RoomAudioRenderer />
      <MeetMateAssistant meetingId={meetingId} meetingTitle={code} />
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
  const [meetingId, setMeetingId] = useState<string | undefined>(suppliedMeetingId);
  const [hostId, setHostId] = useState<string | undefined>(suppliedHostId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [consented, setConsented] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<number>(Date.now());
  const [lobbyStream, setLobbyStream] = useState<MediaStream | null>(null);

  const handleNotice = useCallback((nextNotice: Notice) => {
    setNotice(nextNotice);
    window.setTimeout(() => setNotice((current) => current === nextNotice ? null : current), 5000);
  }, []);

  const navigateToSummary = useCallback(() => {
    if (meetingId) {
      router.replace(`/summary/${encodeURIComponent(meetingId)}`);
    } else {
      router.replace("/dashboard");
    }
  }, [meetingId, router]);

  useEffect(() => {
    let cancelled = false;
    async function prepare() {
      try {
        const search = typeof window !== "undefined" ? window.location.search : "";
        const localName = new URLSearchParams(search).get("name") ?? undefined;
        const queryUserId = new URLSearchParams(search).get("userId") ?? undefined;
        const effectiveUserId = suppliedUserId?.trim() || queryUserId?.trim() || undefined;
        const user = await getMeetingUser(localName, effectiveUserId);

        let meeting: { id: string; host_id?: string | null } | null = null;
        if (suppliedMeetingId) {
          meeting = { id: suppliedMeetingId, host_id: suppliedHostId || null };
        } else {
          try {
            meeting = await api.findMeetingByCode(code);
          } catch {
            meeting = { id: `demo-${code.toLowerCase()}`, host_id: "user-priya-01" };
          }
        }
        if (cancelled) return;

        setMeetingId(meeting.id);
        setHostId(meeting.host_id ?? undefined);
        setDisplayName(user.displayName);
        const resolvedUserId =
          effectiveUserId ||
          user.id ||
          (process.env.NEXT_PUBLIC_MOCK === "true" ? meeting.host_id ?? null : null);
        setUserId(resolvedUserId);

        const result = await getLiveKitCredentials(code, user.displayName);
        if (!cancelled) setCredentials(result);
      } catch (cause) {
        if (!cancelled) {
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
    return () => { cancelled = true; };
  }, [code, suppliedMeetingId, suppliedHostId, suppliedUserId]);

  const leaveLobby = () => router.push("/dashboard");

  const joinMeeting = async () => {
    if (!consented || joining) return;
    setJoining(true);
    setJoinError(null);

    const effectiveMeetingId = meetingId || `demo-${code.toLowerCase()}`;
    const effectiveUserId = userId || `user-${Math.floor(Math.random() * 9000) + 1000}`;
    setMeetingId(effectiveMeetingId);
    setUserId(effectiveUserId);

    try {
      const response = await fetch(`/api/meetings/${encodeURIComponent(effectiveMeetingId)}/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: effectiveUserId }),
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
      <>
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
          onStreamReady={setLobbyStream}
        />
        <MeetMateAssistant meetingId={meetingId} meetingTitle={code} />
      </>
    );
  }

  const isMockLiveKit = Boolean(
    !credentials?.url ||
    !credentials?.token ||
    credentials.token.startsWith("mock-") ||
    credentials.url.includes("meetmate-demo") ||
    credentials.url.includes("your-project")
  );

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
        serverUrl={isMockLiveKit ? undefined : credentials.url}
        token={isMockLiveKit ? undefined : credentials.token}
        connect={!isMockLiveKit}
        audio={!isMockLiveKit}
        video={!isMockLiveKit}
        onError={(cause) => {
          if (isMockLiveKit) return;
          handleNotice({ kind: "error", message: permissionMessage(cause) ?? (cause instanceof Error ? cause.message : "Meeting connection failed.") });
        }}
        onMediaDeviceFailure={(failure, kind) => {
          if (isMockLiveKit) return;
          const device = kind === "audioinput" ? "microphone" : "camera";
          handleNotice({ kind: "error", message: failure === MediaDeviceFailure.PermissionDenied
            ? `Allow ${device} access in your browser settings, then rejoin.`
            : `Could not start ${device} (${failure}). Check that the device is connected and not in use.` });
        }}
      >
        <LayoutContextProvider>
          <ConnectionNotices onNotice={handleNotice} />
          <InCall
            code={code}
            displayName={displayName}
            consented={consented}
            meetingId={meetingId}
            hostId={hostId}
            userId={userId}
            startedAt={sessionStartedAt}
            isMockLiveKit={isMockLiveKit}
            sharedStream={lobbyStream}
            onNotice={handleNotice}
            onMeetingEnded={navigateToSummary}
            onLeave={() => router.push("/dashboard")}
          />
        </LayoutContextProvider>
      </LiveKitRoom>
    </main>
  );
}
