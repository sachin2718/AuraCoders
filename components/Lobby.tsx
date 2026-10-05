"use client";

import { useEffect, useRef, useState } from "react";
import { UsersRound, Mic, MicOff, Video, VideoOff } from "lucide-react";
import ConsentBanner from "./ConsentBanner";

type LobbyProps = {
  code: string;
  displayName: string;
  onDisplayNameChange?: (name: string) => void;
  consented: boolean;
  serverConsentAvailable: boolean;
  joining: boolean;
  joinError: string | null;
  onConsentChange: (consented: boolean) => void;
  onJoin: () => void;
  onLeave: () => void;
  onStreamReady?: (stream: MediaStream) => void;
  participantCount?: number | null;
};

export default function Lobby({
  code,
  displayName,
  onDisplayNameChange,
  consented,
  serverConsentAvailable,
  joining,
  joinError,
  onConsentChange,
  onJoin,
  onLeave,
  onStreamReady,
  participantCount,
}: LobbyProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [hasPreview, setHasPreview] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);

  useEffect(() => {
    let active = true;
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermissionError("Camera preview is not supported in this browser. You can still join the meeting.");
      return;
    }

    void navigator.mediaDevices.getUserMedia({ audio: true, video: true })
      .then((stream) => {
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        setHasPreview(true);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        onStreamReady?.(stream);
      })
      .catch((error: unknown) => {
        const denied = error instanceof Error && /NotAllowed|PermissionDenied/i.test(`${error.name} ${error.message}`);
        setPermissionError(denied
          ? "Camera or microphone permission was denied. You can still join and allow access from the browser prompt."
          : "Camera and microphone preview is unavailable. You can still join the meeting.");
      });

    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [onStreamReady]);

  useEffect(() => {
    streamRef.current?.getVideoTracks().forEach((track) => { track.enabled = cameraOn; });
  }, [cameraOn]);

  useEffect(() => {
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = micOn; });
  }, [micOn]);

  return (
    <main className="grid min-h-screen place-items-center bg-[#FFF0F3] px-4 py-8 text-[#2B050D]">
      <section className="w-full max-w-3xl rounded-3xl border-2 border-[#800020] bg-white p-6 shadow-2xl shadow-[#800020]/15 sm:p-8">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-[#F0B8C4] pb-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-[#800020]">Meeting Lobby</p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-extrabold tracking-tight text-[#2B050D]">{code}</h1>
              {typeof participantCount === "number" && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#800020]/30 bg-[#FFF0F3] px-3 py-1 text-xs font-bold text-[#800020]">
                  <UsersRound className="h-3.5 w-3.5" />
                  {participantCount} {participantCount === 1 ? "participant in meeting" : "participants in meeting"}
                </span>
              )}
            </div>
          </div>
          <p className="rounded-full border border-[#F0B8C4] bg-[#FFF0F3] px-3.5 py-1.5 text-xs font-semibold text-[#800020]">
            Joining as <strong className="text-[#2B050D]">{displayName}</strong>
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-[1.2fr_.8fr]">
          <div>
            <div className="relative aspect-video overflow-hidden rounded-2xl border-2 border-[#800020] bg-[#1A0307] shadow-inner">
              <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover -scale-x-100" />
              {!hasPreview && (
                <div className="absolute inset-0 grid place-items-center text-sm font-medium text-white/70">Camera preview initializing…</div>
              )}
              <span className="absolute bottom-3 left-3 rounded-lg border border-white/20 bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
                {displayName} (Preview)
              </span>
            </div>
            <div className="mt-3 flex gap-2.5">
              <button
                type="button"
                onClick={() => setMicOn((value) => !value)}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl border-2 py-2.5 text-sm font-semibold transition-all cursor-pointer ${
                  micOn
                    ? "border-[#800020] bg-white text-[#800020] hover:bg-[#FFF0F3]"
                    : "border-[#9C0E2E] bg-[#FFF0F3] text-[#9C0E2E]"
                }`}
              >
                {micOn ? <Mic className="h-4 w-4 text-[#800020]" /> : <MicOff className="h-4 w-4" />}
                <span>{micOn ? "Mic On" : "Mic Muted"}</span>
              </button>
              <button
                type="button"
                onClick={() => setCameraOn((value) => !value)}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl border-2 py-2.5 text-sm font-semibold transition-all cursor-pointer ${
                  cameraOn
                    ? "border-[#800020] bg-white text-[#800020] hover:bg-[#FFF0F3]"
                    : "border-[#9C0E2E] bg-[#FFF0F3] text-[#9C0E2E]"
                }`}
              >
                {cameraOn ? <Video className="h-4 w-4 text-[#800020]" /> : <VideoOff className="h-4 w-4" />}
                <span>{cameraOn ? "Camera On" : "Camera Off"}</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <label htmlFor="display-name-input" className="block text-xs font-bold uppercase tracking-wider text-[#800020] mb-1.5">
                Your Display Name
              </label>
              <input
                id="display-name-input"
                type="text"
                value={displayName}
                onChange={(e) => onDisplayNameChange?.(e.target.value)}
                placeholder="Enter your name"
                maxLength={50}
                className="w-full rounded-xl border-2 border-[#F0B8C4] bg-white px-3.5 py-2.5 text-sm font-semibold text-[#2B050D] placeholder-[#800020]/30 focus:border-[#800020] focus:outline-none focus:ring-2 focus:ring-[#800020]/20 transition"
              />
            </div>

            <ConsentBanner
              consented={consented}
              onConsentChange={onConsentChange}
              serverConsentAvailable={serverConsentAvailable}
            />

            {(permissionError || joinError) && (
              <p role="alert" className="rounded-xl border-2 border-[#9C0E2E] bg-[#FFF0F3] p-3 text-xs font-semibold text-[#9C0E2E]">
                {joinError ?? permissionError}
              </p>
            )}

            <div className="mt-auto flex gap-3 pt-3">
              <button
                type="button"
                onClick={onLeave}
                className="flex-1 rounded-xl border-2 border-[#800020] bg-white px-4 py-3 text-sm font-bold text-[#800020] hover:bg-[#FFF0F3] transition cursor-pointer"
              >
                Leave
              </button>
              <button
                type="button"
                disabled={!consented || joining}
                onClick={onJoin}
                className="flex-1 rounded-xl bg-[#800020] px-4 py-3 text-sm font-bold text-white shadow-lg shadow-[#800020]/20 hover:bg-[#600018] transition disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer"
              >
                {joining ? "Joining…" : "Join Meeting"}
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
