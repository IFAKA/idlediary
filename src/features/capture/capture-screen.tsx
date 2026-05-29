"use client";

import Link from "next/link";
import { ArrowLeft, Clapperboard, Layers2, RotateCcw, SwitchCamera } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type TouchEvent,
} from "react";
import { useAppHeader, type AppHeaderConfig } from "@/components/app-header-shell";
import { AppViewportShell } from "@/components/app-viewport-shell";
import { ItemCountStack } from "@/components/item-counter";
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
  getLatestVlogForSession,
  hasNeedsActionVlog as checkHasNeedsActionVlog,
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
type DemoScene = "record" | "draft" | "generate" | "result";

type CaptureScreenDemoConfig = {
  captureClipDurationMs?: number;
  captureClipSrc: string;
  previewSrc: string;
  resultSrc: string;
  scene: DemoScene;
  seedRemainingClipsAfterFirstCapture?: () => Promise<void>;
  sessionId: string;
};

const waitForPaint = () => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
const wait = (durationMs: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, durationMs));

async function recordDemoClip(
  src: string,
  durationMs: number,
  setState: (state: "idle" | "recording" | "saving" | "success") => void,
  setProgress: (progress: number) => void,
) {
  setState("recording");
  setProgress(0);
  const startedAt = performance.now();
  const progressTimer = window.setInterval(() => {
    setProgress(Math.min(100, Math.round(((performance.now() - startedAt) / durationMs) * 100)));
  }, 80);
  await wait(durationMs);
  window.clearInterval(progressTimer);
  setProgress(100);
  setState("saving");
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Demo clip could not be loaded: ${src}`);
  const blob = await response.blob();
  setState("success");
  window.setTimeout(() => {
    setProgress(0);
    setState("idle");
  }, 650);
  return blob;
}

async function createDemoVlog(
  sessionId: string,
  src: string,
  clipCount: number,
  clipDurationMs: number,
): Promise<VlogRecord> {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Demo result could not be loaded: ${src}`);
  const blob = await response.blob();
  const seconds = Math.round((clipCount * clipDurationMs) / 1000);
  return {
    id: "launch-demo-vlog",
    sessionId,
    blob,
    mimeType: "video/mp4",
    clipCount,
    title: `${clipCount} Tiny Moments`,
    caption: `A quiet ${seconds}-second diary from today.`,
    createdAt: new Date().toISOString(),
    needsAction: false,
    size: blob.size,
    generationFingerprint: "launch-demo-result",
  };
}

const routeSlideTransition = { duration: 0.24, ease: "easeOut" } as const;
const notificationBadgeSpring = { type: "spring", stiffness: 680, damping: 24, mass: 0.55 } as const;
const notificationBadgePulse = { duration: 1.6, repeat: Infinity, repeatDelay: 1.8, ease: "easeInOut" } as const;
const draftBadgeTransition = { type: "spring", stiffness: 520, damping: 32, bounce: 0.12 } as const;
const draftCounterPulseTransition = { duration: 0.28, ease: [0.16, 1, 0.3, 1] } as const;
const draftDigitTransition = { type: "spring", stiffness: 680, damping: 32, mass: 0.62 } as const;
const minimumVisibleGenerationStepMs = 450;
const minimumVisibleSavingStepMs = 500;
const minimumVisibleDoneStepMs = 900;
const cameraSwipeMinDistance = 56;
const cameraSwipeAxisRatio = 1.2;
const oneTimeGuideAutoDismissMs = 4000;
export const FIRST_RECORD_GUIDE_SEEN_KEY = "idlediary:first-record-guide-seen";
export const SAVED_VIDEO_GUIDE_SEEN_KEY = "idlediary:saved-video-guide-seen";
const introGenerationProgress = [
  makeGenerationProgress("loading", 8),
  makeGenerationProgress("writing", 14),
  makeGenerationProgress("rendering", 24),
];
const generationProgressOrder: Record<GenerationProgress["step"], number> = {
  idle: 0,
  loading: 1,
  writing: 2,
  rendering: 3,
  saving: 4,
  done: 5,
  error: 6,
};

