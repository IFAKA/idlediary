"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { recorderSettleMs, twoSecondRecordMs } from "@/lib/motion";
import { AppError } from "@/features/errors/app-error";
import { addDebugEvent } from "@/features/errors/debug-store";
import { reportError } from "@/features/errors/report-error";
import { createRecorder } from "./media-recorder";
import { createComposedRecordingStream, type ComposedRecordingStream } from "./recording-composition";

export type RecordingState = "idle" | "recording" | "saving" | "success" | "error";

export function useTwoSecondRecorder(stream: MediaStream | null) {
  const [state, setState] = useState<RecordingState>("idle");
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<number | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const resetRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (progressTimerRef.current) window.clearTimeout(progressTimerRef.current);
    if (resetRef.current) window.clearTimeout(resetRef.current);
    timerRef.current = null;
    progressTimerRef.current = null;
    resetRef.current = null;
  }, []);

  const record = useCallback(async () => {
    if (!stream) {
      throw reportError(
        new AppError({
          code: "camera-unavailable",
          area: "capture",
          message: "No media stream available before recording",
          userMessage: "Start the camera before recording.",
        }),
      );
    }

    cleanup();
    setState("recording");
    setProgress(0);
    addDebugEvent("recording-started", "capture");

    return new Promise<Blob>((resolve, reject) => {
      const chunks: BlobPart[] = [];
      const startedAt = performance.now();
      const stopAfterMs = twoSecondRecordMs + recorderSettleMs;
      let recorder: MediaRecorder;
      let composition: ComposedRecordingStream | null = null;
      let settled = false;

      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        composition?.stop();
        setState("error");
        reject(reportError(error));
      };

      try {
        composition = createComposedRecordingStream(stream);
        recorder = createRecorder(composition.stream);
      } catch (error) {
        fail(error);
        return;
      }

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onerror = (event) => {
        fail(
          new AppError({
            code: "recording-failed",
            area: "capture",
            message: "MediaRecorder emitted an error",
            userMessage: "Recording failed. Try one more take.",
            cause: event,
            context: { recorderState: recorder.state },
          }),
        );
      };

      recorder.onstop = () => {
        if (settled) return;
        settled = true;
        cleanup();
        composition?.stop();
        setState("saving");
        const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
        addDebugEvent("recording-stopped", "capture", {
          size: blob.size,
          mimeType: blob.type,
          elapsedMs: Math.round(performance.now() - startedAt),
        });
        setProgress(100);
        setState("success");
        resetRef.current = window.setTimeout(() => {
          setProgress(0);
          setState("idle");
          resetRef.current = null;
        }, 650);
        resolve(blob);
      };

      try {
        recorder.start();
        progressTimerRef.current = window.setTimeout(() => {
          setProgress(100);
          progressTimerRef.current = null;
        }, twoSecondRecordMs);
        timerRef.current = window.setTimeout(() => {
          if (recorder.state === "recording") {
            recorder.requestData();
            recorder.stop();
          }
        }, stopAfterMs);
      } catch (cause) {
        fail(
          new AppError({
            code: "recording-failed",
            area: "capture",
            message: "Could not start MediaRecorder",
            userMessage: "Recording could not start. Try refreshing the app.",
            cause,
          }),
        );
      }
    });
  }, [cleanup, stream]);

  useEffect(() => cleanup, [cleanup]);

  return { state, progress, record };
}
