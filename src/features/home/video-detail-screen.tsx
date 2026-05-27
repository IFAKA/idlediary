"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Download, Share2, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useAppHeader, type AppHeaderConfig } from "@/components/app-header-shell";
import { ResponsiveConfirm } from "@/components/responsive-confirm";
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

        let handledVlog = vlog;
        if (vlog.needsAction) {
          try {
            handledVlog = (await markVlogHandled(vlog.id)) ?? vlog;
          } catch (error) {
            reportError(error);
          }
        }
        if (mounted) {
          setState({ status: "ready", vlog: handledVlog ?? vlog });
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
          <div className="flex h-full min-h-80 items-center justify-center text-sm text-muted-foreground">
            Loading video...
          </div>
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