function durableViewForDemoScene(scene: DemoScene): DurableView {
  if (scene === "draft" || scene === "generate") return "review";
  if (scene === "result") return "result";
  return "capture";
}

export function shouldPublishGenerationProgress(
  currentProgress: Pick<GenerationProgress, "step" | "value">,
  nextProgress: Pick<GenerationProgress, "step" | "value">,
) {
  const currentOrder = generationProgressOrder[currentProgress.step];
  const nextOrder = generationProgressOrder[nextProgress.step];

  if (nextOrder !== currentOrder) {
    return nextOrder > currentOrder;
  }

  return nextProgress.value >= currentProgress.value;
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

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("button, a, input, textarea, select"));
}

function hasSeenFirstRecordGuide() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(FIRST_RECORD_GUIDE_SEEN_KEY) === "true";
}

function markFirstRecordGuideSeen() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FIRST_RECORD_GUIDE_SEEN_KEY, "true");
}

function hasSeenSavedVideoGuide() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(SAVED_VIDEO_GUIDE_SEEN_KEY) === "true";
}

function markSavedVideoGuideSeen() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SAVED_VIDEO_GUIDE_SEEN_KEY, "true");
}

export function CaptureScreen({ demo }: { demo?: CaptureScreenDemoConfig } = {}) {
  const isDemo = Boolean(demo);
  const camera = useCamera();
  const clips = useClips({ sessionId: demo?.sessionId });
  const recorder = useTwoSecondRecorder(camera.stream);
  const [demoRecordingState, setDemoRecordingState] = useState<
    "idle" | "recording" | "saving" | "success"
  >("idle");
  const [demoRecordingProgress, setDemoRecordingProgress] = useState(0);
  const [mode, setMode] = useState<ScreenMode>("capture");
  const [initialViewReady, setInitialViewReady] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [vlog, setVlog] = useState<VlogRecord | null>(null);
  const [slideDirection, setSlideDirection] = useState<"left" | "right">("right");
  const [resultExitDirection, setResultExitDirection] = useState<"up" | "bottom">("up");
  const [hasNeedsActionVlog, setHasNeedsActionVlog] = useState(false);
  const [showFirstRecordGuide, setShowFirstRecordGuide] = useState(false);
  const [showSavedVideoGuide, setShowSavedVideoGuide] = useState(false);
  const shouldReduceMotion = useReducedMotion() === true;
  const initialViewResolved = useRef(false);
  const cameraStartAttempted = useRef(false);
  const demoSeededAfterCapture = useRef(false);
  const cameraSwipeStartRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const previousClipCountRef = useRef<number | null>(null);
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress>({
    ...makeGenerationProgress("idle", 0),
  });
  const recorderState = demo ? demoRecordingState : recorder.state;
  const recorderProgress = demo ? demoRecordingProgress : recorder.progress;

  const needsPermission = !isDemo && !camera.stream;
  const canOpenDraft =
    mode === "capture" &&
    !isFinishing &&
    !clips.loading &&
    recorderState !== "recording" &&
    recorderState !== "saving";
  const canOpenVideos = canOpenDraft;
  const canSwitchCamera =
    mode === "capture" &&
    Boolean(camera.stream) &&
    camera.hasMultipleCameras &&
    !camera.switching &&
    !isFinishing &&
    recorderState !== "recording" &&
    recorderState !== "saving";
  const clipLimitReached = clips.clips.length >= 20;
  const latestClip = clips.clips.length > 0 ? clips.clips[clips.clips.length - 1] : null;
  const draftClipCount = clips.loading ? null : clips.clips.length;

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

  const handleVideosEntry = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
    if (!canOpenVideos) {
      event.preventDefault();
      return;
    }

    setSlideDirection("left");
    setHasNeedsActionVlog(false);
    markSavedVideoGuideSeen();
    setShowSavedVideoGuide(false);
  }, [canOpenVideos]);

  const restoreRequestedView = useCallback(
    async (requestedView = requestedViewFromUrl()) => {
      if (clips.loading || !clips.session) return;

      if (requestedView === "review") {
        setVlog(null);
        setMode("review");
        return;
      }

      if (requestedView === "result") {
        if (demo) {
          setVlog(await getLatestVlogForSession(demo.sessionId));
          setMode("result");
          return;
        }
        setVlog(null);
        setMode("capture");
        if (!isDemo) writeViewToUrl("capture", "replace");
        return;
      }

      setVlog(null);
      setMode("capture");
      if (window.location.pathname !== "/") {
        if (!isDemo) writeViewToUrl("capture", "replace");
      }
    },
    [clips.loading, clips.session, demo, isDemo],
  );

  useEffect(() => {
    document.title = titleForMode(mode);
  }, [mode]);

  useEffect(() => {
    if (
      isDemo ||
      !initialViewReady ||
      mode !== "capture" ||
      camera.stream ||
      cameraStartAttempted.current
    ) return;
    cameraStartAttempted.current = true;
    void startCamera();
  }, [camera.stream, initialViewReady, isDemo, mode, startCamera]);

  useEffect(() => {
    if (mode === "capture" || isDemo) return;

    cameraStartAttempted.current = false;
    if (camera.stream) {
      camera.stop();
    }
  }, [camera, isDemo, mode]);

  useEffect(() => {
    if (initialViewResolved.current || clips.loading || !clips.session) return;
    initialViewResolved.current = true;
    const demoView = demo ? durableViewForDemoScene(demo.scene) : undefined;
    void restoreRequestedView(demoView).finally(() =>
      setInitialViewReady(true),
    );
  }, [clips.loading, clips.session, demo, restoreRequestedView]);

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
    if (clips.loading) return;

    const previousClipCount = previousClipCountRef.current;
    previousClipCountRef.current = clips.clips.length;

    if (
      previousClipCount !== 0 ||
      clips.clips.length !== 1 ||
      mode !== "capture" ||
      recorderState === "recording" ||
      recorderState === "saving" ||
      hasSeenFirstRecordGuide()
    ) {
      return;
    }

    setShowFirstRecordGuide(true);
  }, [clips.clips.length, clips.loading, mode, recorderState]);

  useEffect(() => {
    if (!showFirstRecordGuide) return;

    const timeout = window.setTimeout(() => {
      markFirstRecordGuideSeen();
      setShowFirstRecordGuide(false);
    }, oneTimeGuideAutoDismissMs);

    return () => window.clearTimeout(timeout);
  }, [showFirstRecordGuide]);

  const dismissFirstRecordGuide = useCallback(() => {
    markFirstRecordGuideSeen();
    setShowFirstRecordGuide(false);
  }, []);

  const dismissSavedVideoGuide = useCallback(() => {
    markSavedVideoGuideSeen();
    setShowSavedVideoGuide(false);
  }, []);

  useEffect(() => {
    if (!showSavedVideoGuide) return;

    const timeout = window.setTimeout(() => {
      dismissSavedVideoGuide();
    }, oneTimeGuideAutoDismissMs);

    return () => window.clearTimeout(timeout);
  }, [dismissSavedVideoGuide, showSavedVideoGuide]);

  const showSavedVideoGuideOnce = useCallback(() => {
    if (hasSeenSavedVideoGuide()) return;
    setShowFirstRecordGuide(false);
    setShowSavedVideoGuide(true);
  }, []);

  useEffect(() => {
    if (isDemo) return;

    const onPopState = () => {
      if (mode === "result" && vlog && window.location.pathname === "/result") {
        return;
      }
      void restoreRequestedView();
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [isDemo, mode, restoreRequestedView, vlog]);

  const showCapture = useCallback((action: "push" | "replace" = "push") => {
    setSlideDirection("right");
    setVlog(null);
    setMode("capture");
    if (!isDemo) writeViewToUrl("capture", action);
  }, [isDemo]);

  const showReview = useCallback((action: "push" | "replace" = "push") => {
    setSlideDirection("right");
    setResultExitDirection("up");
    setVlog(null);
    setMode("review");
    if (!isDemo) writeViewToUrl("review", action);
  }, [isDemo]);

  const showResult = useCallback((nextVlog: VlogRecord, action: "push" | "replace" = "replace") => {
    setResultExitDirection("up");
    setVlog(nextVlog);
    setMode("result");
    if (!isDemo) writeViewToUrl("result", action);
  }, [isDemo]);

  const clearDraft = async () => {
    await clips.clearClips();
  };

  const handleResultShare = async () => {
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
      showSavedVideoGuideOnce();
      showCapture("push");
    }
  };

  const captureClip = async () => {
    if (clipLimitReached) {
      return;
    }

    try {
      const blob = demo
        ? await recordDemoClip(
            demo.captureClipSrc,
            demo.captureClipDurationMs ?? 3000,
            setDemoRecordingState,
            setDemoRecordingProgress,
          )
        : await recorder.record();
      if (blob !== null) {
        await clips.addClip(blob, demo?.captureClipDurationMs ?? 3000);
        if (
          demo?.seedRemainingClipsAfterFirstCapture &&
          !demoSeededAfterCapture.current
        ) {
          demoSeededAfterCapture.current = true;
          await demo.seedRemainingClipsAfterFirstCapture();
          await clips.refresh(demo.sessionId);
        }
      }
    } catch (error) {
      reportError(error);
    }
  };

  const handleRecordButtonClick = () => {
    if (recorderState === "recording") {
      if (demo) return;
      recorder.cancel();
      return;
    }

    void captureClip();
  };

  const switchCamera = useCallback(async () => {
    if (!canSwitchCamera) return;

    try {
      await camera.switchCamera();
    } catch (error) {
      reportError(error);
    }
  }, [camera, canSwitchCamera]);

  const maybeSwitchCameraFromSwipe = useCallback(
    (clientX: number, clientY: number, pointerId: number) => {
      const start = cameraSwipeStartRef.current;
      if (!start || start.pointerId !== pointerId || !canSwitchCamera) return;

      const deltaX = clientX - start.x;
      const deltaY = clientY - start.y;
      const isVerticalSwipe =
        Math.abs(deltaY) >= cameraSwipeMinDistance &&
        Math.abs(deltaY) >= Math.abs(deltaX) * cameraSwipeAxisRatio;
      const isHorizontalSwipe =
        Math.abs(deltaX) >= cameraSwipeMinDistance &&
        Math.abs(deltaX) >= Math.abs(deltaY) * cameraSwipeAxisRatio;

      if (!isVerticalSwipe && !isHorizontalSwipe) {
        return;
      }

      cameraSwipeStartRef.current = null;
      void switchCamera();
    },
    [canSwitchCamera, switchCamera],
  );

  const handleCapturePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || isInteractiveTarget(event.target)) {
      cameraSwipeStartRef.current = null;
      return;
    }

    cameraSwipeStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
    };
  };

  const handleCapturePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    maybeSwitchCameraFromSwipe(event.clientX, event.clientY, event.pointerId);
  };

  const handleCapturePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    maybeSwitchCameraFromSwipe(event.clientX, event.clientY, event.pointerId);
    cameraSwipeStartRef.current = null;
  };

  const handleCaptureTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1 || isInteractiveTarget(event.target)) {
      cameraSwipeStartRef.current = null;
      return;
    }

    const touch = event.touches[0];
    cameraSwipeStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      pointerId: -1,
    };
  };

  const handleCaptureTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;

    const hadSwipeStart = Boolean(cameraSwipeStartRef.current);
    maybeSwitchCameraFromSwipe(touch.clientX, touch.clientY, -1);
    if (hadSwipeStart && !cameraSwipeStartRef.current) {
      event.preventDefault();
    }
  };

  const handleCaptureTouchEnd = () => {
    cameraSwipeStartRef.current = null;
  };

  const handleCapturePointerDownCapture = () => {
    if (showFirstRecordGuide) {
      dismissFirstRecordGuide();
      return;
    }

    if (showSavedVideoGuide) {
      dismissSavedVideoGuide();
    }
  };

  const openReview = () => {
    if (!canOpenDraft) return;
    if (showFirstRecordGuide) {
      dismissFirstRecordGuide();
    }
    showReview("push");
  };

  const finish = async (reviewClips?: ClipRecord[]) => {
    const selectedClips = (reviewClips ?? clips.clips).slice(0, 20);

    if (!clips.session || clips.loading || selectedClips.length === 0) {
      return;
    }

    try {
      setIsFinishing(true);
      setGenerationProgress(makeGenerationProgress("idle", 0));
      setMode("generating");
      await waitForPaint();
      if (!isDemo) camera.stop();
      await waitForPaint();
      if (demo) {
        const demoProgress = [
          makeGenerationProgress("loading", 8),
          makeGenerationProgress("writing", 18),
          makeGenerationProgress("rendering", 42),
          makeGenerationProgress("rendering", 78, { label: "Making playback ready" }),
          makeGenerationProgress("saving", 92),
        ];
        for (const nextProgress of demoProgress) {
          setGenerationProgress(nextProgress);
          await wait(700);
        }
        setGenerationProgress(makeGenerationProgress("done", 100));
        await wait(minimumVisibleDoneStepMs);
        const nextVlog = await createDemoVlog(
          demo.sessionId,
          demo.resultSrc,
          selectedClips.length,
          demo.captureClipDurationMs ?? 3000,
        );
        await saveVlogAndClearSessionDraft(nextVlog);
        clips.clearLocalClips();
        showResult(nextVlog, "replace");
        return;
      }
      let realtimeProgressEnabled = false;
      let latestProgress = makeGenerationProgress("idle", 0);
      let displayedProgress = makeGenerationProgress("idle", 0);
      let savingShownAt: number | null = null;
      const publishDisplayedProgress = (nextProgress: GenerationProgress) => {
        if (!shouldPublishGenerationProgress(displayedProgress, nextProgress)) {
          return;
        }

        displayedProgress = nextProgress;
        setGenerationProgress(nextProgress);
      };
      const publishGenerationProgress = (nextProgress: GenerationProgress) => {
        latestProgress = nextProgress;

        if (!realtimeProgressEnabled || nextProgress.step === "done") {
          return;
        }

        if (nextProgress.step === "saving") {
          savingShownAt ??= performance.now();
        }

        publishDisplayedProgress(nextProgress);
      };
      const generationResultPromise = generateVlog(
        selectedClips,
        clips.session.id,
        publishGenerationProgress,
      ).then(
        (value) => ({ status: "fulfilled" as const, value }),
        (reason: unknown) => ({ status: "rejected" as const, reason }),
      );

      for (const introProgress of introGenerationProgress) {
        publishDisplayedProgress(introProgress);
        await wait(minimumVisibleGenerationStepMs);
      }

      realtimeProgressEnabled = true;
      if (latestProgress.step !== "idle" && latestProgress.step !== "done") {
        if (latestProgress.step === "saving") {
          savingShownAt ??= performance.now();
        }

        publishDisplayedProgress(latestProgress);
      }

      const generationResult = await generationResultPromise;
      if (generationResult.status === "rejected") {
        throw generationResult.reason;
      }

      if (savingShownAt === null) {
        savingShownAt = performance.now();
        setGenerationProgress(makeGenerationProgress("saving", 92));
      }

      const remainingSavingTime = minimumVisibleSavingStepMs - (performance.now() - savingShownAt);
      if (remainingSavingTime > 0) {
        await wait(remainingSavingTime);
      }

      setGenerationProgress(makeGenerationProgress("done", 100));
      await wait(minimumVisibleDoneStepMs);

      const nextVlog = generationResult.value;
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
        title: "Making video",
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
            <p>
              {draftClipCount === null ? null : (
                <ItemCountStack value={draftClipCount} singular="clip" plural="clips" />
              )}
            </p>
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
      trailing: camera.hasMultipleCameras ? (
        <Button
          aria-label="Switch camera"
          disabled={!canSwitchCamera}
          size="icon"
          title="Switch camera"
          type="button"
          variant="outline"
          onClick={() => void switchCamera()}
        >
          <SwitchCamera className="size-5" />
        </Button>
      ) : null,
    };
  }, [
    camera.hasMultipleCameras,
    canSwitchCamera,
    draftClipCount,
    isFinishing,
    mode,
    showCapture,
    switchCamera,
    vlog,
  ]);

  useAppHeader(headerConfig);

  return (
    <AppViewportShell>
      <AnimatePresence initial={false}>
        <motion.div
          key={mode === "capture" && camera.stream ? "camera-preview" : "processing-backdrop"}
          className="absolute inset-0"
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: mode === "capture" ? 1.015 : 1 }}
          initial={{ opacity: 0, scale: 1.01 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
        >
          <CameraPreview
            demoVideoSrc={mode === "capture" ? demo?.previewSrc : undefined}
            stream={mode === "capture" ? camera.stream : null}
          />
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
              onShare={() => void handleResultShare()}
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
            className="relative z-10 flex h-[100svh] flex-col overflow-hidden top-level-screen"
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: slideDirection === "right" ? -42 : 42 }}
            initial={{ opacity: 0, x: 0 }}
            transition={routeSlideTransition}
            onPointerDownCapture={handleCapturePointerDownCapture}
          >
            <div
              aria-hidden="true"
              className="absolute inset-0 z-0"
              data-testid="camera-switch-swipe-layer"
              style={{ touchAction: "none" }}
              onPointerCancel={() => {
                cameraSwipeStartRef.current = null;
              }}
              onPointerDown={handleCapturePointerDown}
              onPointerMove={handleCapturePointerMove}
              onPointerUp={handleCapturePointerUp}
              onTouchCancel={handleCaptureTouchEnd}
              onTouchEnd={handleCaptureTouchEnd}
              onTouchMove={handleCaptureTouchMove}
              onTouchStart={handleCaptureTouchStart}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[max(10rem,calc(env(safe-area-inset-top)+8.5rem))] bg-gradient-to-b from-black/72 via-black/34 to-transparent"
              data-testid="capture-header-gradient"
            />
            <div className="relative z-10 mt-auto">
              <AnimatePresence>
                {showFirstRecordGuide ? (
                  <FirstRecordGuide reducedMotion={shouldReduceMotion} />
                ) : showSavedVideoGuide ? (
                  <SavedVideoGuide reducedMotion={shouldReduceMotion} />
                ) : null}
              </AnimatePresence>
              <div className="mb-5 flex items-center justify-between gap-3">
                <Link
                  aria-disabled={!canOpenVideos}
                  aria-label="Videos"
                  className="relative inline-flex size-14 shrink-0 items-center justify-center rounded-lg border border-white/30 bg-black/52 text-foreground shadow-[0_0_0_1px_rgba(0,0,0,0.38),0_12px_28px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.12)] outline-none transition hover:border-white/45 hover:bg-black/64 aria-disabled:pointer-events-none aria-disabled:cursor-default aria-disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  href="/videos"
                  tabIndex={canOpenVideos ? undefined : -1}
                  onClick={handleVideosEntry}
                >
                  <Clapperboard className="size-6 text-memory" />
                  <AnimatePresence initial={false}>
                    {hasNeedsActionVlog ? (
                      <motion.span
                        aria-hidden="true"
                        className="absolute -right-1 -top-1 size-4"
                        data-testid="videos-needs-action-badge"
                        key="videos-needs-action-badge"
                        animate={{ opacity: 1, scale: 1 }}
                        exit={
                          shouldReduceMotion
                            ? { opacity: 0 }
                            : { opacity: 0, scale: 0.64 }
                        }
                        initial={
                          shouldReduceMotion
                            ? { opacity: 0 }
                            : { opacity: 0, scale: 0.32 }
                        }
                        transition={
                          shouldReduceMotion
                            ? { duration: 0 }
                            : notificationBadgeSpring
                        }
                      >
                        {shouldReduceMotion ? (
                          <span className="absolute inset-0 rounded-full bg-primary ring-2 ring-background" />
                        ) : (
                          <motion.span
                            className="absolute inset-0 rounded-full bg-primary ring-2 ring-background"
                            animate={{ scale: [1, 1.16, 1] }}
                            transition={notificationBadgePulse}
                          />
                        )}
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                </Link>

                <RecordButton
                  disabled={
                    needsPermission ||
                    recorderState === "saving" ||
                    clipLimitReached
                  }
                  progress={recorderProgress}
                  state={recorderState}
                  onClick={handleRecordButtonClick}
                />

                <LatestDraftButton
                  clip={latestClip}
                  clipCount={clips.clips.length}
                  disabled={!canOpenDraft}
                  isLoading={clips.loading}
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
    </AppViewportShell>
  );
}

