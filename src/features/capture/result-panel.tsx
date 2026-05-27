"use client";

import confetti from "canvas-confetti";
import { Check, Share2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { VlogRecord } from "@/features/clips/types";
import { VlogPlayer } from "@/features/clips/vlog-player";

type ResultPanelProps = {
  vlog: VlogRecord;
  onDone: () => void;
  onExport: () => void;
};

export function ResultPanel({ vlog, onDone, onExport }: ResultPanelProps) {
  return (
    <div className="relative z-10 flex h-[100svh] flex-col overflow-hidden top-level-screen">
      <SuccessConfetti />

      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center">
        <VlogPlayer
          fullscreenLabel="Fullscreen generated video preview"
          openLabel="Open generated video fullscreen"
          showOpenAffordance
          vlog={vlog}
        />
      </div>

      <div className="relative z-10 grid shrink-0 gap-3 pb-1 pt-6">
        <Button className="h-14 text-base" type="button" onClick={onExport}>
          <Share2 className="size-5" />
          Export
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          <Check className="size-4" />
          Done
        </Button>
      </div>
    </div>
  );
}

function SuccessConfetti() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    const burst = confetti.create(canvas, {
      resize: true,
      useWorker: true,
    });
    const colors = ["#f58aa8", "#f5d56b", "#8dd9c7", "#b79cf2", "#ffffff"];
    const base = {
      colors,
      disableForReducedMotion: true,
      gravity: 0.74,
      origin: { x: 0.5, y: 0.46 },
      scalar: 0.92,
      ticks: 155,
    } satisfies confetti.Options;

    burst({
      ...base,
      angle: 90,
      particleCount: 82,
      spread: 92,
      startVelocity: 42,
    });

    const sideBursts = window.setTimeout(() => {
      burst({
        ...base,
        angle: 64,
        origin: { x: 0.42, y: 0.48 },
        particleCount: 38,
        spread: 58,
        startVelocity: 34,
      });
      burst({
        ...base,
        angle: 116,
        origin: { x: 0.58, y: 0.48 },
        particleCount: 38,
        spread: 58,
        startVelocity: 34,
      });
    }, 170);

    return () => {
      window.clearTimeout(sideBursts);
      burst.reset();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 h-full w-full"
      data-testid="success-confetti"
    />
  );
}
