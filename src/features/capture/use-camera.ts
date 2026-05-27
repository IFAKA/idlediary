"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppError } from "@/features/errors/app-error";
import { addDebugEvent } from "@/features/errors/debug-store";
import { reportError } from "@/features/errors/report-error";
import { exportProfile } from "@/features/video/export-profile";
import { getCameraPermissionState, type CameraPermissionState } from "./permissions";

export type CameraFacingMode = "environment" | "user";

type VideoInputDevice = {
  deviceId: string;
  groupId: string;
  label: string;
};

function oppositeFacingMode(facingMode: CameraFacingMode): CameraFacingMode {
  return facingMode === "environment" ? "user" : "environment";
}

function videoConstraintsForFacingMode(facingMode: CameraFacingMode): MediaTrackConstraints {
  return {
    facingMode: { ideal: facingMode },
    width: { ideal: exportProfile.width },
    height: { ideal: exportProfile.height },
    aspectRatio: { ideal: exportProfile.aspectRatio },
    frameRate: { ideal: exportProfile.fps, max: exportProfile.fps },
  };
}

function videoConstraintsForDevice(deviceId: string): MediaTrackConstraints {
  return {
    deviceId: { exact: deviceId },
    width: { ideal: exportProfile.width },
    height: { ideal: exportProfile.height },
    aspectRatio: { ideal: exportProfile.aspectRatio },
    frameRate: { ideal: exportProfile.fps, max: exportProfile.fps },
  };
}

function facingModeFromLabel(label: string): CameraFacingMode | null {
  const normalizedLabel = label.toLowerCase();
  if (/\b(front|face|selfie|user)\b/.test(normalizedLabel)) return "user";
  if (/\b(back|rear|environment|world)\b/.test(normalizedLabel)) return "environment";
  return null;
}

function bestDeviceForFacingMode(
  devices: VideoInputDevice[],
  facingMode: CameraFacingMode,
): VideoInputDevice | null {
  return devices.find((device) => facingModeFromLabel(device.label) === facingMode) ?? null;
}

async function listVideoInputDevices(): Promise<VideoInputDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];

  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === "videoinput" && device.deviceId)
    .map((device) => ({
      deviceId: device.deviceId,
      groupId: device.groupId,
      label: device.label,
    }));
}

export function useCamera() {
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [permission, setPermission] = useState<CameraPermissionState>("prompt");
  const [error, setError] = useState<AppError | null>(null);
  const [facingMode, setFacingMode] = useState<CameraFacingMode>("environment");
  const [videoInputs, setVideoInputs] = useState<VideoInputDevice[]>([]);
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

  const refreshVideoInputs = useCallback(async () => {
    try {
      const nextVideoInputs = await listVideoInputDevices();
      setVideoInputs(nextVideoInputs);
      addDebugEvent("camera-devices-refreshed", "capture", {
        videoInputs: nextVideoInputs.map((device) => ({
          hasDeviceId: Boolean(device.deviceId),
          groupId: device.groupId,
          label: device.label,
        })),
      });
      return nextVideoInputs;
    } catch (cause) {
      reportError(cause);
      setVideoInputs([]);
      return [];
    }
  }, []);

  const startWithVideoConstraints = useCallback(async ({
    errorFacingMode,
    setErrorOnFailure = true,
    video,
  }: {
    errorFacingMode: CameraFacingMode;
    setErrorOnFailure?: boolean;
    video: MediaTrackConstraints;
  }) => {
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
        video,
        audio: true,
      });
      const videoTrack = nextStream.getVideoTracks()[0];
      const settings = videoTrack?.getSettings();
      const previousStream = streamRef.current;
      streamRef.current = nextStream;
      setStream(nextStream);
      setFacingMode(
        settings?.facingMode === "user" || settings?.facingMode === "environment"
          ? settings.facingMode
          : errorFacingMode,
      );
      setPermission("granted");
      stopStream(previousStream);
      void refreshVideoInputs();
      addDebugEvent("camera-started", "capture", {
        videoTracks: nextStream.getVideoTracks().length,
        audioTracks: nextStream.getAudioTracks().length,
        videoWidth: settings?.width,
        videoHeight: settings?.height,
        frameRate: settings?.frameRate,
        facingMode: settings?.facingMode,
        requestedFacingMode: errorFacingMode,
        deviceLabel: videoTrack?.label,
      });
      return nextStream;
    } catch (cause) {
      const denied =
        cause instanceof DOMException &&
        (cause.name === "NotAllowedError" || cause.name === "PermissionDeniedError");
      const appError = new AppError({
        code: denied ? "camera-permission-denied" : "camera-unavailable",
        area: "capture",
        message: denied ? "Camera permission denied" : "Could not open camera stream",
        userMessage: denied
          ? "Camera access is blocked. Allow camera and microphone in browser settings, then retry."
          : "The camera could not be opened. Close other camera apps and retry.",
        cause,
        context: {
          facingMode: errorFacingMode,
          permissionState: state,
          userAgent: navigator.userAgent,
        },
      });
      if (setErrorOnFailure) {
        reportError(appError);
        setPermission(denied ? "denied" : "prompt");
        setError(appError);
      }
      throw appError;
    }
  }, [refreshVideoInputs, stopStream]);

  const startWithFacingMode = useCallback(async (
    nextFacingMode: CameraFacingMode,
    options: { setErrorOnFailure?: boolean } = {},
  ) => {
    return startWithVideoConstraints({
      errorFacingMode: nextFacingMode,
      setErrorOnFailure: options.setErrorOnFailure,
      video: videoConstraintsForFacingMode(nextFacingMode),
    });
  }, [startWithVideoConstraints]);

  const start = useCallback(async () => {
    return startWithFacingMode(facingMode);
  }, [facingMode, startWithFacingMode]);

  const switchCamera = useCallback(async () => {
    const nextFacingMode = oppositeFacingMode(facingMode);
    const previousFacingMode = facingMode;
    const previousStream = streamRef.current;

    if (!previousStream) {
      setFacingMode(nextFacingMode);
      return null;
    }

    setSwitching(true);
    stopStream(previousStream);
    streamRef.current = null;
    setStream(null);

    try {
      const nextVideoInputs = videoInputs.length > 0 ? videoInputs : await refreshVideoInputs();
      const nextDevice = bestDeviceForFacingMode(nextVideoInputs, nextFacingMode);

      if (nextDevice) {
        try {
          return await startWithVideoConstraints({
            errorFacingMode: nextFacingMode,
            setErrorOnFailure: false,
            video: videoConstraintsForDevice(nextDevice.deviceId),
          });
        } catch (error) {
          addDebugEvent("camera-switch-device-failed", "capture", {
            facingMode: nextFacingMode,
            deviceLabel: nextDevice.label,
            errorName: error instanceof Error ? error.name : "unknown",
          });
        }
      }

      return await startWithFacingMode(nextFacingMode, { setErrorOnFailure: false });
    } catch (error) {
      try {
        return await startWithFacingMode(previousFacingMode, { setErrorOnFailure: false });
      } catch {
        throw error;
      }
    } finally {
      setSwitching(false);
    }
  }, [
    facingMode,
    refreshVideoInputs,
    startWithFacingMode,
    startWithVideoConstraints,
    stopStream,
    videoInputs,
  ]);

  useEffect(() => {
    getCameraPermissionState().then(setPermission).catch(reportError);
    return stop;
  }, [stop]);

  return {
    stream,
    permission,
    error,
    facingMode,
    hasMultipleCameras: videoInputs.length > 1,
    switching,
    start,
    stop,
    switchCamera,
  };
}