function FirstRecordGuide({
  reducedMotion,
}: {
  reducedMotion: boolean;
}) {
  return (
    <motion.div
      role="status"
      aria-label="Draft clips guide"
      className="mb-3 ml-auto mr-0 w-[min(17rem,calc(100vw_-_2rem))] rounded-lg border border-white/22 bg-black/72 p-3 text-white shadow-[0_18px_50px_rgba(0,0,0,0.34)] backdrop-blur-md"
      data-testid="first-record-guide"
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
      initial={reducedMotion ? false : { opacity: 0, y: 10, scale: 0.98 }}
      transition={reducedMotion ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
    >
      <div className="relative">
        <span
          aria-hidden="true"
          className="absolute -bottom-5 right-6 size-3 rotate-45 border-b border-r border-white/22 bg-black/72"
        />
        <p className="text-sm font-semibold leading-5">Your clip is in Draft clips.</p>
        <p className="mt-1 text-xs leading-5 text-white/74">
          Tap the stack to review and make a video.
        </p>
      </div>
    </motion.div>
  );
}

function SavedVideoGuide({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <motion.div
      role="status"
      aria-label="Saved video guide"
      className="mb-3 ml-0 mr-auto w-[min(17rem,calc(100vw_-_2rem))] rounded-lg border border-white/22 bg-black/72 p-3 text-white shadow-[0_18px_50px_rgba(0,0,0,0.34)] backdrop-blur-md"
      data-testid="saved-video-guide"
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
      initial={reducedMotion ? false : { opacity: 0, y: 10, scale: 0.98 }}
      transition={reducedMotion ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
    >
      <div className="relative">
        <span
          aria-hidden="true"
          className="absolute -bottom-5 left-6 size-3 rotate-45 border-b border-r border-white/22 bg-black/72"
        />
        <p className="text-sm font-semibold leading-5">Your video is saved in Videos.</p>
        <p className="mt-1 text-xs leading-5 text-white/74">
          Tap the clapperboard to find it anytime.
        </p>
      </div>
    </motion.div>
  );
}

function LatestDraftButton({
  clip,
  clipCount,
  disabled,
  isLoading,
  onOpen,
}: {
  clip: ClipRecord | null;
  clipCount: number;
  disabled: boolean;
  isLoading: boolean;
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
  const hasPreview = Boolean(clip && (thumbnailSrc || src));
  const draftCountTextSize =
    clipCount >= 100 ? "text-lg" : clipCount >= 10 ? "text-xl" : "text-2xl";
  const [shouldAnimateDraftChange, setShouldAnimateDraftChange] =
    useState(false);
  const previousClipCountRef = useRef(clipCount);
  const didLoadRef = useRef(false);
  const shouldAnimateDraftMotion =
    shouldAnimateDraftChange && !shouldReduceMotion;

  useEffect(() => {
    if (isLoading) {
      previousClipCountRef.current = clipCount;
      return;
    }

    if (!didLoadRef.current) {
      didLoadRef.current = true;
      previousClipCountRef.current = clipCount;
      return;
    }

    const previousClipCount = previousClipCountRef.current;
    previousClipCountRef.current = clipCount;

    if (disabled || clipCount <= previousClipCount) return;

    setShouldAnimateDraftChange(true);
    const timeout = window.setTimeout(
      () => setShouldAnimateDraftChange(false),
      360,
    );

    return () => window.clearTimeout(timeout);
  }, [clipCount, disabled, isLoading]);

  return (
    <motion.button
      aria-disabled={disabled}
      aria-label="Review draft clips"
      className="relative inline-flex size-14 shrink-0 items-center justify-center rounded-lg border border-white/30 bg-black/52 text-foreground shadow-[0_0_0_1px_rgba(0,0,0,0.38),0_12px_28px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.12)] outline-none transition hover:border-white/45 hover:bg-black/64 disabled:pointer-events-none disabled:cursor-default disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      data-disabled={disabled}
      disabled={disabled}
      type="button"
      animate={
        shouldAnimateDraftMotion
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
        shouldAnimateDraftMotion
          ? { duration: 0.36, ease: "easeOut" }
          : { duration: 0 }
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
            exit={
              !shouldAnimateDraftMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.96 }
            }
            initial={
              !shouldAnimateDraftMotion
                ? false
                : { opacity: 0, scale: 1.08 }
            }
            transition={{
              duration: shouldAnimateDraftMotion ? 0.2 : 0,
              ease: "easeOut",
            }}
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
            <span className="absolute inset-0 bg-black/56 backdrop-blur-[1px]" />
            {clipCount > 0 ? (
              <motion.span
                className={`absolute inset-0 inline-flex items-center justify-center font-medium leading-none text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)] ${draftCountTextSize}`}
                key="draft-count"
                layout={shouldAnimateDraftMotion}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={
                  !shouldAnimateDraftMotion
                    ? { opacity: 0 }
                    : { scale: 0.78, opacity: 0, y: -2 }
                }
                initial={
                  !shouldAnimateDraftMotion
                    ? false
                    : { scale: 0.72, opacity: 0, y: -2 }
                }
                transition={
                  shouldAnimateDraftMotion
                    ? draftBadgeTransition
                    : { duration: 0 }
                }
              >
                <AnimatedDraftCount
                  animateChange={shouldAnimateDraftMotion}
                  count={clipCount}
                  reducedMotion={shouldReduceMotion}
                />
              </motion.span>
            ) : null}
          </motion.span>
        ) : (
          <motion.span
            aria-hidden="true"
            className="inline-flex size-6 items-center justify-center text-muted-foreground"
            key="draft-empty-icon"
            animate={{ opacity: 1, scale: 1 }}
            exit={
              !shouldAnimateDraftMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.9 }
            }
            initial={
              !shouldAnimateDraftMotion
                ? false
                : { opacity: 0, scale: 0.9 }
            }
            transition={{
              duration: shouldAnimateDraftMotion ? 0.16 : 0,
              ease: "easeOut",
            }}
          >
            <Layers2 className="size-6" />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

function AnimatedDraftCount({
  animateChange,
  count,
  reducedMotion,
}: {
  animateChange: boolean;
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
      <motion.span
        className="inline-flex items-center"
        layout={animateChange}
        aria-hidden="true"
        initial={false}
        animate={
          reducedMotion || !animateChange
            ? undefined
            : {
                scale: [1, direction > 0 ? 1.12 : 0.94, 1],
                y: [0, direction > 0 ? -1 : 1, 0],
              }
        }
        transition={draftCounterPulseTransition}
      >
        {digits.map((digit, index) => {
          const place = digits.length - index - 1;

          return (
            <motion.span
              className="relative inline-block h-[1em] w-[0.62em] overflow-hidden text-center"
              key={place}
              layout={animateChange}
            >
              <AnimatePresence initial={false} mode="popLayout">
                <motion.span
                  className="absolute inset-0"
                  key={`${place}-${digit}`}
                  animate={{ opacity: 1, y: 0 }}
                  exit={
                    reducedMotion || !animateChange
                      ? { opacity: 0 }
                      : {
                          opacity: 0,
                          scale: 0.82,
                          y: direction > 0 ? "-72%" : "72%",
                        }
                  }
                  initial={
                    reducedMotion || !animateChange
                      ? false
                      : {
                          opacity: 0,
                          scale: 1.12,
                          y: direction > 0 ? "72%" : "-72%",
                      }
                  }
                  transition={
                    reducedMotion || !animateChange
                      ? { duration: 0 }
                      : draftDigitTransition
                  }
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
