"use client";

import { Download, RefreshCcw, Share2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ResponsiveConfirm } from "@/components/responsive-confirm";
import { Button } from "@/components/ui/button";
import { getObjectUrlForVlog, retainVlogObjectUrl } from "@/features/clips/media-cache";
import type { VlogRecord } from "@/features/clips/types";
import { downloadVlog, shareVlog } from "@/features/share/share";
import { useHistoryOverlay } from "@/hooks/use-history-overlay";

type ResultPanelProps = {
  vlog: VlogRecord;
  onReset: () => void;
};

export function ResultPanel({ vlog, onReset }: ResultPanelProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const src = useMemo(() => getObjectUrlForVlog(vlog), [vlog]);
  const closePlayer = useHistoryOverlay({
    isOpen: isPlayerOpen,
    name: "result-preview",
    onClose: () => setIsPlayerOpen(false),
  });

  useEffect(() => {
    retainVlogObjectUrl(vlog.id);
  }, [vlog.id]);

  return (
    <div className="relative z-10 flex h-[100svh] flex-col overflow-hidden top-level-screen">
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <button
          aria-label="Open generated video fullscreen"
          className="relative aspect-[9/16] h-full max-h-full w-auto max-w-full overflow-hidden rounded-lg border border-memory/30 bg-black outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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

      <BodyPortal>
        <AnimatePresence>
          {isPlayerOpen && src ? (
            <FullscreenResultPlayer src={src} onClose={closePlayer} />
          ) : null}
        </AnimatePresence>
      </BodyPortal>

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
  onClose,
}: {
  src: string;
  onClose: () => void;
}) {
  useBodyScrollLock();
  useEscapeClose(onClose);

  return (
    <motion.div
      className="fixed inset-0 z-[100] h-[100svh] overflow-hidden bg-black safe-screen"
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
    >
      <div className="relative h-full w-full overflow-hidden bg-black">
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

function useEscapeClose(onClose: () => void) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
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

function BodyPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;

  return createPortal(children, document.body);
}
