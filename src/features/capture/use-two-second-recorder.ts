"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { recorderSettleMs, twoSecondRecordMs } from "@/lib/motion";
import { AppError } from "@/features/errors/app-error";
import { addDebugEvent } from "@/features/errors/debug-store";
import { reportError } from "@/features/errors/report-error";
import { createRecorder } from "./media-recorder";
import { createComposedRecordingStream, type ComposedRecordingStream } from "./recording-composition";

export type RecordingState = "idle" | "recording" | "saving" | "success" | "error";

type ActiveRecordingSession = {
  recorder: MediaRecorder;
  composition: ComposedRecordingStream;
  settled: boolean;
  resolve: (blob: Blob | null) => void;
};

export function useTwoSecondRecorder(stream: MediaStream | null) {
  const [state, setState] = useState<RecordingState>("idle");
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<number | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const resetRef = useRef<number | null>(null);
  const activeSessionRef = useRef<ActiveRecordingSession | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (progressTimerRef.current !== null) window.clearTimeout(progressTimerRef.current);
    if (resetRef.current !== null) window.clearTimeout(resetRef.current);
    timerRef.current = null;
    progressTimerRef.current = null;
    resetRef.current = null;
  }, []);

  const cancel = useCallback(() => {
    const session = activeSessionRef.current;
    if (!session || session.settled) return;

    session.settled = true;
    cleanup();
    activeSessionRef.current = null;

    if (session.recorder.state === "recording") {
      session.recorder.stop();
    }

    session.composition.stop();
    setProgress(0);
    setState("idle");
    addDebugEvent("recording-canceled", "capture");
    session.resolve(null);
  }, [cleanup]);

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

    return new Promise<Blob | null>((resolve, reject) => {
      const chunks: BlobPart[] = [];
      const startedAt = performance.now();
      const stopAfterMs = twoSecondRecordMs + recorderSettleMs;
      let recorder: MediaRecorder;
      let composition: ComposedRecordingStream | null = null;
      let session: ActiveRecordingSession | null = null;

      const fail = (error: unknown) => {
        if (session?.settled) return;
        if (session) {
          session.settled = true;
        }
        cleanup();
        composition?.stop();
        if (activeSessionRef.current === session) {
          activeSessionRef.current = null;
        }
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

      session = {
        recorder,
        composition,
        settled: false,
        resolve,
      };
      activeSessionRef.current = session;

      recorder.onstop = () => {
        if (!session || session.settled) return;
        session.settled = true;
        cleanup();
        composition?.stop();
        activeSessionRef.current = null;
        setState("saving");
        const blob = new Blob(chunks, { type: recorder.mimeType || "video/mp4" });
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

  return { state, progress, record, cancel };
}
