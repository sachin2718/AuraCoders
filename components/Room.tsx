"use client";

import {
  ControlBar,
  GridLayout,
  LayoutContextProvider,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
  useTracks,
} from "@livekit/components-react";
import { MediaDeviceFailure, RoomEvent, Track } from "livekit-client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Captions,
  Check,
  Copy,
  Crown,
  LogOut,
  Mic,
  MicOff,
  MonitorUp,
  MoreHorizontal,
  PhoneOff,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Video,
  VideoOff,
  X,
} from "lucide-react";
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
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [screenShareEnabled, setScreenShareEnabled] = useState(false);
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [dbParticipants, setDbParticipants] = useState<Array<{ user_id: string; display_name: string }>>([]);

  // Host verification: Only the host (meeting.host_id === current user) is considered host
  const isHost = Boolean(meetingId && hostId && userId && hostId.trim() === userId.trim());

  const room = useRoomContext();
  const { isMicrophoneEnabled, localParticipant } = useLocalParticipant();
  const liveKitParticipants = useParticipants();

  useEffect(() => {
    if (!meetingId) return;
    let active = true;

    const loadParticipants = async () => {
      try {
        const details = await api.getMeeting(meetingId);
        if (active && Array.isArray(details.participants)) {
          setDbParticipants(details.participants);
        }
      } catch {
        // non-critical
      }
    };

    void loadParticipants();
    const interval = setInterval(loadParticipants, 6000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [meetingId]);

  const displayParticipants = useMemo(() => {
    const list: Array<{
      id: string;
      name: string;
      isLocal: boolean;
      isHost: boolean;
      isSpeaking: boolean;
      micEnabled: boolean;
      cameraEnabled: boolean;
      status: "active" | "registered";
    }> = [];
    const seenIds = new Set<string>();

    if (liveKitParticipants.length > 0) {
      for (const p of liveKitParticipants) {
        seenIds.add(p.identity);
        const isParticipantHost = Boolean(hostId && p.identity.trim() === hostId.trim());
        list.push({
          id: p.identity,
          name: p.name || (p.isLocal ? displayName : `User-${p.identity.slice(0, 5)}`),
          isLocal: p.isLocal,
          isHost: isParticipantHost,
          isSpeaking: p.isSpeaking,
          micEnabled: p.isMicrophoneEnabled,
          cameraEnabled: p.isCameraEnabled,
          status: "active",
        });
      }
    }

    const hasLocal = list.some((p) => p.isLocal);
    if (!hasLocal) {
      const localId = userId || "local-user";
      seenIds.add(localId);
      list.push({
        id: localId,
        name: displayName || "You",
        isLocal: true,
        isHost: Boolean(isHost),
        isSpeaking: false,
        micEnabled: localMicOn,
        cameraEnabled: localCamOn,
        status: "active",
      });
    }

    for (const dp of dbParticipants) {
      if (!seenIds.has(dp.user_id) && dp.display_name !== displayName) {
        seenIds.add(dp.user_id);
        list.push({
          id: dp.user_id,
          name: dp.display_name,
          isLocal: dp.user_id === userId,
          isHost: Boolean(hostId && dp.user_id.trim() === hostId.trim()),
          isSpeaking: false,
          micEnabled: false,
          cameraEnabled: false,
          status: "registered",
        });
      }
    }

    return list;
  }, [liveKitParticipants, hostId, displayName, userId, isHost, localMicOn, localCamOn, dbParticipants]);

  const totalParticipantCount = displayParticipants.length;

  const copyMeetingLink = () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (url) {
      navigator.clipboard.writeText(url).catch(() => {});
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };
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
  const speechEnabled = captionsEnabled && consented && (isMockLiveKit ? localMicOn : isMicrophoneEnabled) && !ending;

  const toggleScreenShare = async () => {
    if (isMockLiveKit) {
      onNotice({ kind: "info", message: "Screen sharing becomes available after connecting to a LiveKit room." });
      return;
    }

    const nextValue = !screenShareEnabled;
    try {
      await localParticipant.setScreenShareEnabled(nextValue);
      setScreenShareEnabled(nextValue);
    } catch (error) {
      onNotice({
        kind: "error",
        message: permissionMessage(error) ?? "Could not change screen sharing. Check browser permissions and try again.",
      });
    }
  };

  useEffect(() => {
    if (isMockLiveKit) return;

    const syncScreenShareState = () => {
      const publication = localParticipant.getTrackPublication(Track.Source.ScreenShare);
      setScreenShareEnabled(Boolean(publication?.track && !publication.isMuted));
    };

    room.on(RoomEvent.LocalTrackPublished, syncScreenShareState);
    room.on(RoomEvent.LocalTrackUnpublished, syncScreenShareState);
    room.on(RoomEvent.TrackMuted, syncScreenShareState);
    room.on(RoomEvent.TrackUnmuted, syncScreenShareState);
    syncScreenShareState();

    return () => {
      room.off(RoomEvent.LocalTrackPublished, syncScreenShareState);
      room.off(RoomEvent.LocalTrackUnpublished, syncScreenShareState);
      room.off(RoomEvent.TrackMuted, syncScreenShareState);
      room.off(RoomEvent.TrackUnmuted, syncScreenShareState);
    };
  }, [isMockLiveKit, localParticipant, room]);

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
    <div className="flex min-h-[calc(100dvh-73px)] flex-col bg-[#111827] text-slate-100">
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-700/80 bg-[#1f2937] px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#6264a7] text-white shadow-lg shadow-indigo-950/30">
            <Video className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{code}</p>
            <p className="flex items-center gap-1.5 text-[11px] text-slate-400"><ShieldCheck className="h-3 w-3 text-emerald-400" /> MeetMate meeting</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowParticipantsModal((prev) => !prev)}
            className="flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-800/90 px-3 py-1.5 text-xs font-medium text-slate-200 shadow-sm transition hover:border-indigo-500/50 hover:bg-slate-700"
            title="Click to view all participants"
          >
            <UsersRound className="h-3.5 w-3.5 text-indigo-400" />
            <span>{totalParticipantCount} {totalParticipantCount === 1 ? "participant" : "participants"}</span>
          </button>
          <span className="hidden items-center gap-1.5 rounded-full bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-200 sm:flex"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Assistant active</span>
          <button type="button" aria-label="More meeting options" className="hidden rounded-lg p-2 text-slate-400 transition hover:bg-slate-700 hover:text-white sm:block"><MoreHorizontal className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-700/80 bg-[#0b1220] shadow-2xl shadow-black/10">
          <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
            <button
              type="button"
              onClick={() => setShowParticipantsModal(true)}
              className="flex items-center gap-2 text-xs text-slate-300 hover:text-white transition group cursor-pointer"
              title="Click to view participant list"
            >
              <UsersRound className="h-4 w-4 text-indigo-300 group-hover:text-indigo-200 transition-colors" />
              <span className="font-medium">Participants</span>
              <span className="rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 text-[10px] font-semibold">
                {totalParticipantCount} added
              </span>
            </button>
            <p className="hidden text-xs text-slate-500 md:block">Speak naturally — MeetMate is listening</p>
          </div>
          <div className="min-h-[360px] flex-1 p-3">
            {!isMockLiveKit && tracks.length > 0 ? (
              <GridLayout tracks={tracks} className="h-full min-h-[360px]">
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
          <div aria-label="Meeting participants" className="flex items-center gap-3 border-t border-slate-800 px-4 py-3">
            <AssistantTile />
            <div className="hidden text-xs text-slate-500 sm:block"><p className="text-slate-300">MeetMate Assistant</p><p>AI notes are being prepared in real time</p></div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 border-t border-slate-800 bg-[#111827] px-3 py-3">
            {isMockLiveKit ? (
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button type="button" onClick={() => setLocalMicOn((m) => !m)} className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${localMicOn ? "bg-slate-800 text-slate-200 hover:bg-slate-700" : "bg-red-600/90 text-white hover:bg-red-700"}`}>
                  {localMicOn ? <Mic className="h-4 w-4 text-emerald-400" /> : <MicOff className="h-4 w-4" />}<span className="hidden xs:inline">{localMicOn ? "Mute" : "Unmute"}</span>
                </button>
                <button type="button" onClick={() => setLocalCamOn((c) => !c)} className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${localCamOn ? "bg-slate-800 text-slate-200 hover:bg-slate-700" : "bg-red-600/90 text-white hover:bg-red-700"}`}>
                  {localCamOn ? <Video className="h-4 w-4 text-emerald-400" /> : <VideoOff className="h-4 w-4" />}<span className="hidden xs:inline">{localCamOn ? "Camera" : "Start video"}</span>
                </button>
              </div>
            ) : (
              <ControlBar variation="verbose" controls={{ microphone: true, camera: true, screenShare: true, leave: false, chat: false, settings: false }} onDeviceError={({ source, error }) => onNotice({ kind: "error", message: permissionMessage(error) ?? `Could not start ${source === Track.Source.Microphone ? "microphone" : source === Track.Source.Camera ? "camera" : "device"}: ${error.message}` })} />
            )}
            <button
              type="button"
              aria-label={`View participants (${totalParticipantCount})`}
              onClick={() => setShowParticipantsModal((prev) => !prev)}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm transition ${
                showParticipantsModal
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 font-medium"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              <UsersRound className="h-4 w-4 text-indigo-300" />
              <span className="hidden xs:inline">People</span>
              <span className="rounded-full bg-slate-900/60 px-2 py-0.5 text-xs font-semibold text-indigo-200">
                {totalParticipantCount}
              </span>
            </button>
            <button
              type="button"
              aria-pressed={captionsEnabled}
              onClick={() => setCaptionsEnabled((enabled) => !enabled)}
              className={`hidden items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm transition md:flex ${captionsEnabled ? "bg-indigo-500/20 text-indigo-100" : "bg-slate-800 text-slate-400"}`}
            >
              <Captions className="h-4 w-4 text-indigo-300" />
              {captionsEnabled ? "Captions on" : "Captions off"}
            </button>
            <button
              type="button"
              aria-pressed={screenShareEnabled}
              onClick={() => void toggleScreenShare()}
              className={`hidden items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm transition md:flex ${screenShareEnabled ? "bg-indigo-500/20 text-indigo-100" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
            >
              <MonitorUp className="h-4 w-4 text-indigo-300" />
              {screenShareEnabled ? "Stop sharing" : "Share screen"}
            </button>
            {isHost ? (
              <button type="button" disabled={ending} onClick={() => void endMeeting()} className="flex items-center gap-2 rounded-xl bg-[#c4314b] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#e0445e] disabled:opacity-50"><PhoneOff className="h-4 w-4" /><span>{ending ? "Ending…" : "End"}</span></button>
            ) : (
              <button type="button" onClick={() => void handleLeave()} className="flex items-center gap-2 rounded-xl bg-[#c4314b] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#e0445e]"><LogOut className="h-4 w-4" /><span>Leave</span></button>
            )}
          </div>
        </section>

        <aside className="grid min-h-[520px] min-w-0 gap-3 lg:min-h-0 lg:grid-rows-2">
          <div className="min-h-0 overflow-hidden rounded-2xl border border-slate-700/80 bg-[#172033]">
            <TranscriptPanel supported={supported} speechError={speechError} localLines={localTranscriptLines} />
          </div>
          <div className="min-h-0 overflow-hidden rounded-2xl border border-slate-700/80 bg-[#172033]">
            <ChatPanel roomKey={code} senderName={displayName} mockMode={isMockLiveKit} />
          </div>
        </aside>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 bg-[#0b1220] px-4 py-2 text-[11px] text-slate-400 sm:px-6">
        <span className="flex items-center gap-1.5">{supported === false ? "Live transcription needs Chrome or Edge." : speechError || (isMicrophoneEnabled ? "Transcribing your microphone while it is on." : "Turn on your microphone to transcribe your speech.")}</span>
        <span className="flex items-center gap-3">{savingTranscript && <span role="status">Saving transcript…</span>}{endError && <span role="alert" className="text-red-300">{endError}</span>}<span className="hidden items-center gap-1 sm:flex"><Sparkles className="h-3 w-3 text-indigo-300" /> AI-generated notes</span></span>
      </div>
      <RoomAudioRenderer />
      <MeetMateAssistant meetingId={meetingId} meetingTitle={code} />

      {/* Participants Drawer / Modal */}
      {showParticipantsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm sm:justify-end animate-in fade-in">
          <div
            role="dialog"
            aria-label="Participants list"
            className="flex h-full max-h-[640px] w-full max-w-sm flex-col rounded-2xl border border-slate-700/80 bg-[#161f33] p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-700/60 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                  <UsersRound className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">Participants</h2>
                  <p className="text-xs text-slate-400">{totalParticipantCount} {totalParticipantCount === 1 ? "person added" : "people added to meeting"}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowParticipantsModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="my-3 flex items-center justify-between rounded-xl bg-slate-800/80 border border-slate-700/50 p-2.5">
              <div className="min-w-0 pr-2">
                <p className="text-[11px] font-medium text-slate-300">Invite more participants</p>
                <p className="truncate text-[10px] text-slate-400">Code: <span className="font-mono text-indigo-300">{code}</span></p>
              </div>
              <button
                type="button"
                onClick={copyMeetingLink}
                className="shrink-0 flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-2.5 py-1.5 text-xs font-medium text-white transition shadow-sm"
              >
                {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedLink ? "Copied" : "Copy Link"}</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {displayParticipants.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-xl border border-slate-800 bg-[#1c273e] p-3 transition hover:border-slate-700"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-semibold text-white shadow">
                      {p.name.charAt(0).toUpperCase()}
                      {p.isSpeaking && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-[#161f33] animate-pulse" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-medium text-slate-100">{p.name}</span>
                        {p.isLocal && (
                          <span className="rounded bg-indigo-500/20 px-1 py-0.2 text-[9px] font-medium text-indigo-300">You</span>
                        )}
                        {p.isHost && (
                          <span className="flex items-center gap-0.5 rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-medium text-amber-300">
                            <Crown className="h-2.5 w-2.5" /> Host
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400">
                        {p.status === "active" ? "In meeting" : "Invited / Registered"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 text-slate-400">
                    {p.micEnabled ? (
                      <Mic className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <MicOff className="h-3.5 w-3.5 text-red-400" />
                    )}
                    {p.cameraEnabled ? (
                      <Video className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <VideoOff className="h-3.5 w-3.5 text-slate-500" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
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
  const [lobbyParticipantCount, setLobbyParticipantCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchCount = async () => {
      try {
        const idToFetch = meetingId || (code ? (await api.findMeetingByCode(code))?.id : null);
        if (idToFetch) {
          const details = await api.getMeeting(idToFetch);
          if (!cancelled && details.participants) {
            setLobbyParticipantCount(details.participants.length);
          }
        }
      } catch {
        // non-critical
      }
    };
    void fetchCount();
    return () => { cancelled = true; };
  }, [code, meetingId]);

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
          setError(cause instanceof Error ? cause.message : "Could not prepare the meeting.");
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
          participantCount={lobbyParticipantCount}
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
        options={{ adaptiveStream: true, dynacast: true }}
        onConnected={() => {
          if (!isMockLiveKit) handleNotice({ kind: "info", message: "Connected to LiveKit." });
        }}
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
