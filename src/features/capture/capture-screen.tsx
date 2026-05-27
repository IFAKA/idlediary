"use client";

import Link from "next/link";
import { Film, RotateCcw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useClips } from "@/features/clips/use-clips";
import { getObjectUrlForClip, releaseAllVlogObjectUrls } from "@/features/clips/media-cache";
import { DebugDrawer } from "@/features/errors/debug-drawer";
import { reportError } from "@/features/errors/report-error";
import { generateVlog, type GenerationProgress } from "@/features/generation/generation";
import {
  clearGeneratedVlogForSession,
  getLatestVlogForSession,
  getVlog,
  saveVlog,
} from "@/features/clips/storage";
import type { ClipRecord, VlogRecord } from "@/features/clips/types";
import { CameraPreview } from "./camera-preview";
import { ClipReviewPanel } from "./clip-review-panel";
import { GenerationPanel } from "./generation-panel";
import { RecordButton } from "./record-button";
import { ResultPanel } from "./result-panel";
import { useCamera } from "./use-camera";
import { useTwoSecondRecorder } from "./use-two-second-recorder";

type ScreenMode = "capture" | "review" | "generating" | "result";
type DurableView = Exclude<ScreenMode, "generating">;

const waitForPaint = () => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

function requestedViewFromUrl(): DurableView {
  if (typeof window === "undefined") return "capture";

  if (window.location.pathname === "/draft") return "review";
  if (window.location.pathname === "/result") return "result";
  if (window.location.pathname === "/") return "capture";
  return "capture";
}

function requestedVlogIdFromUrl() {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("vlog");
}

