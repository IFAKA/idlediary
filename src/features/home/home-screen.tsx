"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Clapperboard,
  Clock3,
  FileVideo,
  HardDrive,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useAppHeader,
  type AppHeaderConfig,
} from "@/components/app-header-shell";
import { ItemCountStack } from "@/components/item-counter";
import { Button } from "@/components/ui/button";
import {
  getThumbnailObjectUrlForVlog,
  releaseVlogObjectUrl,
} from "@/features/clips/media-cache";
import {
  getVlog,
  listVlogSummaries,
  markNeedsActionVlogsHandled,
  saveVlogThumbnail,
  sortVlogsNewestFirst,
} from "@/features/clips/storage";
import {
  generateVideoThumbnail,
  thumbnailSizes,
} from "@/features/clips/thumbnail";
import type { VlogSummary } from "@/features/clips/types";
import { DebugDrawer } from "@/features/errors/debug-drawer";
import { reportError } from "@/features/errors/report-error";

type HomeState =
  | { status: "loading"; vlogs?: never; error?: never }
  | { status: "ready"; vlogs: VlogSummary[]; error?: never }
  | { status: "error"; vlogs: VlogSummary[]; error: string };

const completedAtFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatCompletedAt(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return completedAtFormatter.format(parsed);
}

function formatDuration(clipCount: number) {
  const seconds = clipCount * 2;
  return `${seconds}s`;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"] as const;
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function formatMimeType(mimeType: string) {
  return mimeType.split(";")[0]?.replace("video/", "").toUpperCase() || "VIDEO";
}

const newVideoHighlightDelayMs = 420;

export function HomeScreen() {
  const [state, setState] = useState<HomeState>({ status: "loading" });
  const [highlightedVlogIds, setHighlightedVlogIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [isNewVideoHighlightActive, setIsNewVideoHighlightActive] =
    useState(false);
  const mountedRef = useRef(false);
  const highlightTimerRef = useRef<number | null>(null);
  const highlightFrameRef = useRef<number | null>(null);
  const thumbnailBackfillsRef = useRef(new Set<string>());
  const videoCount = state.status === "ready" ? state.vlogs.length : null;
  const headerConfig = useMemo<AppHeaderConfig>(
    () => ({
      eyebrow: "IdleDiary",
      title: "Saved entries",
      leading: (
        <Button
          asChild
          size="icon"
          variant="outline"
          aria-label="Back to camera"
        >
          <Link href="/">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
      ),
      trailing: (
        <div className="px-1 py-1 text-right">
          <p>
            <AnimatePresence initial={false}>
              {videoCount === null ? null : (
                <motion.span
                  key="video-count"
                  animate={{ opacity: 1 }}
                  className="inline-flex justify-end"
                  exit={{ opacity: 0 }}
                  initial={{ opacity: 0 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                >
                  <ItemCountStack
                    value={videoCount}
                    singular="video"
                    plural="videos"
                  />
                </motion.span>
              )}
            </AnimatePresence>
          </p>
        </div>
      ),
    }),
    [videoCount],
  );

  useAppHeader(headerConfig);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const clearHighlightStart = useCallback(() => {
    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }

    if (highlightFrameRef.current !== null) {
      window.cancelAnimationFrame(highlightFrameRef.current);
      highlightFrameRef.current = null;
    }
  }, []);

  const scheduleHighlightStart = useCallback(() => {
    clearHighlightStart();
    highlightTimerRef.current = window.setTimeout(() => {
      highlightTimerRef.current = null;
      highlightFrameRef.current = window.requestAnimationFrame(() => {
        highlightFrameRef.current = null;
        if (mountedRef.current) {
          setIsNewVideoHighlightActive(true);
        }
      });
    }, newVideoHighlightDelayMs);
  }, [clearHighlightStart]);

  const backfillVlogThumbnail = useCallback(async (vlogId: string) => {
    if (thumbnailBackfillsRef.current.has(vlogId)) return;

    thumbnailBackfillsRef.current.add(vlogId);
    try {
      const fullVlog = await getVlog(vlogId);
      if (!fullVlog) return;

      const thumbnail = await generateVideoThumbnail(
        fullVlog.blob,
        thumbnailSizes.vlog,
      );
      const updatedVlog = await saveVlogThumbnail(vlogId, thumbnail);
      if (!updatedVlog || !mountedRef.current) return;

      setState((current) => {
        if (current.status !== "ready") return current;
        return {
          status: "ready",
          vlogs: sortVlogsNewestFirst(
            current.vlogs.map((item) =>
              item.id === updatedVlog.id ? updatedVlog : item,
            ),
          ),
        };
      });
    } catch (error) {
      reportError(error);
    } finally {
      thumbnailBackfillsRef.current.delete(vlogId);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    listVlogSummaries()
      .then(async (vlogs) => {
        const sortedVlogs = sortVlogsNewestFirst(vlogs);
        const newVlogIds = sortedVlogs
          .filter((vlog) => vlog.needsAction === true)
          .map((vlog) => vlog.id);
        const handledVlogs = new Map<string, VlogSummary>();

        try {
          const handled = await markNeedsActionVlogsHandled();
          for (const handledVlog of handled) {
            handledVlogs.set(handledVlog.id, handledVlog);
          }
        } catch (error) {
          reportError(error);
        }

        const readyVlogs =
          handledVlogs.size > 0
            ? sortedVlogs.map((vlog) => handledVlogs.get(vlog.id) ?? vlog)
            : sortedVlogs;

        if (!mounted) return;
        setIsNewVideoHighlightActive(false);
        setHighlightedVlogIds(new Set(newVlogIds));
        setState({ status: "ready", vlogs: readyVlogs });
        if (newVlogIds.length > 0) {
          scheduleHighlightStart();
        }

        void (async () => {
          for (const vlog of readyVlogs.filter(
            (entry) => !entry.thumbnailBlob,
          )) {
            if (!mounted) return;
            void backfillVlogThumbnail(vlog.id);
          }
        })();
      })
      .catch((error) => {
        const appError = reportError(error);
        if (mounted) {
          setState({
            status: "error",
            vlogs: [],
            error: appError.userMessage,
          });
        }
      });

    return () => {
      mounted = false;
      clearHighlightStart();
    };
  }, [backfillVlogThumbnail, clearHighlightStart, scheduleHighlightStart]);

  return (
    <main className="relative isolate h-[100svh] overflow-hidden bg-background">
      <motion.div
        className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col top-level-screen"
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -42 }}
        initial={{ opacity: 0, x: -42 }}
        transition={{ duration: 0.24, ease: "easeOut" }}
      >
        {state.status === "error" ? (
          <div className="mt-5 shrink-0 rounded-md border border-destructive/45 bg-destructive/10 p-3 text-sm leading-6 text-destructive-foreground">
            {state.error}
          </div>
        ) : null}

        <section className="min-h-0 flex-1 overflow-hidden">
          {state.status === "loading" ? (
            <div className="flex h-full min-h-80 items-center justify-center text-sm text-muted-foreground">
              Loading entries...
            </div>
          ) : state.vlogs.length > 0 ? (
            <div className="saved-videos-scroll h-full overflow-y-auto overscroll-contain">
              <div className="grid gap-5 pb-10 xl:grid-cols-2">
                {state.vlogs.map((vlog) => (
                  <VlogCard
                    key={vlog.id}
                    isNew={
                      isNewVideoHighlightActive &&
                      highlightedVlogIds.has(vlog.id)
                    }
                    vlog={vlog}
                    onThumbnailError={backfillVlogThumbnail}
                  />
                ))}
              </div>
            </div>
          ) : (
            <EmptyHistory />
          )}
        </section>
      </motion.div>
      <DebugDrawer />
    </main>
  );
}

function EmptyHistory() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="mb-6 inline-flex size-14 items-center justify-center rounded-full border border-memory/35 bg-memory/15 text-memory">
        <Clapperboard className="size-7" />
      </div>
      <h2 className="text-2xl font-semibold">No diary entries yet</h2>
      <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
        Record a few three-second clips, review the draft, then generate your
        first diary video.
      </p>
      <Button asChild className="mt-6">
        <Link href="/">
          <ArrowLeft className="size-4" />
          Back to recording
        </Link>
      </Button>
    </div>
  );
}

