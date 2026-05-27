"use client";

import Link from "next/link";
import { ArrowLeft, Clapperboard, Layers2, RotateCcw } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppHeader, type AppHeaderConfig } from "@/components/app-header-shell";
import { Button } from "@/components/ui/button";
import { useClips } from "@/features/clips/use-clips";
import {
  getObjectUrlForClip,
  getThumbnailObjectUrlForClip,
  releaseAllVlogObjectUrls,
} from "@/features/clips/media-cache";
import { DebugDrawer } from "@/features/errors/debug-drawer";
import { reportError } from "@/features/errors/report-error";
import {
  generateVlog,
  generationProgress as makeGenerationProgress,
  type GenerationProgress,
} from "@/features/generation/generation";
import {
  clearGeneratedVlogForSession,
  hasNeedsActionVlog as checkHasNeedsActionVlog,
  markNeedsActionVlogsHandled,
  markVlogHandled,
  saveVlogAndClearSessionDraft,
} from "@/features/clips/storage";
import { generateVideoThumbnail, thumbnailSizes } from "@/features/clips/thumbnail";
import type { ClipRecord, VlogRecord } from "@/features/clips/types";
import { shareVlog } from "@/features/share/share";
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
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const routeSlideTransition = { duration: 0.24, ease: "easeOut" } as const;
const draftBadgeTransition = { type: "spring", stiffness: 520, damping: 32, bounce: 0.12 } as const;
const draftDigitTransition = { duration: 0.18, ease: "easeOut" } as const;
const minimumProgressMilestoneMs = 380;

function progressMilestone(progress: GenerationProgress) {
  if (progress.step === "rendering") return `${progress.step}:${progress.label}`;
  return progress.step;
}

function createProgressDisplayBuffer(
  onProgress: (progress: GenerationProgress) => void,
  now = () => performance.now(),
) {
  let queue = Promise.resolve();
  let currentMilestone: string | null = null;
  let lastMilestoneShownAt = 0;
  let isCancelled = false;

  return {
    cancel: () => {
      isCancelled = true;
    },
    flush: () => queue,
    push: (progress: GenerationProgress) => {
      queue = queue.then(async () => {
        if (isCancelled) return;

        const nextMilestone = progressMilestone(progress);
        if (nextMilestone !== currentMilestone) {
          const elapsed = now() - lastMilestoneShownAt;
          const delay =
            lastMilestoneShownAt === 0
              ? 0
              : Math.max(0, minimumProgressMilestoneMs - elapsed);
          if (delay > 0) {
            await wait(delay);
          }
          currentMilestone = nextMilestone;
          lastMilestoneShownAt = now();
        }

        if (isCancelled) return;
        onProgress(progress);
      });
    },
  };
}

function requestedViewFromUrl(): DurableView {
  if (typeof window === "undefined") return "capture";

  if (window.location.pathname === "/draft") return "review";
  if (window.location.pathname === "/result") return "result";
  if (window.location.pathname === "/") return "capture";
  return "capture";
}

