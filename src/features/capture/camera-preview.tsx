"use client";

import { useEffect, useRef } from "react";

type CameraPreviewProps = {
  stream: MediaStream | null;
};

export function CameraPreview({ stream }: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="absolute inset-0 bg-black">
      {stream ? (
        <video
          ref={videoRef}
          aria-label="Camera preview"
          autoPlay
          className="h-full w-full object-cover"
          muted
          playsInline
        />
      ) : (
        <div className="h-full w-full bg-[linear-gradient(135deg,rgba(73,205,151,0.18),rgba(237,111,74,0.14)),linear-gradient(180deg,#151513,#070706)]" />
      )}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.42),transparent_28%,transparent_58%,rgba(0,0,0,0.72))]" />
    </div>
  );
}
