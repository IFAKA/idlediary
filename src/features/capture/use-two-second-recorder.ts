"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { maxRecordDurationMs, minRecordDurationMs } from "@/lib/motion";
import { AppError } from "@/features/errors/app-error";
import { addDebugEvent } from "@/features/errors/debug-store";
import { reportError } from "@/features/errors/report-error";
import { createRecorder } from "./media-recorder";
import { createComposedRecordingStream, type ComposedRecordingStream } from "./recording-composition";

export type RecordingState = "idle" | "recording" | "saving" | "success" | "error";

type ActiveRecordingSession = {
  recorder: MediaRecorder;
  composition: ComposedRecordingStream;
  chunks: BlobPart[];
  startedAt: number;
  settled: boolean;
  resolve: (clip: RecordingResult | null) => void;
  reject: (error: unknown) => void;
};

export type RecordingResult = {
  blob: Blob;
  durationMs: number;
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
    if (progressTimerRef.current !== null) window.clearInterval(progressTimerRef.current);
    if (resetRef.current !== null) window.clearTimeout(resetRef.current);
    timerRef.current = null;
    progressTimerRef.current = null;
    resetRef.current = null;
  }, []);

  const stop = useCallback(() => {
    const session = activeSessionRef.current;
    if (!session || session.settled) return;

    if (session.recorder.state === "recording") {
      session.recorder.requestData();
      session.recorder.stop();
    }
  }, []);

  const start = useCallback(() => {
    if (activeSessionRef.current) {
      return null;
    }
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

    return new Promise<RecordingResult | null>((resolve, reject) => {
      const chunks: BlobPart[] = [];
      const startedAt = performance.now();
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
        chunks,
        startedAt,
        settled: false,
        resolve,
        reject,
      };
      activeSessionRef.current = session;

      recorder.onstop = () => {
        if (!session || session.settled) return;
        session.settled = true;
        cleanup();
        composition?.stop();
        activeSessionRef.current = null;
        const durationMs = Math.round(performance.now() - startedAt);
        const isValidClip = durationMs >= minRecordDurationMs;
        const blob = new Blob(chunks, { type: recorder.mimeType || "video/mp4" });
        addDebugEvent("recording-stopped", "capture", {
          size: blob.size,
          mimeType: blob.type,
          elapsedMs: durationMs,
          saved: isValidClip,
        });

        if (!isValidClip) {
          setProgress(0);
          setState("idle");
          resolve(null);
          return;
        }

        setState("saving");
        setProgress(100);
        setState("success");
        resetRef.current = window.setTimeout(() => {
          setProgress(0);
          setState("idle");
          resetRef.current = null;
        }, 650);
        resolve({ blob, durationMs });
      };

      try {
        recorder.start();
        progressTimerRef.current = window.setInterval(() => {
          setProgress(Math.min(100, ((performance.now() - startedAt) / maxRecordDurationMs) * 100));
        }, 50);
        timerRef.current = window.setTimeout(() => {
          if (recorder.state === "recording") {
            recorder.requestData();
            recorder.stop();
          }
        }, maxRecordDurationMs);
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

  useEffect(
    () => () => {
      const session = activeSessionRef.current;
      cleanup();
      if (!session || session.settled) return;
      session.settled = true;
      if (session.recorder.state === "recording") {
        session.recorder.stop();
      }
      session.composition.stop();
      session.resolve(null);
      activeSessionRef.current = null;
    },
    [cleanup],
  );

  return { state, progress, start, stop };
}
