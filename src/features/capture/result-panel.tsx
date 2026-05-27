"use client";

import { Check, Share2 } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import type { VlogRecord } from "@/features/clips/types";
import { VlogPlayer } from "@/features/clips/vlog-player";

type ResultPanelProps = {
  vlog: VlogRecord;
  onDone: () => void;
  onExport: () => void;
};

const confettiPieces = Array.from({ length: 34 }, (_, index) => ({
  id: index,
  color: ["#f58aa8", "#f5d56b", "#8dd9c7", "#b79cf2", "#ffffff"][index % 5],
  delay: (index % 9) * 0.045,
  left: 8 + ((index * 17) % 84),
  rotate: (index % 2 === 0 ? 1 : -1) * (90 + (index % 7) * 18),
  x: ((index * 29) % 180) - 90,
  y: 220 + ((index * 23) % 180),
}));

export function ResultPanel({ vlog, onDone, onExport }: ResultPanelProps) {
  return (
    <div className="relative z-10 flex h-[100svh] flex-col overflow-hidden top-level-screen">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[52svh] overflow-hidden"
        data-testid="success-confetti"
      >
        {confettiPieces.map((piece) => (
          <motion.span
            key={piece.id}
            className="absolute top-0 rounded-[2px]"
            style={{
              backgroundColor: piece.color,
              height: piece.id % 3 === 0 ? 14 : 10,
              left: `${piece.left}%`,
              width: piece.id % 4 === 0 ? 5 : 8,
            }}
            animate={{
              opacity: [0, 1, 1, 0],
              rotate: [0, piece.rotate],
              x: [0, piece.x],
              y: [0, piece.y],
            }}
            initial={{ opacity: 0, y: -22 }}
            transition={{
              delay: piece.delay,
              duration: 1.9,
              ease: [0.16, 1, 0.3, 1],
              times: [0, 0.12, 0.78, 1],
            }}
          />
        ))}
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center">
        <VlogPlayer
          fullscreenLabel="Fullscreen generated video preview"
          openLabel="Open generated video fullscreen"
          showOpenAffordance
          vlog={vlog}
        />
      </div>

      <div className="grid shrink-0 gap-3 pb-1 pt-6">
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
