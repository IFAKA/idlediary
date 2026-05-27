"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Film, Plus, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { CameraPreview } from "@/features/capture/camera-preview";
import { PermissionPanel } from "@/features/capture/permission-panel";
import {
  getObjectUrlForVlog,
  releaseVlogObjectUrl,
} from "@/features/clips/media-cache";
import { listVlogs } from "@/features/clips/storage";
import type { VlogRecord } from "@/features/clips/types";
import { DebugDrawer } from "@/features/errors/debug-drawer";
import { reportError } from "@/features/errors/report-error";

type HomeState =
  | { status: "checking"; vlogs: VlogRecord[]; error?: never }
  | { status: "loading"; vlogs: VlogRecord[]; error?: never }
  | { status: "ready"; vlogs: VlogRecord[]; error?: never }
  | { status: "error"; vlogs: VlogRecord[]; error: string };

const INTRO_SEEN_KEY = "idlediary:intro-seen";
const INTRO_SEEN_CHANGE_EVENT = "idlediary:intro-seen-change";

function introSeenSnapshot() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(INTRO_SEEN_KEY) === "true";
}

function subscribeToIntroSeen(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(INTRO_SEEN_CHANGE_EVENT, listener);

  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(INTRO_SEEN_CHANGE_EVENT, listener);
  };
}

function markIntroSeen() {
  window.localStorage.setItem(INTRO_SEEN_KEY, "true");
  window.dispatchEvent(new Event(INTRO_SEEN_CHANGE_EVENT));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function HomeScreen() {
  const router = useRouter();
  const introSeen = useSyncExternalStore(
    subscribeToIntroSeen,
    introSeenSnapshot,
    () => true,
  );
  const [state, setState] = useState<HomeState>({ status: "checking", vlogs: [] });

  useEffect(() => {
    let mounted = true;

    if (!introSeen) {
      return () => {
        mounted = false;
      };
    }

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
  }, [introSeen]);

  if (!introSeen) {
    return (
      <main className="relative isolate overflow-hidden bg-background">
        <CameraPreview stream={null} />
        <PermissionPanel
          permission="prompt"
          onStart={() => {
            markIntroSeen();
            router.push("/capture");
          }}
        />
        <DebugDrawer />
      </main>
    );
  }

  return (
    <main className="relative isolate min-h-[100svh] overflow-hidden bg-background safe-screen">
      <div className="mx-auto flex min-h-[calc(100svh-32px)] w-full max-w-5xl flex-col">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              IdleDiary
            </p>
            <h1 className="mt-1 text-3xl font-semibold leading-tight">Generated videos</h1>
          </div>
          <Button asChild size="icon" aria-label="Start recording">
            <Link href="/capture">
              <Plus className="size-5" />
            </Link>
          </Button>
        </header>

        {state.status === "error" ? (
          <div className="mt-5 rounded-md border border-destructive/45 bg-destructive/10 p-3 text-sm leading-6 text-destructive-foreground">
            {state.error}
          </div>
        ) : null}

        <section className="mt-8 flex-1">
          {state.status === "checking" || state.status === "loading" ? (
            <div className="flex h-full min-h-80 items-center justify-center text-sm text-muted-foreground">
              Loading videos...
            </div>
          ) : state.vlogs.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {state.vlogs.map((vlog) => (
                <VlogCard key={vlog.id} vlog={vlog} />
              ))}
            </div>
          ) : (
            <EmptyHistory />
          )}
        </section>
      </div>
      <DebugDrawer />
    </main>
  );
}

function EmptyHistory() {
  return (
    <div className="flex min-h-[70svh] flex-col items-center justify-center text-center">
      <div className="mb-6 inline-flex size-14 items-center justify-center rounded-full border bg-black/35 text-primary">
        <Film className="size-7" />
      </div>
      <h2 className="text-2xl font-semibold">No generated videos yet</h2>
      <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
        Record a few two-second clips, review the draft, then generate your first diary video.
      </p>
      <Button asChild className="mt-7 h-14 px-6 text-base">
        <Link href="/capture">
          <Plus className="size-5" />
          Start recording
        </Link>
      </Button>
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
      className="group overflow-hidden rounded-lg border bg-card text-card-foreground outline-none transition hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
        <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-md bg-black/65 px-2 py-1 text-xs font-semibold text-white">
          <RefreshCw className="size-3" />
          {vlog.clipCount} clips
        </div>
      </div>
      <div className="p-3">
        <h2 className="line-clamp-2 text-base font-semibold leading-6">{vlog.title}</h2>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="size-3.5" />
          {formatDate(vlog.createdAt)}
        </p>
      </div>
    </Link>
  );
}
