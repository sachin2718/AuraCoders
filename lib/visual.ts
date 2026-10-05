"use client";

import { useEffect, useRef } from "react";

export interface UseVisualShareOptions {
  meetingId?: string;
  startedAt: number;
  localTrack?: MediaStreamTrack | null;
  maxFrames?: number;
  intervalMs?: number;
  onNotice?: (notice: { kind: "error" | "info"; message: string }) => void;
}

/**
 * Cheap pixel difference check between two 32x32 thumbnails.
 * Compares 1024 sampled pixels (RGB).
 * Returns true if the difference ratio exceeds the threshold (content changed),
 * or false if the frames are almost identical (skip frame).
 */
export function isSignificantPixelDifference(
  prev: Uint8ClampedArray | null,
  curr: Uint8ClampedArray,
  threshold = 0.03
): boolean {
  if (!prev) return true;
  if (prev.length !== curr.length) return true;

  let diffPixels = 0;
  const totalPixels = prev.length / 4;

  for (let i = 0; i < prev.length; i += 4) {
    const diff =
      Math.abs(prev[i] - curr[i]) +
      Math.abs(prev[i + 1] - curr[i + 1]) +
      Math.abs(prev[i + 2] - curr[i + 2]);
    // 35 across RGB channels filters out subtle compression/encoding noise
    if (diff > 35) {
      diffPixels += 1;
    }
  }

  const diffRatio = diffPixels / totalPixels;
  return diffRatio > threshold;
}

/**
 * Downscales video frame to max 1024px width, encodes as JPEG (quality 0.6),
 * and generates a 32x32 thumbnail for fast pixel difference comparison.
 */
export function downscaleAndEncodeCanvas(
  video: HTMLVideoElement,
  maxDim = 1024,
  quality = 0.6
): { imageBase64: string; thumbnailPixels: Uint8ClampedArray } | null {
  if (typeof document === "undefined") return null;
  if (!video || video.videoWidth === 0 || video.videoHeight === 0) return null;

  let width = video.videoWidth;
  let height = video.videoHeight;

  // Downscale to max 1024px width while preserving aspect ratio
  if (width > maxDim) {
    height = Math.round((height * maxDim) / width);
    width = maxDim;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, width, height);

  // Generate 32x32 thumbnail for cheap pixel-difference check
  const thumbCanvas = document.createElement("canvas");
  thumbCanvas.width = 32;
  thumbCanvas.height = 32;
  const thumbCtx = thumbCanvas.getContext("2d", { willReadFrequently: true });
  if (!thumbCtx) return null;

  thumbCtx.drawImage(canvas, 0, 0, 32, 32);
  const thumbnailPixels = thumbCtx.getImageData(0, 0, 32, 32).data;

  // JPEG quality 0.6 as data URI
  const imageBase64 = canvas.toDataURL("image/jpeg", quality);

  return {
    imageBase64,
    thumbnailPixels: new Uint8ClampedArray(thumbnailPixels),
  };
}

/**
 * Hook: Automatically captures a downscaled frame every 10 seconds while
 * the local participant is sharing their screen, and POSTs it to /api/visual.
 * - Max 1024px width
 * - JPEG quality 0.6
 * - Cheap pixel-difference check (skips redundant frames)
 * - Hard cap 20 frames per meeting
 * - Immediately stops when sharing stops
 */
export function useVisualShare({
  meetingId,
  startedAt,
  localTrack,
  maxFrames = 20,
  intervalMs = 10000,
}: UseVisualShareOptions) {
  // Hard cap 20 frames per meeting across share sessions
  const framesCapturedCountRef = useRef(0);
  const prevThumbnailPixelsRef = useRef<Uint8ClampedArray | null>(null);

  useEffect(() => {
    if (!localTrack || !meetingId || typeof document === "undefined") {
      return;
    }

    if (localTrack.readyState === "ended") {
      return;
    }

    // Hidden video element to play the local screen share track
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.style.display = "none";
    video.style.position = "absolute";
    video.style.top = "-9999px";
    document.body.appendChild(video);

    const stream = new MediaStream([localTrack]);
    video.srcObject = stream;
    video.play().catch(() => {});

    let isCapturing = false;
    let isStopped = false;

    const captureAndPost = async () => {
      if (isStopped || isCapturing) return;
      if (framesCapturedCountRef.current >= maxFrames) {
        return;
      }
      if (!meetingId || video.videoWidth === 0 || video.readyState < 2) {
        return;
      }

      isCapturing = true;
      try {
        const encoded = downscaleAndEncodeCanvas(video, 1024, 0.6);
        if (!encoded) return;

        // Skip frame if almost identical to previous frame
        const hasDifference = isSignificantPixelDifference(
          prevThumbnailPixelsRef.current,
          encoded.thumbnailPixels,
          0.02
        );

        if (!hasDifference) {
          // Frame is almost identical, skip POST
          return;
        }

        // Significant difference detected (or first frame): save thumbnail and proceed
        prevThumbnailPixelsRef.current = encoded.thumbnailPixels;
        framesCapturedCountRef.current += 1;

        const tMs = Math.max(0, Date.now() - startedAt);

        await fetch("/api/visual", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            meetingId,
            tMs,
            imageBase64: encoded.imageBase64,
          }),
        });
      } catch {
        // Silently catch background visual capture errors
      } finally {
        isCapturing = false;
      }
    };

    // Capture initial frame once video stream renders (after ~1.2s stabilization)
    const initialTimer = window.setTimeout(() => {
      void captureAndPost();
    }, 1200);

    // Repeated capture every 10 seconds
    const intervalTimer = window.setInterval(() => {
      void captureAndPost();
    }, intervalMs);

    // Stop immediately if native MediaStreamTrack emits 'ended'
    const onEnded = () => {
      isStopped = true;
      window.clearTimeout(initialTimer);
      window.clearInterval(intervalTimer);
    };
    localTrack.addEventListener("ended", onEnded);

    // Cleanup when screen sharing stops or unmounts
    return () => {
      isStopped = true;
      localTrack.removeEventListener("ended", onEnded);
      window.clearTimeout(initialTimer);
      window.clearInterval(intervalTimer);
      try {
        video.pause();
        video.srcObject = null;
        if (video.parentNode) {
          video.parentNode.removeChild(video);
        }
      } catch {
        // ignore cleanup error
      }
    };
  }, [localTrack, meetingId, startedAt, maxFrames, intervalMs]);

  return {
    framesCapturedCount: framesCapturedCountRef.current,
  };
}
