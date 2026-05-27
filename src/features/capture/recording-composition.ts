"use client";

import { addDebugEvent } from "@/features/errors/debug-store";
import { drawCoverFrame } from "@/features/video/cover-frame";
import { exportProfile } from "@/features/video/export-profile";

export type ComposedRecordingStream = {
  stream: MediaStream;
  stop: () => void;
};

export function createComposedRecordingStream(cameraStream: MediaStream): ComposedRecordingStream {
  if (typeof document === "undefined") {
    throw new Error("Canvas recording is only available in the browser");
  }

  const video = document.createElement("video");
  const canvas = document.createElement("canvas");
  canvas.width = exportProfile.width;
  canvas.height = exportProfile.height;

  const canvasStream = canvas.captureStream(exportProfile.fps);
  const composedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...cameraStream.getAudioTracks(),
  ]);
  let animationFrame: number | null = null;
  let stopped = false;

  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.srcObject = cameraStream;

  const drawNextFrame = () => {
    if (stopped) return;

    if (video.videoWidth > 0 && video.videoHeight > 0) {
      drawCoverFrame(video, canvas, video.videoWidth, video.videoHeight);
    }

    animationFrame = window.requestAnimationFrame(drawNextFrame);
  };

  void video.play().catch((cause) => {
    addDebugEvent("recording-composition-play-failed", "capture", {
      message: cause instanceof Error ? cause.message : String(cause),
    });
  });
  animationFrame = window.requestAnimationFrame(drawNextFrame);
  addDebugEvent("recording-composition-started", "capture", {
    width: exportProfile.width,
    height: exportProfile.height,
    fps: exportProfile.fps,
    audioTracks: cameraStream.getAudioTracks().length,
    canvasVideoTracks: canvasStream.getVideoTracks().length,
  });

  return {
    stream: composedStream,
    stop: () => {
      if (stopped) return;
      stopped = true;
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
      canvasStream.getTracks().forEach((track) => track.stop());
      video.pause();
      video.removeAttribute("src");
      video.srcObject = null;
      video.load();
      addDebugEvent("recording-composition-stopped", "capture");
    },
  };
}
