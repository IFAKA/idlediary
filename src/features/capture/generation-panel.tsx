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
    <div className="relative z-10 flex h-[100svh] flex-col justify-end overflow-hidden safe-screen">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-28 top-8 overflow-hidden rounded-sm border border-border/50 bg-muted/20 p-4 font-mono text-[10px] leading-5 text-muted-foreground/60 [mask-image:linear-gradient(to_bottom,transparent,black_18%,black_72%,transparent)]"
      >
        <p>{progress.technical}</p>
        <p>fflags +genpts</p>
        <p>avoid_negative_ts make_zero</p>
        <p>movflags +faststart</p>
        {logs.map((log, index) => (
          <p key={`${log}-${index}`} className="truncate">
            {log}
          </p>
        ))}
      </div>

      <div className="relative mb-6">
        <Loader2 className="mb-5 size-8 animate-spin text-primary" aria-hidden="true" />
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          Finish
        </p>
        <h1 className="mt-2 text-3xl font-semibold">{progress.label}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {progress.detail}
        </p>
      </div>
      <Progress value={progress.value} />
    </div>
  );
}
