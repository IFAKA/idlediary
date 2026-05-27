"use client";

import { useEffect, useRef, useState } from "react";
import { addDebugEvent } from "@/features/errors/debug-store";

type CameraPreviewProps = {
  stream: MediaStream | null;
};

export function CameraPreview({ stream }: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [frameAspectRatio, setFrameAspectRatio] = useState<number | null>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black">
      {stream ? (
        <div
          className="relative w-full max-h-full overflow-hidden bg-black"
          style={{ aspectRatio: frameAspectRatio ?? 16 / 9 }}
        >
          <video
            ref={videoRef}
            aria-label="Camera preview"
            autoPlay
            className="h-full w-full object-contain"
            muted
            playsInline
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              const nextAspectRatio =
                video.videoWidth > 0 && video.videoHeight > 0
                  ? video.videoWidth / video.videoHeight
                  : null;
              setFrameAspectRatio(nextAspectRatio);
              addDebugEvent("camera-preview-metadata", "capture", {
                videoWidth: video.videoWidth,
                videoHeight: video.videoHeight,
                clientWidth: video.clientWidth,
                clientHeight: video.clientHeight,
                aspectRatio: nextAspectRatio,
              });
            }}
          />
        </div>
      ) : (
        <div className="h-full w-full bg-[linear-gradient(135deg,rgba(73,205,151,0.18),rgba(237,111,74,0.14)),linear-gradient(180deg,#151513,#070706)]" />
      )}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.42),transparent_28%,transparent_58%,rgba(0,0,0,0.72))]" />
    </div>
  );
}