function VlogCard({
  isNew,
  vlog,
  onThumbnailError,
}: {
  isNew: boolean;
  vlog: VlogSummary;
  onThumbnailError: (vlogId: string) => void;
}) {
  const thumbnailSrc = useMemo(
    () => getThumbnailObjectUrlForVlog(vlog),
    [vlog],
  );
  const [failedThumbnailSrc, setFailedThumbnailSrc] = useState<string | null>(
    null,
  );
  const thumbnailFailed = thumbnailSrc === failedThumbnailSrc;

  useEffect(() => {
    return () => releaseVlogObjectUrl(vlog.id);
  }, [vlog.id]);

  return (
    <div
      className={`relative rounded-lg ${isNew ? "new-video-card-highlight" : ""}`}
    >
      <Link
        aria-label={`Open ${vlog.title}`}
        className="group grid h-36 grid-cols-[144px_minmax(0,1fr)] overflow-hidden rounded-lg border border-memory/20 bg-surface-soft text-surface-soft-foreground outline-none transition hover:border-memory/65 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:h-40 sm:grid-cols-[160px_minmax(0,1fr)]"
        href={`/videos/${encodeURIComponent(vlog.id)}`}
      >
        <article className="contents">
          <div className="relative h-full w-full bg-black">
            {thumbnailSrc && !thumbnailFailed ? (
              <img
                alt=""
                className="h-full w-full object-cover"
                decoding="async"
                loading="lazy"
                src={thumbnailSrc}
                onError={() => {
                  setFailedThumbnailSrc(thumbnailSrc);
                  onThumbnailError(vlog.id);
                }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-black text-white/60">
                <FileVideo className="size-8" />
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-col border-l border-memory/15 p-3">
            <div className="min-w-0">
              <h2 className="line-clamp-1 text-base font-semibold leading-6">
                {vlog.title}
              </h2>
            </div>

            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-muted-foreground">
              <div className="flex min-w-0 items-center gap-1.5">
                <Clapperboard className="size-3.5 shrink-0 text-memory" />
                <dt className="sr-only">Clips</dt>
                <dd className="truncate">{vlog.clipCount} clips</dd>
              </div>
              <div className="flex min-w-0 items-center gap-1.5">
                <Clock3 className="size-3.5 shrink-0 text-memory" />
                <dt className="sr-only">Duration</dt>
                <dd className="truncate">{formatDuration(vlog.clipCount)}</dd>
              </div>
              <div className="flex min-w-0 items-center gap-1.5">
                <FileVideo className="size-3.5 shrink-0 text-memory" />
                <dt className="sr-only">Format</dt>
                <dd className="truncate">{formatMimeType(vlog.mimeType)}</dd>
              </div>
              <div className="flex min-w-0 items-center gap-1.5">
                <HardDrive className="size-3.5 shrink-0 text-memory" />
                <dt className="sr-only">File size</dt>
                <dd className="truncate">{formatFileSize(vlog.size)}</dd>
              </div>
            </dl>

            <p className="mt-auto pt-3 text-xs text-muted-foreground">
              Done {formatCompletedAt(vlog.createdAt)}
            </p>
          </div>
        </article>
      </Link>
    </div>
  );
}
