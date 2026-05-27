"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppError } from "@/features/errors/app-error";
import { addDebugEvent } from "@/features/errors/debug-store";
import { reportError } from "@/features/errors/report-error";
import { exportProfile } from "@/features/video/export-profile";
import { getCameraPermissionState, type CameraPermissionState } from "./permissions";

export type CameraFacingMode = "environment" | "user";

function oppositeFacingMode(facingMode: CameraFacingMode): CameraFacingMode {
  return facingMode === "environment" ? "user" : "environment";
}

export function useCamera() {
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [permission, setPermission] = useState<CameraPermissionState>("prompt");
  const [error, setError] = useState<AppError | null>(null);
  const [facingMode, setFacingMode] = useState<CameraFacingMode>("environment");
  const [switching, setSwitching] = useState(false);

  const stopStream = useCallback((streamToStop: MediaStream | null) => {
    streamToStop?.getTracks().forEach((track) => track.stop());
  }, []);

  const stop = useCallback(() => {
    stopStream(streamRef.current);
    streamRef.current = null;
    setStream(null);
    addDebugEvent("camera-stopped", "capture");
  }, [stopStream]);

  const startWithFacingMode = useCallback(async (nextFacingMode: CameraFacingMode) => {
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
          facingMode: nextFacingMode,
          width: { ideal: exportProfile.width },
          height: { ideal: exportProfile.height },
          aspectRatio: { ideal: exportProfile.aspectRatio },
          frameRate: { ideal: exportProfile.fps, max: exportProfile.fps },
        },
        audio: true,
      });
      const videoTrack = nextStream.getVideoTracks()[0];
      const settings = videoTrack?.getSettings();
      const previousStream = streamRef.current;
      streamRef.current = nextStream;
      setStream(nextStream);
      setFacingMode(nextFacingMode);
      setPermission("granted");
      stopStream(previousStream);
      addDebugEvent("camera-started", "capture", {
        videoTracks: nextStream.getVideoTracks().length,
        audioTracks: nextStream.getAudioTracks().length,
        videoWidth: settings?.width,
        videoHeight: settings?.height,
        frameRate: settings?.frameRate,
        facingMode: settings?.facingMode,
        requestedFacingMode: nextFacingMode,
        deviceLabel: videoTrack?.label,
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
          context: {
            facingMode: nextFacingMode,
            permissionState: state,
            userAgent: navigator.userAgent,
          },
        }),
      );
      setPermission(denied ? "denied" : "prompt");
      setError(appError);
      throw appError;
    }
  }, [stopStream]);

  const start = useCallback(async () => {
    return startWithFacingMode(facingMode);
  }, [facingMode, startWithFacingMode]);

  const switchCamera = useCallback(async () => {
    const nextFacingMode = oppositeFacingMode(facingMode);

    if (!streamRef.current) {
      setFacingMode(nextFacingMode);
      return null;
    }

    setSwitching(true);
    try {
      return await startWithFacingMode(nextFacingMode);
    } finally {
      setSwitching(false);
    }
  }, [facingMode, startWithFacingMode]);

  useEffect(() => {
    getCameraPermissionState().then(setPermission).catch(reportError);
    return stop;
  }, [stop]);

  return { stream, permission, error, facingMode, switching, start, stop, switchCamera };
}
