"use client";

import {
  BookOpen,
  Check,
  Circle,
  Film,
  LockKeyhole,
  WandSparkles,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { GenerationProgress } from "@/features/generation/generation";

type GenerationPanelProps = {
  progress: GenerationProgress;
};

type GenerationStageId = "loading" | "writing" | "normalizing" | "encoding" | "saving";

type GenerationStage = {
  id: GenerationStageId;
  label: string;
};

const stages: GenerationStage[] = [
  { id: "loading", label: "Opening your diary" },
  { id: "writing", label: "Gathering moments" },
  { id: "normalizing", label: "Assembling MP4" },
  { id: "encoding", label: "Making playback ready" },
  { id: "saving", label: "Saving privately" },
];

export function activeGenerationStage(progress: Pick<GenerationProgress, "step" | "label" | "value">) {
  if (progress.step === "done") return "saving";
  if (progress.step === "saving") return "saving";
  if (progress.step === "rendering") {
    return progress.value >= 78 ? "encoding" : "normalizing";
  }
  if (progress.step === "writing") return "writing";
  return "loading";
}

export function completedGenerationStages(
  progress: Pick<GenerationProgress, "step" | "label" | "value">,
) {
  const activeStage = activeGenerationStage(progress);
  const activeIndex = stages.findIndex((stage) => stage.id === activeStage);
  const completed = new Set<GenerationStageId>(
    stages.slice(0, Math.max(0, activeIndex)).map((stage) => stage.id),
  );

  if (progress.step === "done") {
    stages.forEach((stage) => completed.add(stage.id));
  }

  return completed;
}

export function GenerationPanel({ progress }: GenerationPanelProps) {
  const activeStage = activeGenerationStage(progress);
  const completedStages = completedGenerationStages(progress);

  return (
    <div className="relative z-10 flex h-[100svh] flex-col overflow-hidden bg-background top-level-screen">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-24 top-[var(--app-header-background-start)] bg-surface-soft/36"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-5 bottom-28 h-px bg-gradient-to-r from-transparent via-memory/28 to-transparent"
      />

      <div className="relative flex min-h-0 flex-1 flex-col justify-center pb-6">
        <div className="relative w-full max-w-sm contain-layout contain-paint">
          <ol className="relative mb-5 grid gap-2 contain-layout contain-paint">
            {stages.map((stage) => {
              const isActive = stage.id === activeStage;
              const isComplete = completedStages.has(stage.id);

              return (
                <li
                  key={stage.id}
                  className={`relative grid min-h-14 grid-cols-[36px_minmax(0,1fr)_36px] items-center gap-3 overflow-hidden rounded-lg border px-3 py-2.5 ${
                    isActive
                      ? "border-memory/55 bg-memory/16 text-foreground"
                      : isComplete
                        ? "border-memory/24 bg-surface-soft/54 text-foreground"
                        : "border-border/62 bg-black/14 text-muted-foreground"
                  }`}
                >
                  {isActive ? (
                    <span
                      aria-hidden="true"
                      className="generation-step-shimmer motion-reduce:hidden"
                    />
                  ) : null}
                  <span
                    className={`relative inline-flex size-8 items-center justify-center rounded-full border ${
                      isComplete
                        ? "border-memory bg-memory text-memory-foreground"
                        : isActive
                          ? "border-memory/70 bg-memory/18 text-memory"
                          : "border-muted-foreground/30 bg-black/24 text-muted-foreground/70"
                    }`}
                  >
                    {isComplete ? (
                      <Check className="size-4" aria-hidden="true" />
                    ) : isActive ? (
                      <span className="size-2.5 rounded-full bg-memory" aria-hidden="true" />
                    ) : (
                      <Circle className="size-3" aria-hidden="true" />
                    )}
                  </span>
                  <span className="relative min-w-0 text-sm font-semibold leading-5">
                    {stage.label}
                  </span>
                  <StageVisual active={isActive} complete={isComplete} id={stage.id} />
                </li>
              );
            })}
          </ol>

          <div aria-live="polite" className="min-h-5">
            <div className="rounded-lg border border-memory/22 bg-black/18 px-3 py-2.5">
              <p className="text-sm font-semibold leading-5 text-foreground">
                {progress.label}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {progress.detail}
              </p>
            </div>
            <p className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-memory/85">
              <LockKeyhole className="size-3.5" aria-hidden="true" />
              Your clips and video stay private on this device.
            </p>
          </div>
        </div>
      </div>
      <Progress
        className="bg-memory/22"
        indicatorClassName="bg-memory transition-none"
        value={progress.value}
      />
    </div>
  );
}

function StageVisual({
  active,
  complete,
  id,
}: {
  active: boolean;
  complete: boolean;
  id: GenerationStageId;
}) {
  const activeClass = active ? "opacity-100" : complete ? "opacity-80" : "opacity-35";

  if (id === "loading") {
    return (
      <span aria-hidden="true" className={`flex justify-end ${activeClass}`}>
        <BookOpen className="size-5 text-memory" />
      </span>
    );
  }

  if (id === "writing") {
    return (
      <span aria-hidden="true" className={`flex justify-end ${activeClass}`}>
        <Film className="size-5 text-memory" />
      </span>
    );
  }

  if (id === "normalizing" || id === "encoding") {
    return (
      <span aria-hidden="true" className={`flex justify-end ${activeClass}`}>
        <WandSparkles className="size-5 text-memory" />
      </span>
    );
  }

  return (
    <span aria-hidden="true" className={`flex justify-end ${activeClass}`}>
      <LockKeyhole className="size-6 text-memory" />
    </span>
  );
}
