"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Download, Share2, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useAppHeader, type AppHeaderConfig } from "@/components/app-header-shell";
import { ResponsiveConfirm } from "@/components/responsive-confirm";
import { SupportLink } from "@/components/support-link";
import { Button } from "@/components/ui/button";
import { releaseVlogObjectUrl } from "@/features/clips/media-cache";
import { deleteVlog, getVlog, markVlogHandled } from "@/features/clips/storage";
import type { VlogRecord } from "@/features/clips/types";
import { VlogPlayer } from "@/features/clips/vlog-player";
import { DebugDrawer } from "@/features/errors/debug-drawer";
import { reportError } from "@/features/errors/report-error";
import { downloadVlog, shareVlog } from "@/features/share/share";

type DetailState =
  | { status: "loading"; vlog?: never; error?: never }
  | { status: "ready"; vlog: VlogRecord; error?: never }
  | { status: "missing"; vlog?: never; error?: never }
  | { status: "error"; vlog?: never; error: string };

export function VideoDetailScreen() {
  const params = useParams<{ id?: string | string[] }>();
  const router = useRouter();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [state, setState] = useState<DetailState>({ status: "loading" });
  const viewState = useMemo<DetailState>(() => (id ? state : { status: "missing" }), [id, state]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const headerConfig = useMemo<AppHeaderConfig>(
    () => ({
      eyebrow: viewState.status === "ready" ? "Saved video" : "IdleDiary",
      title: viewState.status === "ready" ? viewState.vlog.title : "Saved entry",
      leading: (
        <Button asChild aria-label="Back to videos" size="icon" variant="outline">
          <Link href="/videos">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
      ),
    }),
    [viewState],
  );

  useAppHeader(headerConfig);

  useEffect(() => {
    document.title =
      viewState.status === "ready" ? `${viewState.vlog.title} | IdleDiary` : "Saved Video | IdleDiary";
  }, [viewState]);

  useEffect(() => {
    let mounted = true;

    if (!id) return;

    getVlog(id)
      .then(async (vlog) => {
        if (!mounted) return;
        if (!vlog) {
          setState({ status: "missing" });
          return;
        }

        if (vlog.needsAction === true) {
          try {
            await markVlogHandled(vlog.id);
          } catch (error) {
            reportError(error);
          }
        }

        if (mounted) {
          setState({
            status: "ready",
            vlog: vlog.needsAction === true ? { ...vlog, needsAction: false } : vlog,
          });
        }
      })
      .catch((error) => {
        const appError = reportError(error);
        if (mounted) setState({ status: "error", error: appError.userMessage });
      });

    return () => {
      mounted = false;
    };
  }, [id]);

  const handleDelete = async () => {
    if (state.status !== "ready") return;

    try {
      setIsDeleting(true);
      await deleteVlog(state.vlog.id);
      releaseVlogObjectUrl(state.vlog.id);
      setConfirmDelete(false);
      router.replace("/videos");
    } catch (error) {
      reportError(error);
      setIsDeleting(false);
    }
  };

  return (
    <main className="relative isolate h-[100svh] overflow-hidden bg-background">
      <motion.div
        className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col top-level-screen"
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -42 }}
        initial={{ opacity: 0, x: 42 }}
        transition={{ duration: 0.24, ease: "easeOut" }}
      >
        {viewState.status === "loading" ? (
          <LoadingVideoDetail />
        ) : viewState.status === "ready" ? (
          <SavedVideoDetail
            vlog={viewState.vlog}
            onDelete={() => setConfirmDelete(true)}
          />
        ) : (
          <MissingVideo error={viewState.status === "error" ? viewState.error : undefined} />
        )}
      </motion.div>
      <DebugDrawer />

      <ResponsiveConfirm
        actionLabel="Delete video"
        actionVariant="destructive"
        description="This removes the saved video from this device. Draft clips are not affected."
        disabled={isDeleting}
        open={confirmDelete}
        title="Delete this video?"
        onAction={handleDelete}
        onOpenChange={setConfirmDelete}
      />
    </main>
  );
}

function SavedVideoDetail({
  vlog,
  onDelete,
}: {
  vlog: VlogRecord;
  onDelete: () => void;
}) {
  return (
    <div className="relative z-10 flex h-[100svh] flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <VlogPlayer
          fullscreenLabel="Fullscreen saved video preview"
          openLabel="Open saved video fullscreen"
          vlog={vlog}
        />
      </div>

      <div className="grid shrink-0 gap-3 pb-1 pt-6">
        <Button className="h-14 text-base" type="button" onClick={() => shareVlog(vlog)}>
          <Share2 className="size-5" />
          Export
        </Button>
        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="outline" onClick={() => downloadVlog(vlog)}>
            <Download className="size-4" />
            Download
          </Button>
          <Button type="button" variant="destructive" onClick={onDelete}>
            <Trash2 className="size-4" />
            Delete
          </Button>
        </div>
        <SupportLink className="justify-self-center border-transparent bg-transparent text-muted-foreground hover:border-memory/25 hover:text-foreground" />
      </div>
    </div>
  );
}

function LoadingVideoDetail() {
  return (
    <div className="relative z-10 flex h-[100svh] flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div
          aria-label="Loading saved video"
          aria-busy="true"
          className="relative aspect-[9/16] h-full max-h-full w-auto max-w-full overflow-hidden rounded-lg border border-memory/30 bg-black"
          role="status"
        >
          <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-white/[0.03] to-white/[0.08]" />
          <div className="absolute inset-x-6 top-6 h-2 rounded-full bg-white/10" />
          <div className="absolute inset-x-10 bottom-8 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-memory/70" />
          </div>
          <div className="absolute inset-0 animate-pulse bg-memory/10" />
        </div>
      </div>

      <div className="grid shrink-0 gap-3 pb-1 pt-6">
        <Button className="h-14 text-base" disabled type="button">
          <Share2 className="size-5" />
          Export
        </Button>
        <div className="grid grid-cols-2 gap-3">
          <Button disabled type="button" variant="outline">
            <Download className="size-4" />
            Download
          </Button>
          <Button disabled type="button" variant="destructive">
            <Trash2 className="size-4" />
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

function MissingVideo({ error }: { error?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <h2 className="text-2xl font-semibold">Video not found</h2>
      <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
        {error ?? "This saved video is no longer available on this device."}
      </p>
      <Button asChild className="mt-6">
        <Link href="/videos">Back to saved videos</Link>
      </Button>
    </div>
  );
}
