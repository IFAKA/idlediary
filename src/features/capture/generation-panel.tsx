"use client";

import { Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { GenerationProgress } from "@/features/generation/generation";

type GenerationPanelProps = {
  progress: GenerationProgress;
};

const labels: Record<GenerationProgress["step"], string> = {
  idle: "Preparing",
  loading: "Loading local editor",
  writing: "Collecting clips",
  rendering: "Making the vlog",
  saving: "Saving result",
  done: "Done",
  error: "Generation failed",
};

export function GenerationPanel({ progress }: GenerationPanelProps) {
  return (
    <div className="relative z-10 flex min-h-[100svh] flex-col justify-end safe-screen">
      <div className="mb-6">
        <Loader2 className="mb-5 size-8 animate-spin text-primary" />
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          Finish
        </p>
        <h1 className="mt-2 text-3xl font-semibold">{labels[progress.step]}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          This happens on-device. Keep this screen open while the video is rendered.
        </p>
      </div>
      <Progress value={progress.value} />
    </div>
  );
}
