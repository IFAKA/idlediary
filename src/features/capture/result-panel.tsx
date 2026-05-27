"use client";

import { Check, Share2 } from "lucide-react";
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
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <VlogPlayer
          fullscreenLabel="Fullscreen generated video preview"
          openLabel="Open generated video fullscreen"
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
