"use client";

import {
  LiveKitRoom,
  VideoConference,
  useRoomContext,
} from "@livekit/components-react";
import { MediaDeviceFailure, RoomEvent } from "livekit-client";
import "@livekit/components-styles";
import { useCallback, useEffect, useState } from "react";
import {
  getLiveKitCredentials,
  getSignedInDisplayName,
  type LiveKitCredentials,
} from "../lib/livekit";

type RoomProps = { code: string };
type Notice = { kind: "error" | "info"; message: string };

function ConnectionNotices({ onNotice }: { onNotice: (notice: Notice | null) => void }) {
  const room = useRoomContext();

  useEffect(() => {
    const reconnecting = () =>
      onNotice({ kind: "info", message: "Connection interrupted. Reconnecting…" });
    const reconnected = () =>
      onNotice({ kind: "info", message: "Reconnected to the meeting." });
    const disconnected = () =>
      onNotice({ kind: "error", message: "You left the meeting or were disconnected." });

    room.on(RoomEvent.Reconnecting, reconnecting);
    room.on(RoomEvent.Reconnected, reconnected);
    room.on(RoomEvent.Disconnected, disconnected);

    return () => {
      room.off(RoomEvent.Reconnecting, reconnecting);
      room.off(RoomEvent.Reconnected, reconnected);
      room.off(RoomEvent.Disconnected, disconnected);
    };
  }, [onNotice, room]);

  return null;
}

function permissionMessage(error: unknown): string | null {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/NotAllowedError|PermissionDeniedError|PermissionDenied/i.test(`${name} ${message}`)) {
    return "Camera or microphone access was denied. Allow access in your browser settings, then rejoin.";
  }
  return null;
}

export default function Room({ code }: RoomProps) {
  const [credentials, setCredentials] = useState<LiveKitCredentials | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [connected, setConnected] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const handleNotice = useCallback((nextNotice: Notice | null) => {
    setNotice(nextNotice);
    if (nextNotice) {
      window.setTimeout(() => setNotice((current) => current === nextNotice ? null : current), 5000);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function join() {
      try {
        const localName = new URLSearchParams(window.location.search).get("name") ?? undefined;
        const name = await getSignedInDisplayName(localName);
        if (cancelled) return;
        setDisplayName(name);
        const result = await getLiveKitCredentials(code, name);
        if (!cancelled) setCredentials(result);
      } catch (cause) {
        if (!cancelled) {
          setError(
            permissionMessage(cause) ??
              (cause instanceof Error ? cause.message : "Unable to join the meeting."),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void join();
    return () => { cancelled = true; };
  }, [code, retryKey]);

  const retry = () => {
    setError(null);
    setLoading(true);
    setCredentials(null);
    // Remounting the component reruns the auth and token lookup effect.
    setRetryKey((key) => key + 1);
  };

  if (loading) {
    return <main className="meeting-state">Connecting to meeting {code}…</main>;
  }

  if (error || !credentials) {
    return (
      <main className="meeting-state">
        <section className="meeting-error" role="alert">
          <h1>Could not join the meeting</h1>
          <p>{error ?? "Meeting credentials are unavailable."}</p>
          <button type="button" onClick={retry}>Try again</button>
        </section>
        <MeetingStyles />
      </main>
    );
  }

  return (
    <main className="meeting-page">
      <header className="meeting-header">
        <div>
          <p className="meeting-eyebrow">MeetMate meeting</p>
          <h1>{code}</h1>
        </div>
        <p className="meeting-user">Joining as <strong>{displayName}</strong></p>
      </header>
      {notice && (
        <div className={`meeting-toast ${notice.kind}`} role="status" aria-live="polite">
          {notice.message}
        </div>
      )}
      <div className="meeting-stage">
        <LiveKitRoom
          serverUrl={credentials.url}
          token={credentials.token}
          connect
          audio
          video
          onConnected={() => setConnected(true)}
          onDisconnected={() => setConnected(false)}
          onError={(cause) => handleNotice({ kind: "error", message: permissionMessage(cause) ?? (cause instanceof Error ? cause.message : "Meeting connection failed.") })}
          onMediaDeviceFailure={(failure, kind) => {
            if (failure === MediaDeviceFailure.PermissionDenied) {
              handleNotice({
                kind: "error",
                message: `Allow ${kind === "audioinput" ? "microphone" : "camera"} access in your browser settings, then rejoin.`,
              });
            } else if (failure) {
              handleNotice({
                kind: "error",
                message: `Could not start ${kind === "audioinput" ? "microphone" : "camera"} (${failure}). Check that the device is connected and not in use.`,
              });
            }
          }}
        >
          <ConnectionNotices onNotice={handleNotice} />
          <VideoConference />
        </LiveKitRoom>
      </div>
      {!connected && <p className="meeting-connecting" role="status">Joining room…</p>}
      <MeetingStyles />
    </main>
  );
}

function MeetingStyles() {
  return (
    <style jsx global>{`
      html, body { margin: 0; min-height: 100%; background: #0b1020; color: #f8fafc; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      .meeting-page { min-height: 100vh; display: flex; flex-direction: column; background: radial-gradient(ellipse at top, #18243a 0, #0b1020 60%); }
      .meeting-header { box-sizing: border-box; width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; border-bottom: 1px solid #29364b; }
      .meeting-header h1 { margin: 2px 0 0; font-size: 20px; }
      .meeting-eyebrow { margin: 0; color: #9caec7; font-size: 12px; text-transform: uppercase; letter-spacing: .12em; }
      .meeting-user { color: #b9c6d8; font-size: 14px; }
      .meeting-user strong { color: #fff; }
      .meeting-stage { flex: 1; min-height: 0; height: calc(100vh - 70px); }
      .meeting-toast { position: fixed; z-index: 100; top: 80px; left: 50%; transform: translateX(-50%); max-width: min(90vw, 540px); padding: 12px 18px; border-radius: 10px; color: #fff; background: #334155; box-shadow: 0 10px 35px #0008; }
      .meeting-toast.error { background: #9f2525; }
      .meeting-toast.info { background: #245b87; }
      .meeting-state { box-sizing: border-box; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #0b1020; color: #f8fafc; }
      .meeting-error { width: min(100%, 460px); padding: 28px; border: 1px solid #344156; border-radius: 16px; background: #131c2b; }
      .meeting-error h1 { margin-top: 0; }
      .meeting-error p { color: #bdc9d9; line-height: 1.5; }
      .meeting-error button { margin-top: 12px; padding: 10px 16px; border: 0; border-radius: 8px; color: #fff; background: #496de0; cursor: pointer; }
      .meeting-connecting { position: fixed; left: 24px; bottom: 12px; color: #9caec7; font-size: 13px; pointer-events: none; }
      @media (max-width: 640px) { .meeting-header { padding: 12px 16px; } .meeting-stage { height: calc(100vh - 60px); } }
    `}</style>
  );
}
