"use client";

import { AnimatePresence, motion } from "motion/react";
import { Play } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { getObjectUrlForVlog, retainVlogObjectUrl } from "@/features/clips/media-cache";
import type { VlogRecord } from "@/features/clips/types";
import { useHistoryOverlay } from "@/hooks/use-history-overlay";

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
      <button
        aria-label={openLabel}
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
      </button>

      <BodyPortal>
        <AnimatePresence>
          {isPlayerOpen && src ? (
            <FullscreenVlogPlayer
              label={fullscreenLabel}
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
  src,
  onClose,
}: {
  label: string;
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
          aria-label={label}
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
