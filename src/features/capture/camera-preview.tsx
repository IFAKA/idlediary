"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { addDebugEvent } from "@/features/errors/debug-store";
import { drawContainFrame } from "@/features/video/cover-frame";
import { exportProfile } from "@/features/video/export-profile";

type CameraPreviewProps = {
  demoVideoSrc?: string;
  stream: MediaStream | null;
};

const PREVIEW_SETTLE_MS = 190;
const PLACEHOLDER_EXIT_MS = 420;
const PREVIEW_BACKDROP_CLASS =
  "pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_28%,hsl(var(--memory)/0.32),transparent_34%),radial-gradient(circle_at_78%_18%,hsl(var(--accent)/0.24),transparent_32%),radial-gradient(circle_at_55%_82%,hsl(var(--primary)/0.26),transparent_38%),linear-gradient(135deg,#181115,#090708_62%,#130d12)] bg-[length:140%_140%,130%_130%,150%_150%,100%_100%]";
const streamKeys = new WeakMap<MediaStream, number>();
let nextStreamKey = 0;

function getStreamKey(stream: MediaStream | null) {
  if (!stream) return "empty";

  const existingKey = streamKeys.get(stream);
  if (existingKey !== undefined) return existingKey;

  nextStreamKey += 1;
  streamKeys.set(stream, nextStreamKey);
  return nextStreamKey;
}

export function CameraPreview({ demoVideoSrc, stream }: CameraPreviewProps) {
  return (
    <CameraPreviewSurface
      key={demoVideoSrc ?? getStreamKey(stream)}
      demoVideoSrc={demoVideoSrc}
      stream={stream}
    />
  );
}

function CameraPreviewSurface({ demoVideoSrc, stream }: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const metadataLoadedRef = useRef(false);
  const canPlayRef = useRef(false);
  const revealStartedRef = useRef(false);
  const readyTimerRef = useRef<number | null>(null);
  const exitTimerRef = useRef<number | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [showPlaceholder, setShowPlaceholder] = useState(true);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = demoVideoSrc ? null : stream;
    }
  }, [demoVideoSrc, stream]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
      if (readyTimerRef.current) {
        window.clearTimeout(readyTimerRef.current);
      }
      if (exitTimerRef.current) {
        window.clearTimeout(exitTimerRef.current);
      }
    };
  }, []);

  const drawPreviewFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    if (video.videoWidth > 0 && video.videoHeight > 0) {
      drawContainFrame(video, canvas, video.videoWidth, video.videoHeight);
    }

    animationFrameRef.current = window.requestAnimationFrame(drawPreviewFrame);
  };

  const startPreviewDrawing = () => {
    if (animationFrameRef.current) return;
    animationFrameRef.current = window.requestAnimationFrame(drawPreviewFrame);
  };

  const maybeRevealPreview = () => {
    if (
      (!stream && !demoVideoSrc) ||
      previewReady ||
      revealStartedRef.current ||
      !metadataLoadedRef.current ||
      !canPlayRef.current ||
      readyTimerRef.current
    ) {
      return;
    }

    revealStartedRef.current = true;
    readyTimerRef.current = window.setTimeout(() => {
      readyTimerRef.current = null;
      setPreviewReady(true);
      addDebugEvent("camera-preview-ready", "capture", {
        settleMs: PREVIEW_SETTLE_MS,
      });
      exitTimerRef.current = window.setTimeout(() => {
        exitTimerRef.current = null;
        setShowPlaceholder(false);
      }, PLACEHOLDER_EXIT_MS);
    }, PREVIEW_SETTLE_MS);
  };

  const markCanPlay = () => {
    canPlayRef.current = true;
    startPreviewDrawing();
    maybeRevealPreview();
  };

  return (
    <div className="absolute inset-0 flex items-start justify-center bg-black">
      <motion.div
        aria-hidden="true"
        className={PREVIEW_BACKDROP_CLASS}
        data-testid="camera-preview-backdrop"
        animate={{
          backgroundPosition: [
            "0% 32%, 100% 18%, 50% 100%, 0% 0%",
            "100% 55%, 0% 42%, 22% 0%, 0% 0%",
            "0% 32%, 100% 18%, 50% 100%, 0% 0%",
          ],
          scale: [1, 1.025, 1],
        }}
        initial={false}
        transition={{
          backgroundPosition: { duration: 14, ease: "easeInOut", repeat: Infinity },
          scale: { duration: 8, ease: "easeInOut", repeat: Infinity },
        }}
      />
      <div
        className="relative max-h-full max-w-full overflow-hidden bg-black"
        data-testid="camera-preview-frame"
        style={{
          aspectRatio: exportProfile.aspectRatio,
          height: "min(100%, calc(var(--app-viewport-width) * 16 / 9))",
          width: "auto",
        }}
      >
        {stream || demoVideoSrc ? (
          <>
            <canvas
              ref={canvasRef}
              aria-label="Camera preview"
              className="h-full w-full"
              height={exportProfile.height}
              width={exportProfile.width}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 border border-white/35 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.28)]"
            />
            <video
              ref={videoRef}
              aria-hidden="true"
              autoPlay
              className="pointer-events-none absolute left-0 top-0 size-px opacity-0"
              data-testid="camera-preview-source"
              loop={Boolean(demoVideoSrc)}
              muted
              playsInline
              src={demoVideoSrc}
              onCanPlay={markCanPlay}
              onLoadedData={markCanPlay}
              onLoadedMetadata={(event) => {
                const video = event.currentTarget;
                const nextAspectRatio =
                  video.videoWidth > 0 && video.videoHeight > 0
                    ? video.videoWidth / video.videoHeight
                    : null;
                metadataLoadedRef.current = true;
                startPreviewDrawing();
                addDebugEvent("camera-preview-metadata", "capture", {
                  videoWidth: video.videoWidth,
                  videoHeight: video.videoHeight,
                  compositionWidth: exportProfile.width,
                  compositionHeight: exportProfile.height,
                  compositionAspectRatio: exportProfile.aspectRatio,
                  rawAspectRatio: nextAspectRatio,
                });
                maybeRevealPreview();
              }}
            />
          </>
        ) : null}
        {showPlaceholder ? (
          <motion.div
            aria-hidden="true"
            className={PREVIEW_BACKDROP_CLASS}
            data-preview-ready={previewReady}
            data-testid="camera-preview-placeholder"
            animate={{
              backgroundPosition: previewReady
                ? "50% 50%, 50% 50%, 50% 50%, 0% 0%"
                : [
                    "0% 32%, 100% 18%, 50% 100%, 0% 0%",
                    "100% 55%, 0% 42%, 22% 0%, 0% 0%",
                    "0% 32%, 100% 18%, 50% 100%, 0% 0%",
                  ],
              opacity: previewReady ? 0 : 1,
              scale: previewReady ? 1.02 : [1, 1.025, 1],
            }}
            initial={false}
            transition={{
              backgroundPosition: { duration: 14, ease: "easeInOut", repeat: previewReady ? 0 : Infinity },
              opacity: { duration: 0.36, ease: "easeOut" },
              scale: { duration: 8, ease: "easeInOut", repeat: previewReady ? 0 : Infinity },
            }}
          />
        ) : null}
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.42),transparent_28%,transparent_58%,rgba(0,0,0,0.72))]" />
    </div>
  );
}
