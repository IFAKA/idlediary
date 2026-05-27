"use client";

import Link from "next/link";
import { ArrowLeft, CalendarDays, Clapperboard, RefreshCw } from "lucide-react";
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
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

        <section className="mt-8 min-h-0 flex-1 overflow-hidden">
          {state.status === "loading" ? (
            <div className="flex h-full min-h-80 items-center justify-center text-sm text-muted-foreground">
              Loading entries...
            </div>
          ) : state.vlogs.length > 0 ? (
            <div className="h-full overflow-y-auto overscroll-contain pr-1">
              <div className="grid gap-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
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
    <Link
      className="group overflow-hidden rounded-lg border border-memory/20 bg-surface-soft text-surface-soft-foreground outline-none transition hover:border-memory/65 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      href={`/result?vlog=${encodeURIComponent(vlog.id)}`}
    >
      <div className="relative aspect-[9/16] bg-black">
        <video
          aria-hidden="true"
          className="h-full w-full object-cover"
          loop
          muted
          playsInline
          preload="metadata"
          src={src ?? undefined}
        />
        <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-md bg-background/78 px-2 py-1 text-xs font-semibold text-memory backdrop-blur-sm">
          <RefreshCw className="size-3" />
          {vlog.clipCount} clips
        </div>
      </div>
      <div className="border-t border-memory/15 p-3">
        <h2 className="line-clamp-2 text-base font-semibold leading-6">{vlog.title}</h2>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="size-3.5" />
          {formatDate(vlog.createdAt)}
        </p>
      </div>
    </Link>
  );
}
