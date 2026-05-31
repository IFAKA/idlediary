"use client";

import { AnimatePresence, motion } from "motion/react";
import { Play, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { getObjectUrlForVlog, retainVlogObjectUrl } from "@/features/clips/media-cache";
import type { VlogRecord } from "@/features/clips/types";
import { useHistoryOverlay } from "@/hooks/use-history-overlay";
import { spring } from "@/lib/motion";

type VlogPlayerProps = {
  vlog: VlogRecord;
  openLabel: string;
  fullscreenLabel: string;
  showOpenAffordance?: boolean;
};

export function VlogPlayer({
  vlog,
  openLabel,
  fullscreenLabel,
  showOpenAffordance = false,
}: VlogPlayerProps) {
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const src = useMemo(() => getObjectUrlForVlog(vlog), [vlog]);
  const previewLayoutId = `vlog-preview-${vlog.id}`;
  const closePlayer = useHistoryOverlay({
    isOpen: isPlayerOpen,
    name: "vlog-preview",
    onClose: () => setIsPlayerOpen(false),
  });

  useEffect(() => {
    retainVlogObjectUrl(vlog.id);
  }, [vlog.id]);

  return (
    <>
      <motion.button
        aria-label={openLabel}
        className="relative aspect-[9/16] h-full max-h-full w-auto max-w-full overflow-hidden rounded-lg border border-memory/30 bg-black outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        layoutId={previewLayoutId}
        transition={spring}
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
        {showOpenAffordance ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 grid place-items-center bg-black/10"
            data-testid="generated-video-open-affordance"
          >
            <span className="grid size-16 place-items-center rounded-full border border-white/50 bg-black/45 text-white shadow-[0_18px_56px_rgba(0,0,0,0.38)] backdrop-blur-md">
              <Play className="ml-1 size-8 fill-current" strokeWidth={2.4} />
            </span>
          </span>
        ) : null}
      </motion.button>

      <BodyPortal>
        <AnimatePresence>
          {isPlayerOpen && src ? (
            <FullscreenVlogPlayer
              label={fullscreenLabel}
              layoutId={previewLayoutId}
              src={src}
              onClose={closePlayer}
            />
          ) : null}
        </AnimatePresence>
      </BodyPortal>
    </>
  );
}

function FullscreenVlogPlayer({
  label,
  layoutId,
  src,
  onClose,
}: {
  label: string;
  layoutId: string;
  src: string;
  onClose: () => void;
}) {
  useBodyScrollLock();

  return (
    <motion.div
      className="fixed inset-0 z-[100] h-[100svh] overflow-hidden bg-black"
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
    >
      <motion.div
        className="grid h-full w-full place-items-center overflow-hidden bg-black"
        layoutId={layoutId}
        transition={spring}
      >
        <div className="relative aspect-[9/16] h-full max-h-full max-w-full overflow-hidden bg-black">
          <video
            aria-label={label}
            autoPlay
            className="h-full w-full object-contain"
            controls
            playsInline
            preload="auto"
            src={src}
          />
          <button
            aria-label="Close fullscreen preview"
            className="absolute right-2 top-2 z-10 grid size-11 place-items-center rounded-full border border-white/25 bg-black/55 text-white shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-md transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            type="button"
            onClick={onClose}
          >
            <X className="size-5" strokeWidth={2.5} />
          </button>
        </div>
      </motion.div>
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

function BodyPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;

  return createPortal(children, document.body);
}
