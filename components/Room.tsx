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
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
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
import Navbar from "./Navbar";
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
    <div className="relative flex h-full min-h-[200px] w-full items-center justify-center overflow-hidden rounded-xl bg-[#1A0307]">
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
        <div className="flex flex-col items-center justify-center gap-3 p-6 text-center text-[#FFF0F3]">
          <div className="relative flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-full border-2 border-[#F0B8C4] bg-gradient-to-br from-[#800020] to-[#520919] text-2xl sm:text-3xl font-extrabold text-white shadow-xl shadow-[#800020]/30">
            {displayName.slice(0, 2).toUpperCase()}
            {cameraOn && !stream && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#800020] text-xs">
                📷
              </span>
            )}
          </div>
          <span className="text-sm font-bold text-white">{displayName}</span>
          <span className="text-xs text-[#F0B8C4]">
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
      <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-lg bg-black/70 px-3 py-1.5 backdrop-blur-md border border-white/10 z-10">
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

function getAvatarGradient(name: string): string {
  const gradients = [
    "from-[#800020] to-[#520919]",
    "from-[#9C0E2E] to-[#6B0C21]",
    "from-[#BA193D] to-[#800020]",
    "from-[#6B0C21] to-[#3D0713]",
    "from-[#8B0021] to-[#4A0512]",
    "from-[#A81535] to-[#5E091B]",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

function RemoteParticipantStage({
  participant,
}: {
  participant: {
    id: string;
    name: string;
    isLocal: boolean;
    isHost: boolean;
    isSpeaking: boolean;
    micEnabled: boolean;
    cameraEnabled: boolean;
    status: "active" | "registered";
  };
}) {
  const initial = (participant.name.trim().charAt(0) || "U").toUpperCase();
  const gradient = getAvatarGradient(participant.name);

  return (
    <div className="relative flex h-full min-h-[200px] w-full flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-[#800020]/40 bg-[#2B050D] p-4 shadow-xl transition-all hover:border-[#800020]">
      {/* Background illumination effect */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-70" />

      {/* Center Avatar with Speaking Halo */}
      <div className="relative flex flex-col items-center justify-center z-10">
        <div
          className={`relative flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-full bg-gradient-to-br ${gradient} text-2xl sm:text-3xl font-extrabold text-white shadow-xl transition-all duration-300 ${
            participant.isSpeaking
              ? "ring-4 ring-white ring-offset-2 ring-offset-[#2B050D] scale-105"
              : "ring-2 ring-white/20"
          }`}
        >
          {initial}
          {participant.isSpeaking && (
            <span className="absolute -bottom-1 flex items-center gap-0.5 rounded-full bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#800020] shadow-md">
              <span className="h-1.5 w-1.5 rounded-full bg-[#800020] animate-ping" />
              Speaking
            </span>
          )}
        </div>
        <span className="mt-3 truncate max-w-[180px] text-sm font-bold text-white">
          {participant.name}
        </span>
        <span className="text-[11px] text-[#D64765] font-medium">
          {participant.status === "active" ? "In meeting" : "Invited participant"}
        </span>
      </div>

      {/* Top right status pills */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
        {participant.isHost && (
          <span className="flex items-center gap-1 rounded-full bg-white border border-white/40 px-2.5 py-0.5 text-[10px] font-bold text-[#800020] shadow-sm">
            <Crown className="h-3 w-3" /> Host
          </span>
        )}
        <div className="flex items-center gap-1 rounded-lg bg-black/60 px-2 py-1 backdrop-blur-md border border-white/20">
          {participant.micEnabled ? (
            <Mic className="h-3.5 w-3.5 text-white" />
          ) : (
            <MicOff className="h-3.5 w-3.5 text-[#D64765]" />
          )}
          {participant.cameraEnabled ? (
            <Video className="h-3.5 w-3.5 text-white" />
          ) : (
            <VideoOff className="h-3.5 w-3.5 text-white/40" />
          )}
        </div>
      </div>

      {/* Bottom left name tag */}
      <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-lg bg-black/70 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-md border border-white/20 z-10">
        <span className="truncate max-w-[130px]">{participant.name}</span>
        {!participant.micEnabled && <span className="text-[#D64765] text-[10px]">🔇 Muted</span>}
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
  // Host verification: Only the host (meeting.host_id === current user) is considered host
  const isHost = Boolean(meetingId && hostId && userId && hostId.trim() === userId.trim());

  const room = useRoomContext();
  const { isMicrophoneEnabled, localParticipant } = useLocalParticipant();
  const liveKitParticipants = useParticipants();

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

    return list;
  }, [liveKitParticipants, hostId, displayName, userId, isHost, localMicOn, localCamOn]);

  const totalParticipantCount = displayParticipants.length;

  const copyMeetingLink = () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (url) {
      navigator.clipboard.writeText(url).catch(() => {});
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );
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
    <div className="flex flex-1 flex-col bg-white text-[#2B050D]">
      <div className="grid min-h-0 flex-1 gap-3 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border-2 border-[#F0B8C4] bg-white shadow-md">
          {/* Top of video stage: Participants and Invite button */}
          <div className="flex items-center justify-between gap-3 border-b-2 border-[#F0B8C4] bg-[#FFF5F7] px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setShowParticipantsModal(true)}
                className="flex items-center gap-2 text-xs font-bold text-[#800020] hover:text-[#520919] transition cursor-pointer"
                title="Click to view participant list"
              >
                <UsersRound className="h-4 w-4 text-[#800020]" />
                <span>Participants</span>
                <span className="rounded-full bg-[#800020] text-white px-2 py-0.5 text-[10px] font-bold">
                  {totalParticipantCount}
                </span>
              </button>
              <button
                type="button"
                onClick={copyMeetingLink}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#F0B8C4] bg-white px-2.5 py-1 text-[11px] font-bold text-[#800020] hover:bg-[#FFF0F3] transition shadow-sm cursor-pointer"
                title="Copy meeting link to invite real users"
              >
                {copiedLink ? <Check className="h-3 w-3 text-[#800020]" /> : <Copy className="h-3 w-3 text-[#800020]" />}
                <span>{copiedLink ? "Link copied" : "Invite"}</span>
              </button>
            </div>
            <p className="hidden text-xs text-[#800020] font-semibold md:block">Real-time Room • {code}</p>
          </div>

          {/* Video Stage */}
          <div className="min-h-[360px] flex-1 p-3 bg-[#1A0307]">
            {!isMockLiveKit ? (
              <div className="relative h-full w-full min-h-[360px]">
                {tracks.length > 0 ? (
                  <GridLayout tracks={tracks} className="h-full min-h-[360px] w-full">
                    <ParticipantTile />
                  </GridLayout>
                ) : (
                  <div className="grid h-full min-h-[360px] w-full place-items-center rounded-2xl bg-[#2B050D] p-6 text-center border-2 border-[#800020]/30">
                    <div className="space-y-2">
                      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <p className="text-sm font-bold text-white">Connecting video…</p>
                      <p className="text-xs text-[#F0B8C4]">Room code: {code}</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="relative h-full w-full min-h-[200px]">
                <LocalCameraStage
                  displayName={displayName}
                  cameraOn={localCamOn}
                  micOn={localMicOn}
                  streamRef={localStreamRef}
                  sharedStream={sharedStream}
                />
              </div>
            )}
          </div>

          {/* Meeting assistant status */}
          <div aria-label="Meeting assistant status" className="flex items-center gap-3 border-t-2 border-[#F0B8C4] bg-[#FFF5F7] px-4 py-2 text-xs text-[#520919]">
            <AssistantTile />
            <div className="hidden text-xs text-[#520919] sm:block">
              <p className="font-bold text-[#800020]">MeetMate Assistant</p>
              <p className="text-[11px] text-[#520919]/80">AI notes and transcripts generated in real time</p>
            </div>
          </div>

          {/* Control Bar: exactly ONE screen share button */}
          <div className="flex flex-wrap items-center justify-center gap-2.5 border-t-2 border-[#F0B8C4] bg-white px-3 py-3 shadow-sm">
            {isMockLiveKit ? (
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button type="button" onClick={() => setLocalMicOn((m) => !m)} className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition cursor-pointer ${localMicOn ? "border-2 border-[#800020] bg-white text-[#800020] hover:bg-[#FFF0F3]" : "bg-[#800020] text-white"}`}>
                  {localMicOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}<span className="hidden xs:inline">{localMicOn ? "Mute" : "Unmute"}</span>
                </button>
                <button type="button" onClick={() => setLocalCamOn((c) => !c)} className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition cursor-pointer ${localCamOn ? "border-2 border-[#800020] bg-white text-[#800020] hover:bg-[#FFF0F3]" : "bg-[#800020] text-white"}`}>
                  {localCamOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}<span className="hidden xs:inline">{localCamOn ? "Camera" : "Start video"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void toggleScreenShare()}
                  className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition cursor-pointer ${screenShareEnabled ? "bg-[#800020] text-white" : "border-2 border-[#F0B8C4] text-[#800020] hover:bg-[#FFF0F3]"}`}
                >
                  <MonitorUp className="h-4 w-4" />
                  <span className="hidden xs:inline">{screenShareEnabled ? "Stop sharing" : "Share screen"}</span>
                </button>
              </div>
            ) : (
              <ControlBar variation="verbose" controls={{ microphone: true, camera: true, screenShare: true, leave: false, chat: false, settings: false }} onDeviceError={({ source, error }) => onNotice({ kind: "error", message: permissionMessage(error) ?? `Could not start ${source === Track.Source.Microphone ? "microphone" : source === Track.Source.Camera ? "camera" : "device"}: ${error.message}` })} />
            )}
            <button
              type="button"
              aria-label={`View participants (${totalParticipantCount})`}
              onClick={() => setShowParticipantsModal((prev) => !prev)}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-bold transition cursor-pointer ${
                showParticipantsModal
                  ? "bg-[#800020] text-white shadow-md"
                  : "border-2 border-[#800020] bg-white text-[#800020] hover:bg-[#FFF0F3]"
              }`}
            >
              <UsersRound className="h-4 w-4" />
              <span className="hidden xs:inline">People</span>
              <span className="rounded-full bg-[#800020] px-2 py-0.5 text-xs font-bold text-white">
                {totalParticipantCount}
              </span>
            </button>
            <button
              type="button"
              aria-pressed={captionsEnabled}
              onClick={() => setCaptionsEnabled((enabled) => !enabled)}
              className={`hidden items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition md:flex cursor-pointer ${captionsEnabled ? "bg-[#800020] text-white" : "border-2 border-[#F0B8C4] text-[#800020] hover:bg-[#FFF0F3]"}`}
            >
              <Captions className="h-4 w-4" />
              {captionsEnabled ? "Captions on" : "Captions off"}
            </button>
            {isHost ? (
              <button type="button" disabled={ending} onClick={() => void endMeeting()} className="flex items-center gap-2 rounded-xl bg-[#800020] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#600018] shadow-md shadow-[#800020]/20 disabled:opacity-50 cursor-pointer"><PhoneOff className="h-4 w-4" /><span>{ending ? "Ending…" : "End Meeting"}</span></button>
            ) : (
              <button type="button" onClick={() => void handleLeave()} className="flex items-center gap-2 rounded-xl bg-[#800020] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#600018] shadow-md shadow-[#800020]/20 cursor-pointer"><LogOut className="h-4 w-4" /><span>Leave</span></button>
            )}
          </div>
        </section>

        {/* Aside Panels (Transcript & Chat) */}
        <aside className="grid min-h-[520px] min-w-0 gap-3 lg:min-h-0 lg:grid-rows-2">
          <div className="min-h-0 overflow-hidden rounded-2xl border-2 border-[#F0B8C4] bg-white shadow-md">
            <TranscriptPanel supported={supported} speechError={speechError} localLines={localTranscriptLines} />
          </div>
          <div className="min-h-0 overflow-hidden rounded-2xl border-2 border-[#F0B8C4] bg-white shadow-md">
            <ChatPanel roomKey={code} senderName={displayName} mockMode={isMockLiveKit} />
          </div>
        </aside>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#F0B8C4] bg-[#FFF5F7] px-4 py-2 text-[11px] text-[#520919] sm:px-6">
        <span className="flex items-center gap-1.5 font-medium">{supported === false ? "Live transcription needs Chrome or Edge." : speechError || (isMicrophoneEnabled ? "Transcribing your microphone in real time." : "Turn on microphone to transcribe your speech.")}</span>
        <span className="flex items-center gap-3">{savingTranscript && <span role="status" className="font-bold text-[#800020]">Saving transcript…</span>}{endError && <span role="alert" className="text-white bg-[#800020] px-2 py-0.5 rounded font-bold">{endError}</span>}<span className="hidden items-center gap-1 font-semibold text-[#800020] sm:flex"><Sparkles className="h-3 w-3 text-[#800020]" /> MeetMate AI Copilot</span></span>
      </div>
      <RoomAudioRenderer />
      <MeetMateAssistant meetingId={meetingId} meetingTitle={code} />

      {/* Participants Drawer / Modal */}
      {showParticipantsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm sm:justify-end animate-in fade-in">
          <div
            role="dialog"
            aria-label="Participants list"
            className="flex h-full max-h-[640px] w-full max-w-sm flex-col rounded-3xl border-2 border-[#800020] bg-white p-5 shadow-2xl text-[#2B050D]"
          >
            <div className="flex items-center justify-between border-b border-[#F0B8C4] pb-4">
              <div className="flex items-center gap-2.5">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#FFF0F3] text-[#800020] border border-[#F0B8C4]">
                  <UsersRound className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-[#800020]">Meeting Participants</h2>
                  <p className="text-xs text-[#520919]">{totalParticipantCount} {totalParticipantCount === 1 ? "person connected" : "people connected"}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowParticipantsModal(false)}
                className="rounded-lg p-1.5 text-[#800020] hover:bg-[#FFF0F3] transition cursor-pointer"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="my-3 flex items-center justify-between rounded-2xl bg-[#FFF0F3] border border-[#F0B8C4] p-3">
              <div className="min-w-0 pr-2">
                <p className="text-[11px] font-bold text-[#800020]">Invite more participants</p>
                <p className="truncate text-[10px] text-[#520919]">Code: <span className="font-mono font-bold text-[#800020]">{code}</span></p>
              </div>
              <button
                type="button"
                onClick={copyMeetingLink}
                className="shrink-0 flex items-center gap-1.5 rounded-xl bg-[#800020] hover:bg-[#600018] px-3 py-1.5 text-xs font-bold text-white transition shadow-sm cursor-pointer"
              >
                {copiedLink ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedLink ? "Copied" : "Copy Link"}</span>
              </button>
            </div>

            <div className="mb-3 px-1">
              <p className="text-[11px] font-medium text-[#800020]/70">
                Share this meeting code with teammates to join instantly.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {displayParticipants.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-2xl border border-[#F0B8C4] bg-[#FFF5F7] p-3 transition hover:border-[#800020]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#800020] text-xs font-bold text-white shadow">
                      {p.name.charAt(0).toUpperCase()}
                      {p.isSpeaking && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-white ring-2 ring-[#800020] animate-pulse" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-bold text-[#2B050D]">{p.name}</span>
                        {p.isLocal && (
                          <span className="rounded bg-[#FFF0F3] border border-[#800020]/30 px-1.5 py-0.2 text-[9px] font-bold text-[#800020]">You</span>
                        )}
                        {p.isHost && (
                          <span className="flex items-center gap-0.5 rounded-full bg-[#800020] px-2 py-0.5 text-[9px] font-bold text-white shadow-sm">
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
        let initialName = user.displayName;
        if (typeof window !== "undefined") {
          const stored = localStorage.getItem("meetmate_user_name");
          if (stored && stored.trim()) initialName = stored.trim();
        }
        setDisplayName(initialName);

        const resolvedUserId =
          effectiveUserId ||
          user.id ||
          (typeof window !== "undefined" ? localStorage.getItem("meetmate_user_id") : null) ||
          `user-${Math.random().toString(36).substring(2, 9)}`;
        setUserId(resolvedUserId);

        const result = await getLiveKitCredentials(code.trim().toUpperCase(), initialName);
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

    const normalizedCode = code.trim().toUpperCase();
    const effectiveMeetingId = meetingId || `meet-${normalizedCode.toLowerCase()}`;
    const effectiveUserId = userId || `user-${Math.floor(Math.random() * 9000) + 1000}`;
    const finalDisplayName = displayName.trim() || `User-${effectiveUserId.slice(-4)}`;
    setMeetingId(effectiveMeetingId);
    setUserId(effectiveUserId);
    setDisplayName(finalDisplayName);

    // Explicitly release any preview tracks from Lobby so LiveKit gets full access to camera & mic hardware
    if (lobbyStream) {
      try {
        lobbyStream.getTracks().forEach((track) => track.stop());
      } catch {}
      setLobbyStream(null);
      // Give device driver 250ms to cleanly release sensor
      await new Promise((r) => setTimeout(r, 250));
    }

    try {
      const freshCredentials = await getLiveKitCredentials(normalizedCode, finalDisplayName);
      setCredentials(freshCredentials);
    } catch {
      // Continue with existing credentials
    }

    try {
      await fetch(`/api/meetings/${encodeURIComponent(effectiveMeetingId)}/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: effectiveUserId, displayName: finalDisplayName }),
      });
    } catch {
      // Best-effort server consent recording
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
      <main className="min-h-screen bg-white text-[#2B050D]">
        <Navbar />
        <Lobby
          code={code}
          displayName={displayName}
          onDisplayNameChange={(name) => {
            setDisplayName(name);
            try {
              localStorage.setItem("meetmate_user_name", name);
            } catch {}
          }}
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
      </main>
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
    <main className="min-h-screen bg-white text-[#2B050D]">
      <Navbar />
      {/* Sleek Meeting Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F0B8C4] bg-[#FFF5F7] px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#800020] text-white shadow-sm">
            <Video size={16} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[#800020]">{code}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#800020] text-white px-2 py-0.5 text-[10px] font-bold">
                Live
              </span>
            </div>
            <p className="text-[11px] font-medium text-[#520919]">MeetMate AI Live Arena</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[#F0B8C4] bg-white px-3 py-1 text-xs font-semibold text-[#800020]">
            <span className="h-2 w-2 rounded-full bg-[#800020] animate-pulse" />
            AI Assistant Active
          </span>
          <span className="rounded-full border border-[#F0B8C4] bg-white px-3 py-1 text-xs font-semibold text-[#520919]">
            In room as <strong className="text-[#800020]">{displayName}</strong>
          </span>
        </div>
      </div>
      {notice && (
        <div
          className={`fixed left-1/2 top-20 z-[100] max-w-[90vw] -translate-x-1/2 rounded-2xl px-5 py-3 text-sm font-bold shadow-2xl border ${
            notice.kind === "error"
              ? "bg-[#9C0E2E] text-white border-white/40"
              : "bg-[#800020] text-white border-white/40"
          }`}
          role="status"
          aria-live="polite"
        >
          {notice.message}
        </div>
      )}
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
