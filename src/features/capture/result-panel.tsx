"use client";

import { Download, RefreshCcw, Share2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { ResponsiveConfirm } from "@/components/responsive-confirm";
import { Button } from "@/components/ui/button";
import { getObjectUrlForVlog, retainVlogObjectUrl } from "@/features/clips/media-cache";
import type { VlogRecord } from "@/features/clips/types";
import { downloadVlog, shareVlog } from "@/features/share/share";

type ResultPanelProps = {
  vlog: VlogRecord;
  onClose: () => void;
  onReset: () => void;
};

export function ResultPanel({ vlog, onClose, onReset }: ResultPanelProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const src = useMemo(() => getObjectUrlForVlog(vlog), [vlog]);

  useEffect(() => {
    retainVlogObjectUrl(vlog.id);
  }, [vlog.id]);

  return (
    <div className="relative z-10 flex h-[100svh] flex-col overflow-hidden safe-screen">
      <AppHeader
        className="relative z-[60]"
        eyebrow="Ready"
        title={vlog.title}
        trailing={
          <Button
            aria-label="Back to recording"
            className="mr-14 shrink-0 bg-black/35 backdrop-blur hover:bg-black/50"
            size="icon"
            type="button"
            variant="ghost"
            onClick={onClose}
          >
            <X className="size-5" />
          </Button>
        }
      />

      <div className="mt-5 flex min-h-0 flex-1 items-center justify-center">
        <button
          aria-label="Open generated video fullscreen"
          className="relative aspect-[9/16] h-full max-h-full w-auto max-w-full overflow-hidden rounded-lg border bg-black outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          type="button"
          onClick={() => setIsPlayerOpen(true)}
        >
          <video
            aria-hidden="true"
            autoPlay
            className="h-full w-full object-cover"
            loop
            muted
            playsInline
            preload="auto"
            src={src ?? undefined}
          />
        </button>
      </div>

      <p className="mt-4 shrink-0 text-sm leading-6 text-muted-foreground">{vlog.caption}</p>

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
          <Button type="button" variant="secondary" onClick={() => setConfirmReset(true)}>
            <RefreshCcw className="size-4" />
            New recording
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {isPlayerOpen && src ? (
          <FullscreenResultPlayer src={src} title={vlog.title} onClose={() => setIsPlayerOpen(false)} />
        ) : null}
      </AnimatePresence>

      <ResponsiveConfirm
        actionLabel="New recording"
        description="This leaves the result screen and returns to the camera. Your generated video stays saved locally."
        open={confirmReset}
        title="Start a new recording?"
        onAction={onReset}
        onOpenChange={setConfirmReset}
      />
    </div>
  );
}

function FullscreenResultPlayer({
  src,
  title,
  onClose,
}: {
  src: string;
  title: string;
  onClose: () => void;
}) {
  useBodyScrollLock();

  return (
    <motion.div
      className="fixed inset-0 z-50 flex h-[100svh] flex-col overflow-hidden bg-black safe-screen"
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
    >
      <AppHeader
        className="relative z-[60]"
        eyebrow="Preview"
        title={title}
        titleAs="h2"
        trailing={
          <Button
            aria-label="Close generated video preview"
            className="mr-14 shrink-0 bg-black/55 backdrop-blur"
            size="icon"
            type="button"
            variant="ghost"
            onClick={onClose}
          >
            <X className="size-5" />
          </Button>
        }
      />
      <div className="relative mt-4 min-h-0 flex-1 overflow-hidden rounded-lg border bg-black">
        <video
          aria-label="Fullscreen generated video preview"
          autoPlay
          className="h-full w-full object-contain"
          controls
          playsInline
          preload="auto"
          src={src}
        />
      </div>
    </motion.div>
  );
}

function useBodyScrollLock() {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);
}
