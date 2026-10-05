"use client";

import { useEffect, useRef, useState } from "react";
import ConsentBanner from "./ConsentBanner";

type LobbyProps = {
  code: string;
  displayName: string;
  consented: boolean;
  serverConsentAvailable: boolean;
  joining: boolean;
  joinError: string | null;
  onConsentChange: (consented: boolean) => void;
  onJoin: () => void;
  onLeave: () => void;
  onStreamReady?: (stream: MediaStream) => void;
};

export default function Lobby({
  code,
  displayName,
  consented,
  serverConsentAvailable,
  joining,
  joinError,
  onConsentChange,
  onJoin,
  onLeave,
  onStreamReady,
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
      if (!onStreamReady) {
        streamRef.current?.getTracks().forEach((track) => track.stop());
      }
    };
  }, [onStreamReady]);

  useEffect(() => {
    streamRef.current?.getVideoTracks().forEach((track) => { track.enabled = cameraOn; });
  }, [cameraOn]);

  useEffect(() => {
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = micOn; });
  }, [micOn]);

  return (
    <main className="grid min-h-screen place-items-center bg-[#0b1020] px-4 py-8 text-white">
      <section className="w-full max-w-3xl rounded-2xl border border-slate-700 bg-slate-900/90 p-5 shadow-2xl sm:p-8">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-indigo-300">Meeting lobby</p>
            <h1 className="mt-1 text-2xl font-semibold">{code}</h1>
          </div>
          <p className="rounded-full bg-slate-800 px-3 py-2 text-sm text-slate-200">Joining as <strong>{displayName}</strong></p>
        </header>

        <div className="grid gap-5 md:grid-cols-[1.2fr_.8fr]">
          <div>
            <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-950">
              <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
              {!hasPreview && (
                <div className="absolute inset-0 grid place-items-center text-sm text-slate-400">Camera preview unavailable</div>
              )}
              <span className="absolute bottom-3 left-3 rounded bg-black/60 px-2 py-1 text-xs">{displayName}</span>
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => setMicOn((value) => !value)} className="rounded-lg border border-slate-600 px-4 py-2 text-sm hover:bg-slate-800">
                {micOn ? "🎙 Mic on" : "🔇 Mic off"}
              </button>
              <button type="button" onClick={() => setCameraOn((value) => !value)} className="rounded-lg border border-slate-600 px-4 py-2 text-sm hover:bg-slate-800">
                {cameraOn ? "📷 Camera on" : "Camera off"}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <ConsentBanner
              consented={consented}
              onConsentChange={onConsentChange}
              serverConsentAvailable={serverConsentAvailable}
            />
            {(permissionError || joinError) && (
              <p role="alert" className="rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
                {joinError ?? permissionError}
              </p>
            )}
            <div className="mt-auto flex gap-3 pt-2">
              <button type="button" onClick={onLeave} className="flex-1 rounded-lg border border-slate-600 px-4 py-3 font-medium hover:bg-slate-800">
                Leave
              </button>
              <button
                type="button"
                disabled={!consented || joining}
                onClick={onJoin}
                className="flex-1 rounded-lg bg-indigo-500 px-4 py-3 font-semibold text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {joining ? "Joining…" : "Join meeting"}
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
