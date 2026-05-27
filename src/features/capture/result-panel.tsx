"use client";

import Link from "next/link";
import { Download, RefreshCcw, Share2 } from "lucide-react";
import { useState } from "react";
import { ResponsiveConfirm } from "@/components/responsive-confirm";
import { Button } from "@/components/ui/button";
import type { VlogRecord } from "@/features/clips/types";
import { VlogPlayer } from "@/features/clips/vlog-player";
import { downloadVlog, shareVlog } from "@/features/share/share";

type ResultPanelProps = {
  vlog: VlogRecord;
  onReset: () => void;
};

export function ResultPanel({ vlog, onReset }: ResultPanelProps) {
  const [confirmReset, setConfirmReset] = useState(false);

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
          <Button asChild variant="secondary">
            <Link href="/videos">
              View saved videos
            </Link>
          </Button>
        </div>
      </div>

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