function writeViewToUrl(view: DurableView, action: "push" | "replace") {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  const nextPath = view === "capture" ? "/" : view === "review" ? "/draft" : "/result";
  url.pathname = nextPath;
  url.searchParams.delete("vlog");

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
  const [isFinishing, setIsFinishing] = useState(false);
  const [vlog, setVlog] = useState<VlogRecord | null>(null);
  const [slideDirection, setSlideDirection] = useState<"left" | "right">("right");
  const [resultExitDirection, setResultExitDirection] = useState<"up" | "bottom">("up");
  const [hasNeedsActionVlog, setHasNeedsActionVlog] = useState(false);
  const initialViewResolved = useRef(false);
  const cameraStartAttempted = useRef(false);
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress>({
    ...makeGenerationProgress("idle", 0),
  });

  const needsPermission = !camera.stream;
  const canOpenDraft =
    mode === "capture" &&
    !isFinishing &&
    !clips.loading &&
    recorder.state !== "recording" &&
    recorder.state !== "saving";
  const clipLimitReached = clips.clips.length >= 20;
  const latestClip = clips.clips.length > 0 ? clips.clips[clips.clips.length - 1] : null;

  const startCamera = useCallback(async () => {
    try {
      await camera.start();
    } catch (error) {
      reportError(error);
    }
  }, [camera]);

  const refreshNeedsActionBadge = useCallback(async () => {
    try {
      setHasNeedsActionVlog(await checkHasNeedsActionVlog());
    } catch (error) {
      reportError(error);
    }
  }, []);

  const handleVideosEntry = useCallback(() => {
    setSlideDirection("left");
    setHasNeedsActionVlog(false);
    void markNeedsActionVlogsHandled().catch((error) => {
      reportError(error);
      void refreshNeedsActionBadge();
    });
  }, [refreshNeedsActionBadge]);

  const restoreRequestedView = useCallback(
    async (requestedView = requestedViewFromUrl()) => {
      if (clips.loading || !clips.session) return;

      if (requestedView === "review") {
        setVlog(null);
        setMode("review");
        return;
      }

      if (requestedView === "result") {
        setVlog(null);
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
    [clips.loading, clips.session],
  );

  useEffect(() => {
    document.title = titleForMode(mode);
  }, [mode]);

  useEffect(() => {
    if (
      !initialViewReady ||
      mode !== "capture" ||
      camera.stream ||
      cameraStartAttempted.current
    ) return;
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
    if (!initialViewReady || mode !== "capture") return;
    let mounted = true;

    checkHasNeedsActionVlog()
      .then((hasNeedsAction) => {
        if (mounted) {
          setHasNeedsActionVlog(hasNeedsAction);
        }
      })
      .catch((error) => {
        reportError(error);
      });

    return () => {
      mounted = false;
    };
  }, [initialViewReady, mode]);

  useEffect(() => {
    const onPopState = () => {
      if (mode === "result" && vlog && window.location.pathname === "/result") {
        return;
      }
      void restoreRequestedView();
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [mode, restoreRequestedView, vlog]);

  const showCapture = useCallback((action: "push" | "replace" = "push") => {
    setSlideDirection("right");
    setVlog(null);
    setMode("capture");
    writeViewToUrl("capture", action);
  }, []);

  const showReview = useCallback((action: "push" | "replace" = "push") => {
    setSlideDirection("right");
    setResultExitDirection("up");
    setVlog(null);
    setMode("review");
    writeViewToUrl("review", action);
  }, []);

  const showResult = useCallback((nextVlog: VlogRecord, action: "push" | "replace" = "replace") => {
    setResultExitDirection("up");
    setVlog(nextVlog);
    setMode("result");
    writeViewToUrl("result", action);
  }, []);

  const clearDraft = async () => {
    await clips.clearClips();
  };

  const handleResultExport = async () => {
    if (!vlog) return;

    try {
      await markVlogHandled(vlog.id);
      setVlog({ ...vlog, needsAction: false });
      await refreshNeedsActionBadge();
      await shareVlog(vlog);
    } catch (error) {
      reportError(error);
    }
  };

  const handleResultDone = async () => {
    if (!vlog) return;

    try {
      await markVlogHandled(vlog.id);
      await refreshNeedsActionBadge();
    } catch (error) {
      reportError(error);
    } finally {
      setResultExitDirection("up");
      setVlog(null);
      showCapture("push");
    }
  };

  const captureClip = async () => {
    if (clipLimitReached) {
      return;
    }

    try {
      const blob = await recorder.record();
      if (blob !== null) {
        await clips.addClip(blob, 3000);
      }
    } catch (error) {
      reportError(error);
    }
  };

  const handleRecordButtonClick = () => {
    if (recorder.state === "recording") {
      recorder.cancel();
      return;
    }

    void captureClip();
  };

  const openReview = () => {
    if (!canOpenDraft) return;
    showReview("push");
  };

  const finish = async (reviewClips?: ClipRecord[]) => {
    const selectedClips = (reviewClips ?? clips.clips).slice(0, 20);

    if (!clips.session || clips.loading || selectedClips.length === 0) {
      return;
    }

    const progressDisplay = createProgressDisplayBuffer(setGenerationProgress);

    try {
      setIsFinishing(true);
      setGenerationProgress(makeGenerationProgress("idle", 0));
      setMode("generating");
      await waitForPaint();
      camera.stop();
      await waitForPaint();
      const nextVlog = await generateVlog(selectedClips, clips.session.id, progressDisplay.push);
      await progressDisplay.flush();
      if (!nextVlog.thumbnailBlob) {
        try {
          Object.assign(nextVlog, await generateVideoThumbnail(nextVlog.blob, thumbnailSizes.vlog));
        } catch (error) {
          reportError(error);
        }
      }
      await saveVlogAndClearSessionDraft(nextVlog);
      clips.clearLocalClips();
      showResult(nextVlog, "replace");
    } catch (error) {
      progressDisplay.cancel();
      reportError(error);
      setGenerationProgress(makeGenerationProgress("error", 0));
      showReview("replace");
    } finally {
      setIsFinishing(false);
    }
  };

  const headerConfig = useMemo<AppHeaderConfig>(() => {
    if (mode === "generating") {
      return {
        eyebrow: "Finish",
        title: generationProgress.label,
      };
    }

    if (mode === "review") {
      return {
        eyebrow: "Review",
        title: "Draft clips",
        leading: (
          <Button
            asChild
            aria-label="Back to camera"
            size="icon"
            variant="outline"
          >
            <Link
              aria-disabled={isFinishing}
              href="/"
              tabIndex={isFinishing ? -1 : undefined}
              onClick={(event) => {
                event.preventDefault();
                if (isFinishing) {
                  return;
                }
                showCapture("push");
              }}
            >
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
        ),
        trailing: (
          <div className="px-1 py-1 text-right">
            <p className="text-sm font-semibold">{clips.clips.length} clips</p>
          </div>
        ),
      };
    }

    if (mode === "result" && vlog) {
      return {
        eyebrow: "Ready",
        title: vlog.title,
      };
    }

    return {
      eyebrow: "Today",
      title: "No pressure",
    };
  }, [clips.clips.length, generationProgress.label, isFinishing, mode, showCapture, vlog]);

  useAppHeader(headerConfig);

  return (
    <main className="relative isolate h-[100svh] overflow-hidden bg-background">
      <AnimatePresence initial={false}>
        <motion.div
          key={mode === "capture" && camera.stream ? "camera-preview" : "processing-backdrop"}
          className="absolute inset-x-0 bottom-0 top-[var(--app-header-background-start)]"
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
            exit={
              resultExitDirection === "bottom"
                ? { opacity: 1, y: "100%" }
                : { opacity: 0, y: -12 }
            }
            initial={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
          >
            <ResultPanel
              vlog={vlog}
              onDone={() => void handleResultDone()}
              onExport={() => void handleResultExport()}
            />
          </motion.div>
        ) : mode === "review" ? (
          <motion.div
            key="review"
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 42 }}
            initial={{ opacity: 0, x: 42 }}
            transition={routeSlideTransition}
          >
            <ClipReviewPanel
              clips={clips.clips}
              isFinishing={isFinishing}
              onBack={() => {
                setSlideDirection("right");
                showCapture("push");
              }}
              onClearDraft={async () => {
                try {
                  await clearDraft();
                  if (clips.session) {
                    await clearGeneratedVlogForSession(clips.session.id);
                  }
                  releaseAllVlogObjectUrls();
                  return true;
                } catch (error) {
                  reportError(error);
                  return false;
                }
              }}
              onDeleteClip={async (id) => {
                try {
                  await clips.removeClip(id);
                  return true;
                } catch (error) {
                  reportError(error);
                  return false;
                }
              }}
              onMakeVideo={finish}
              onReorderClips={async (clipIds) => {
                try {
                  await clips.reorderClips(clipIds);
                  return true;
                } catch (error) {
                  reportError(error);
                  return false;
                }
              }}
            />
          </motion.div>
        ) : (
          <motion.div
            key="capture"
            className="relative z-10 flex h-[100svh] flex-col top-level-screen"
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: slideDirection === "right" ? -42 : 42 }}
            initial={{ opacity: 0, x: 0 }}
            transition={routeSlideTransition}
          >
            <div className="mt-auto">
              <div className="mb-5 flex items-center justify-between gap-3">
                <Link
                  aria-label="Videos"
                  className="relative inline-flex size-14 shrink-0 items-center justify-center rounded-lg border bg-black/45 text-foreground outline-none transition hover:bg-black/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  href="/videos"
                  onClick={handleVideosEntry}
                >
                  <Clapperboard className="size-6 text-memory" />
                  {hasNeedsActionVlog ? (
                    <span
                      aria-hidden="true"
                      className="absolute -right-1 -top-1 size-4 rounded-full bg-primary ring-2 ring-background"
                      data-testid="videos-needs-action-badge"
                    />
                  ) : null}
                </Link>

                <RecordButton
                  disabled={
                    needsPermission ||
                    recorder.state === "saving" ||
                    clipLimitReached
                  }
                  progress={recorder.progress}
                  state={recorder.state}
                  onClick={handleRecordButtonClick}
                />

                <LatestDraftButton
                  clip={latestClip}
                  clipCount={clips.clips.length}
                  disabled={!canOpenDraft}
                  onOpen={openReview}
                />
              </div>

              {camera.error ? (
                <div className="mb-3 rounded-lg border bg-surface-soft/82 p-3">
                  <p className="text-sm font-semibold">Camera is blocked</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {camera.error.userMessage}
                  </p>
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
                </div>
              ) : null}

              {clipLimitReached ? (
                <p className="mb-3 rounded-lg border bg-surface-soft/82 p-3 text-sm font-semibold">
                  Session limit reached for v1.
                </p>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {mode === "generating" ? null : <DebugDrawer />}
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
  const thumbnailSrc = useMemo(
    () => (clip ? getThumbnailObjectUrlForClip(clip) : null),
    [clip],
  );
  const src = useMemo(
    () => (clip && !thumbnailSrc ? getObjectUrlForClip(clip) : null),
    [clip, thumbnailSrc],
  );
  const shouldReduceMotion = useReducedMotion() === true;
  const showDraftAttention = clipCount > 0 && !disabled;
  const hasPreview = Boolean(clip && (thumbnailSrc || src));

  return (
    <motion.button
      aria-disabled={disabled}
      aria-label="Review draft clips"
      className="relative inline-flex size-14 shrink-0 items-center justify-center rounded-lg border bg-black/45 text-foreground outline-none transition hover:bg-black/60 disabled:pointer-events-none disabled:cursor-default disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      data-disabled={disabled}
      disabled={disabled}
      type="button"
      animate={
        showDraftAttention && !shouldReduceMotion
          ? {
              boxShadow: [
                "0 0 0 0 hsl(var(--memory) / 0)",
                "0 0 0 4px hsl(var(--memory) / 0.24)",
                "0 0 0 0 hsl(var(--memory) / 0)",
              ],
            }
          : { boxShadow: "0 0 0 0 hsl(var(--memory) / 0)" }
      }
      transition={
        showDraftAttention && !shouldReduceMotion
          ? { duration: 2.8, repeat: Infinity, repeatDelay: 1.4, ease: "easeInOut" }
          : { duration: 0.16 }
      }
      onClick={onOpen}
    >
      <AnimatePresence initial={false} mode="wait">
        {hasPreview && clip ? (
          <motion.span
            aria-hidden="true"
            className="absolute inset-0 overflow-hidden rounded-[inherit]"
            key={`draft-preview-${clip.id}`}
            animate={{ opacity: 1, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.08 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: "easeOut" }}
          >
            {thumbnailSrc ? (
              <img
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                decoding="async"
                loading="lazy"
                src={thumbnailSrc}
              />
            ) : (
              <video
                className="absolute inset-0 h-full w-full object-cover"
                muted
                playsInline
                preload="metadata"
                src={src ?? undefined}
              />
            )}
            <span className="absolute inset-0 bg-black/18" />
          </motion.span>
        ) : (
          <motion.span
            aria-hidden="true"
            className="inline-flex size-6 items-center justify-center text-muted-foreground"
            key="draft-empty-icon"
            animate={{ opacity: 1, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.16, ease: "easeOut" }}
          >
            <Layers2 className="size-6" />
          </motion.span>
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {hasPreview && clipCount > 0 ? (
          <motion.span
            className="absolute -right-1.5 -top-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-memory px-1.5 py-0.5 text-[10px] font-semibold leading-none text-memory-foreground ring-2 ring-background"
            key="draft-count"
            layout
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { scale: 0.78, opacity: 0, y: -2 }}
            initial={shouldReduceMotion ? { opacity: 0 } : { scale: 0.72, opacity: 0, y: -2 }}
            transition={draftBadgeTransition}
          >
            <AnimatedDraftCount count={clipCount} reducedMotion={shouldReduceMotion} />
          </motion.span>
        ) : null}
      </AnimatePresence>
    </motion.button>
  );
}

function AnimatedDraftCount({
  count,
  reducedMotion,
}: {
  count: number;
  reducedMotion: boolean;
}) {
  const [countState, setCountState] = useState<{ count: number; direction: 1 | -1 }>({
    count,
    direction: 1,
  });
  const direction = countState.direction;
  const digits = String(count).split("");

  if (count !== countState.count) {
    setCountState({ count, direction: count > countState.count ? 1 : -1 });
  }

  return (
    <span className="inline-flex items-center tabular-nums" aria-label={`+${count}`}>
      <span aria-hidden="true">+</span>
      <motion.span className="inline-flex items-center" layout aria-hidden="true">
        {digits.map((digit, index) => {
          const place = digits.length - index - 1;

          return (
            <motion.span
              className="relative inline-block h-[1em] w-[0.62em] overflow-hidden text-center"
              key={place}
              layout
            >
              <AnimatePresence initial={false} mode="popLayout">
                <motion.span
                  className="absolute inset-0"
                  key={`${place}-${digit}`}
                  animate={{ opacity: 1, y: 0 }}
                  exit={
                    reducedMotion
                      ? { opacity: 0 }
                      : {
                          opacity: 0,
                          y: direction > 0 ? "-100%" : "100%",
                        }
                  }
                  initial={
                    reducedMotion
                      ? { opacity: 0 }
                      : {
                          opacity: 0,
                          y: direction > 0 ? "100%" : "-100%",
                        }
                  }
                  transition={reducedMotion ? { duration: 0 } : draftDigitTransition}
                >
                  {digit}
                </motion.span>
              </AnimatePresence>
            </motion.span>
          );
        })}
      </motion.span>
    </span>
  );
}
