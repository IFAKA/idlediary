"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Clapperboard,
  Clock3,
  FileVideo,
  HardDrive,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useAppHeader, type AppHeaderConfig } from "@/components/app-header-shell";
import { Button } from "@/components/ui/button";
import {
  getObjectUrlForVlog,
  releaseVlogObjectUrl,
} from "@/features/clips/media-cache";
import { listVlogs } from "@/features/clips/storage";
import type { VlogRecord } from "@/features/clips/types";
import { DebugDrawer } from "@/features/errors/debug-drawer";
import { reportError } from "@/features/errors/report-error";

type HomeState =
  | { status: "loading"; vlogs: VlogRecord[]; error?: never }
  | { status: "ready"; vlogs: VlogRecord[]; error?: never }
  | { status: "error"; vlogs: VlogRecord[]; error: string };

function formatSessionDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
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

export function HomeScreen() {
  const [state, setState] = useState<HomeState>({ status: "loading", vlogs: [] });
  const headerConfig = useMemo<AppHeaderConfig>(
    () => ({
      eyebrow: "IdleDiary",
      title: "Saved entries",
      leading: (
        <Button asChild size="icon" variant="outline" aria-label="Back to camera">
          <Link href="/">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
      ),
    }),
    [],
  );

  useAppHeader(headerConfig);

  useEffect(() => {
    let mounted = true;

    listVlogs()
      .then((vlogs) => {
        if (mounted) setState({ status: "ready", vlogs });
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
    };
  }, []);

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

        <section className="mt-3 min-h-0 flex-1 overflow-hidden">
          {state.status === "loading" ? (
            <div className="flex h-full min-h-80 items-center justify-center text-sm text-muted-foreground">
              Loading entries...
            </div>
          ) : state.vlogs.length > 0 ? (
            <div className="h-full overflow-y-auto overscroll-contain pr-1">
              <div className="grid gap-3 pb-4 xl:grid-cols-2">
                {state.vlogs.map((vlog) => (
                  <VlogCard key={vlog.id} vlog={vlog} />
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
        Record a few three-second clips, review the draft, then generate your first diary video.
      </p>
    </div>
  );
}

function VlogCard({ vlog }: { vlog: VlogRecord }) {
  const src = useMemo(() => getObjectUrlForVlog(vlog), [vlog]);

  useEffect(() => {
    return () => releaseVlogObjectUrl(vlog.id);
  }, [vlog.id]);

  return (
    <article className="group grid h-36 grid-cols-[144px_minmax(0,1fr)] overflow-hidden rounded-lg border border-memory/20 bg-surface-soft text-surface-soft-foreground transition hover:border-memory/65 sm:h-40 sm:grid-cols-[160px_minmax(0,1fr)]">
      <Link
        aria-label={`Open ${vlog.title}`}
        className="relative h-full w-full bg-black outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        href={`/videos/${encodeURIComponent(vlog.id)}`}
      >
        <video
          aria-hidden="true"
          className="h-full w-full object-cover"
          muted
          playsInline
          preload="metadata"
          src={src ?? undefined}
        />
      </Link>
      <div className="flex min-w-0 flex-col border-l border-memory/15 p-3">
        <Link
          className="min-w-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          href={`/videos/${encodeURIComponent(vlog.id)}`}
        >
          <h2 className="line-clamp-1 text-base font-semibold leading-6">{vlog.title}</h2>
        </Link>

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
            <dd className="truncate">{formatFileSize(vlog.blob.size)}</dd>
          </div>
        </dl>

        <p className="mt-auto pt-3 text-xs text-muted-foreground">
          Session {formatSessionDate(vlog.sessionId)}
        </p>
      </div>
    </article>
  );
}
