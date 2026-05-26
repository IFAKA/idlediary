"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppError } from "@/features/errors/app-error";
import { addDebugEvent } from "@/features/errors/debug-store";
import { reportError } from "@/features/errors/report-error";
import { getCameraPermissionState, type CameraPermissionState } from "./permissions";

export function useCamera() {
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [permission, setPermission] = useState<CameraPermissionState>("prompt");
  const [error, setError] = useState<AppError | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
    addDebugEvent("camera-stopped", "capture");
  }, []);

  const start = useCallback(async () => {
    setError(null);
    const state = await getCameraPermissionState();
    setPermission(state);
    if (state === "unsupported") {
      const appError = reportError(
        new AppError({
          code: "camera-unavailable",
          area: "capture",
          message: "Media devices API is unavailable",
          userMessage: "Camera capture is not available in this browser.",
          context: { userAgent: navigator.userAgent },
        }),
      );
      setError(appError);
      throw appError;
    }

    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1080 },
          height: { ideal: 1920 },
          aspectRatio: { ideal: 9 / 16 },
        },
        audio: true,
      });
      streamRef.current = nextStream;
      setStream(nextStream);
      setPermission("granted");
      addDebugEvent("camera-started", "capture", {
        videoTracks: nextStream.getVideoTracks().length,
        audioTracks: nextStream.getAudioTracks().length,
      });
      return nextStream;
    } catch (cause) {
      const denied =
        cause instanceof DOMException &&
        (cause.name === "NotAllowedError" || cause.name === "PermissionDeniedError");
      const appError = reportError(
        new AppError({
          code: denied ? "camera-permission-denied" : "camera-unavailable",
          area: "capture",
          message: denied ? "Camera permission denied" : "Could not open camera stream",
          userMessage: denied
            ? "Camera access is blocked. Allow camera and microphone in browser settings, then retry."
            : "The camera could not be opened. Close other camera apps and retry.",
          cause,
          context: { permissionState: state, userAgent: navigator.userAgent },
        }),
      );
      setPermission(denied ? "denied" : "prompt");
      setError(appError);
      throw appError;
    }
  }, []);

  useEffect(() => {
    getCameraPermissionState().then(setPermission).catch(reportError);
    return stop;
  }, [stop]);

  return { stream, permission, error, start, stop };
}