function writeViewToUrl(view: DurableView, action: "push" | "replace") {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  const nextPath = view === "capture" ? "/" : view === "review" ? "/draft" : "/result";
  url.pathname = nextPath;
  if (view !== "result") {
    url.searchParams.delete("vlog");
  }

  const search = url.searchParams.toString();
  const next = `${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current) return;

  if (action === "replace") {
    window.history.replaceState({}, "", next);
    return;
  }

  window.history.pushState({}, "", next);
}

function titleForMode(mode: ScreenMode) {
  if (mode === "review" || mode === "generating") return "Review Draft Clips | IdleDiary";
  if (mode === "result") return "Generated Video | IdleDiary";
  return "IdleDiary";
}

export function CaptureScreen() {
  const camera = useCamera();
  const clips = useClips();
  const recorder = useTwoSecondRecorder(camera.stream);
  const [mode, setMode] = useState<ScreenMode>("capture");
  const [initialViewReady, setInitialViewReady] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [vlog, setVlog] = useState<VlogRecord | null>(null);
  const initialViewResolved = useRef(false);
  const cameraStartAttempted = useRef(false);
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress>({
    step: "idle",
    value: 0,
  });

  const needsPermission = !camera.stream;
  const canReview =
    mode === "capture" &&
    !isFinishing &&
    !clips.loading &&
    clips.clips.length > 0 &&
    recorder.state !== "recording" &&
    recorder.state !== "saving";
  const clipLimitReached = clips.clips.length >= 20;
  const latestClip = clips.clips.length > 0 ? clips.clips[clips.clips.length - 1] : null;

  const startCamera = useCallback(async () => {
    try {
      setIsStartingCamera(true);
      await camera.start();
    } catch (error) {
      const appError = reportError(error);
      toast.error(appError.userMessage);
    } finally {
      setIsStartingCamera(false);
    }
  }, [camera]);

  const restoreRequestedView = useCallback(
    async (requestedView = requestedViewFromUrl()) => {
      if (clips.loading || !clips.session) return;

      if (requestedView === "review") {
        setVlog(null);
        if (clips.clips.length > 0) {
          setMode("review");
          return;
        }

        setMode("capture");
        writeViewToUrl("capture", "replace");
        return;
      }

      if (requestedView === "result") {
        try {
          const requestedVlogId = requestedVlogIdFromUrl();
          const savedVlog = requestedVlogId
            ? await getVlog(requestedVlogId)
            : await getLatestVlogForSession(clips.session.id);
          if (savedVlog) {
            setVlog(savedVlog);
            setMode("result");
            return;
          }
        } catch (error) {
          const appError = reportError(error);
          toast.error(appError.userMessage);
        }

        setVlog(null);
        if (clips.clips.length > 0) {
          setMode("review");
          writeViewToUrl("review", "replace");
          return;
        }

        setMode("capture");
        writeViewToUrl("capture", "replace");
        return;
      }

      setVlog(null);
      setMode("capture");
      if (window.location.pathname !== "/") {
        writeViewToUrl("capture", "replace");
      }
    },
    [clips.clips.length, clips.loading, clips.session],
  );

  useEffect(() => {
    document.title = titleForMode(mode);
  }, [mode]);

  useEffect(() => {
    if (!initialViewReady || mode !== "capture" || camera.stream || cameraStartAttempted.current) return;
    cameraStartAttempted.current = true;
    void startCamera();
  }, [camera.stream, initialViewReady, mode, startCamera]);

  useEffect(() => {
    if (mode === "capture") return;

    cameraStartAttempted.current = false;
    if (camera.stream) {
      camera.stop();
    }
  }, [camera, mode]);

  useEffect(() => {
    if (initialViewResolved.current || clips.loading || !clips.session) return;
    initialViewResolved.current = true;
    void restoreRequestedView().finally(() => setInitialViewReady(true));
  }, [clips.loading, clips.session, restoreRequestedView]);

  useEffect(() => {
    const onPopState = () => {
      void restoreRequestedView();
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [restoreRequestedView]);

  const showCapture = useCallback((action: "push" | "replace" = "push") => {
    setVlog(null);
    setMode("capture");
    writeViewToUrl("capture", action);
  }, []);

  const showReview = useCallback((action: "push" | "replace" = "push") => {
    setVlog(null);
    setMode("review");
    writeViewToUrl("review", action);
  }, []);

  const showResult = useCallback((nextVlog: VlogRecord, action: "push" | "replace" = "replace") => {
    setVlog(nextVlog);
    setMode("result");
    writeViewToUrl("result", action);
  }, []);

  const clearDraft = async () => {
    await clips.clearClips();
  };

  const startNewRecording = async () => {
    try {
      await clearDraft();
      if (clips.session) {
        await clearGeneratedVlogForSession(clips.session.id);
      }
      releaseAllVlogObjectUrls();
      setVlog(null);
      showCapture("push");
    } catch (error) {
      const appError = reportError(error);
      toast.error(appError.userMessage);
      setVlog(null);
      showCapture("push");
    }
  };

  const captureClip = async () => {
    if (clipLimitReached) {
      toast("Session limit reached for v1.");
      return;
    }

    try {
      const blob = await recorder.record();
      await clips.addClip(blob, 2000);
      toast.success("Saved");
    } catch (error) {
      const appError = reportError(error);
      toast.error(appError.userMessage);
    }
  };

  const openReview = () => {
    if (!canReview) return;
    showReview("push");
  };

  const finish = async (reviewClips?: ClipRecord[]) => {
    const selectedClips = (reviewClips ?? clips.clips).slice(0, 20);

    if (!clips.session || clips.loading || selectedClips.length === 0) {
      toast.error("Record at least one clip first.");
      return;
    }

    try {
      setIsFinishing(true);
      setGenerationProgress({ step: "idle", value: 0 });
      setMode("generating");
      await waitForPaint();
      camera.stop();
      await waitForPaint();
      const nextVlog = await generateVlog(selectedClips, clips.session.id, setGenerationProgress);
      await saveVlog(nextVlog);
      showResult(nextVlog, "replace");
    } catch (error) {
      const appError = reportError(error);
      setGenerationProgress({ step: "error", value: 0 });
      showReview("replace");
      toast.error(appError.userMessage);
    } finally {
      setIsFinishing(false);
    }
  };

  return (
    <main className="relative isolate h-[100svh] overflow-hidden bg-background">
      <AnimatePresence initial={false}>
        <motion.div
          key={mode === "capture" && camera.stream ? "camera-preview" : "processing-backdrop"}
          className="absolute inset-0"
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: mode === "capture" ? 1.015 : 1 }}
          initial={{ opacity: 0, scale: 1.01 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
        >
          <CameraPreview stream={mode === "capture" ? camera.stream : null} />
        </motion.div>
      </AnimatePresence>
      <AnimatePresence mode="wait">
        {mode === "generating" ? (
          <motion.div
            key="generating"
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            initial={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
          >
            <GenerationPanel progress={generationProgress} />
          </motion.div>
        ) : mode === "result" && vlog ? (
          <motion.div
            key="result"
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            initial={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
          >
            <ResultPanel
              vlog={vlog}
              onReset={() => void startNewRecording()}
            />
          </motion.div>
        ) : mode === "review" ? (
          <motion.div
            key="review"
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            initial={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
          >
            <ClipReviewPanel
              clips={clips.clips}
              isFinishing={isFinishing}
              onBack={() => showCapture("push")}
              onClearDraft={async () => {
                try {
                  await clearDraft();
                  if (clips.session) {
                    await clearGeneratedVlogForSession(clips.session.id);
                  }
                  releaseAllVlogObjectUrls();
                  toast("Draft cleared");
                  return true;
                } catch (error) {
                  const appError = reportError(error);
                  toast.error(appError.userMessage);
                  return false;
                }
              }}
              onDeleteClip={async (id) => {
                try {
                  await clips.removeClip(id);
                  toast("Clip deleted");
                  return true;
                } catch (error) {
                  const appError = reportError(error);
                  toast.error(appError.userMessage);
                  return false;
                }
              }}
              onMakeVideo={finish}
              onReorderClips={async (clipIds) => {
                try {
                  await clips.reorderClips(clipIds);
                  return true;
                } catch (error) {
                  const appError = reportError(error);
                  toast.error(appError.userMessage);
                  return false;
                }
              }}
            />
          </motion.div>
        ) : (
          <motion.div
            key="capture"
            className="relative z-10 flex h-[100svh] flex-col safe-screen"
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -10 }}
            initial={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <header className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  Today
                </p>
                <h1 className="mt-1 text-2xl font-semibold">No pressure</h1>
              </div>
              <div className="px-1 py-1 text-right">
                <p className="text-xl font-semibold">{clips.clips.length}</p>
                <p className="text-xs text-muted-foreground">clips</p>
              </div>
            </header>

            <div className="mt-auto">
              <div className="mb-5 flex items-center justify-between gap-3">
                <Link
                  aria-label="Videos"
                  className="inline-flex size-14 shrink-0 items-center justify-center rounded-lg border bg-black/45 text-foreground outline-none transition hover:bg-black/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  href="/videos"
                >
                  <Film className="size-5 text-primary" />
                </Link>

                <RecordButton
                  disabled={
                    needsPermission ||
                    isStartingCamera ||
                    recorder.state === "recording" ||
                    recorder.state === "saving" ||
                    clipLimitReached
                  }
                  progress={recorder.progress}
                  state={recorder.state}
                  onClick={captureClip}
                />

                <LatestDraftButton
                  clip={latestClip}
                  clipCount={clips.clips.length}
                  disabled={!canReview}
                  onOpen={openReview}
                />
              </div>

              {needsPermission ? (
                <div className="mb-3 rounded-lg border bg-black/50 p-3">
                  <p className="text-sm font-semibold">
                    {camera.error ? "Camera is blocked" : "Starting camera..."}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {camera.error?.userMessage ?? "Allow camera access to begin recording clips."}
                  </p>
                  {camera.error ? (
                    <button
                      className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                      type="button"
                      onClick={() => {
                        cameraStartAttempted.current = false;
                        void startCamera();
                      }}
                    >
                      <RotateCcw className="size-4" />
                      Retry camera
                    </button>
                  ) : null}
                </div>
              ) : null}

              {clipLimitReached ? (
                <p className="mb-3 rounded-lg border bg-black/50 p-3 text-sm font-semibold">
                  Session limit reached for v1.
                </p>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <DebugDrawer />
    </main>
  );
}

function LatestDraftButton({
  clip,
  clipCount,
  disabled,
  onOpen,
}: {
  clip: ClipRecord | null;
  clipCount: number;
  disabled: boolean;
  onOpen: () => void;
}) {
  const src = useMemo(() => (clip ? getObjectUrlForClip(clip) : null), [clip]);

  return (
    <button
      aria-disabled={disabled}
      aria-label="Review draft clips"
      className="relative inline-flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-black/45 text-foreground outline-none transition hover:bg-black/60 disabled:pointer-events-none disabled:cursor-default disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      data-disabled={disabled}
      disabled={disabled}
      type="button"
      onClick={onOpen}
    >
      {clip && src ? (
        <>
          <video
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
            muted
            playsInline
            preload="metadata"
            src={src}
          />
          <span aria-hidden="true" className="absolute inset-0 bg-black/18" />
          <span className="absolute right-1 top-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
            +{clipCount}
          </span>
        </>
      ) : (
        <Film className="size-5 text-muted-foreground" />
      )}
    </button>
  );
}
