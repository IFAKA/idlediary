"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { addDebugEvent } from "@/features/errors/debug-store";

type CameraPreviewProps = {
  stream: MediaStream | null;
};

const PREVIEW_SETTLE_MS = 190;
const PLACEHOLDER_EXIT_MS = 420;
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

export function CameraPreview({ stream }: CameraPreviewProps) {
  return <CameraPreviewSurface key={getStreamKey(stream)} stream={stream} />;
}

function CameraPreviewSurface({ stream }: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const metadataLoadedRef = useRef(false);
  const canPlayRef = useRef(false);
  const revealStartedRef = useRef(false);
  const readyTimerRef = useRef<number | null>(null);
  const exitTimerRef = useRef<number | null>(null);
  const [frameAspectRatio, setFrameAspectRatio] = useState<number | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [showPlaceholder, setShowPlaceholder] = useState(true);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    return () => {
      if (readyTimerRef.current) {
        window.clearTimeout(readyTimerRef.current);
      }
      if (exitTimerRef.current) {
        window.clearTimeout(exitTimerRef.current);
      }
    };
  }, []);

  const maybeRevealPreview = () => {
    if (
      !stream ||
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
    maybeRevealPreview();
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black">
      <div
        className={`relative max-h-full overflow-hidden bg-black ${stream ? "w-full" : "h-full w-full"}`}
        style={{ aspectRatio: stream ? frameAspectRatio ?? 16 / 9 : undefined }}
      >
        {stream ? (
          <video
            ref={videoRef}
            aria-label="Camera preview"
            autoPlay
            className="h-full w-full object-contain"
            muted
            playsInline
            onCanPlay={markCanPlay}
            onLoadedData={markCanPlay}
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              const nextAspectRatio =
                video.videoWidth > 0 && video.videoHeight > 0
                  ? video.videoWidth / video.videoHeight
                  : null;
              metadataLoadedRef.current = true;
              setFrameAspectRatio(nextAspectRatio);
              addDebugEvent("camera-preview-metadata", "capture", {
                videoWidth: video.videoWidth,
                videoHeight: video.videoHeight,
                clientWidth: video.clientWidth,
                clientHeight: video.clientHeight,
                aspectRatio: nextAspectRatio,
              });
              maybeRevealPreview();
            }}
          />
        ) : null}
        {showPlaceholder ? (
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_28%,hsl(var(--memory)/0.32),transparent_34%),radial-gradient(circle_at_78%_18%,hsl(var(--accent)/0.24),transparent_32%),radial-gradient(circle_at_55%_82%,hsl(var(--primary)/0.26),transparent_38%),linear-gradient(135deg,#181115,#090708_62%,#130d12)] bg-[length:140%_140%,130%_130%,150%_150%,100%_100%]"
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
