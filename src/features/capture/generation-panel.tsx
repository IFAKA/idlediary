"use client";

import { Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { GenerationProgress } from "@/features/generation/generation";

type GenerationPanelProps = {
  progress: GenerationProgress;
};

export function GenerationPanel({ progress }: GenerationPanelProps) {
  const logs = progress.logs.slice(-5);

  return (
    <div className="relative z-10 flex h-[100svh] flex-col justify-end overflow-hidden top-level-screen">
      <div
        aria-hidden="true"
        className="absolute inset-x-[-20%] bottom-10 h-64 bg-[radial-gradient(circle,hsl(var(--memory)/0.16),transparent_62%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-28 top-8 overflow-hidden rounded-lg border border-memory/25 bg-surface-soft/60 p-4 text-[11px] leading-5 text-memory/45 [mask-image:linear-gradient(to_bottom,transparent,black_18%,black_72%,transparent)]"
      >
        <p>Arranging today&apos;s saved moments</p>
        <p>Keeping the entry local</p>
        <p>Preparing a quiet playback copy</p>
        <p>{progress.technical}</p>
        <p>movflags +faststart</p>
        {logs.map((log, index) => (
          <p key={`${log}-${index}`} className="truncate">
            {log}
          </p>
        ))}
      </div>

      <div className="relative mb-6 max-w-sm">
        <Loader2 className="mb-5 size-8 animate-spin text-memory" aria-hidden="true" />
        <p className="text-sm leading-6 text-muted-foreground">
          {progress.detail}
        </p>
      </div>
      <Progress indicatorClassName="bg-memory" value={progress.value} />
    </div>
  );
}
