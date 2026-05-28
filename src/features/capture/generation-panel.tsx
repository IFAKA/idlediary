"use client";

import {
  BookOpen,
  Check,
  Circle,
  Film,
  LoaderCircle,
  LockKeyhole,
  WandSparkles,
} from "lucide-react";
import { motion } from "motion/react";
import { Progress } from "@/components/ui/progress";
import type { GenerationProgress } from "@/features/generation/generation";
import { spring } from "@/lib/motion";

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
    <div className="relative z-10 flex h-[100svh] flex-col overflow-hidden top-level-screen">
      <div
        aria-hidden="true"
        className="absolute inset-x-[-22%] bottom-[-7rem] h-[34rem] bg-[radial-gradient(circle_at_50%_55%,hsl(var(--memory)/0.26),transparent_58%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-24 top-[var(--app-header-background-start)] overflow-hidden bg-[linear-gradient(180deg,transparent,hsl(var(--surface-soft)/0.56)_44%,transparent)] [mask-image:linear-gradient(to_bottom,transparent,black_16%,black_76%,transparent)]"
      />
      <div
        aria-hidden="true"
        className="absolute bottom-40 left-5 size-2 rounded-full bg-primary/60 shadow-[64px_-42px_0_hsl(var(--memory)/0.42),154px_18px_0_hsl(var(--primary)/0.36),246px_-28px_0_hsl(var(--accent)/0.38)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-5 bottom-28 h-px bg-gradient-to-r from-transparent via-memory/28 to-transparent"
      />

      <div className="relative flex min-h-0 flex-1 flex-col justify-center pb-6">
        <motion.div className="relative w-full max-w-sm" layout transition={spring}>
          <ol className="relative mb-5 grid gap-2">
            {stages.map((stage) => {
              const isActive = stage.id === activeStage;
              const isComplete = completedStages.has(stage.id);

              return (
                <li
                  key={stage.id}
                  className={`relative grid min-h-14 grid-cols-[36px_minmax(0,1fr)_36px] items-center gap-3 overflow-hidden rounded-lg border px-3 py-2.5 transition ${
                    isActive
                      ? "border-memory/55 bg-memory/16 text-foreground shadow-[0_0_28px_hsl(var(--memory)/0.18)]"
                      : isComplete
                        ? "border-memory/24 bg-surface-soft/54 text-foreground"
                        : "border-border/62 bg-black/14 text-muted-foreground"
                  } motion-reduce:transition-none`}
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
                      <LoaderCircle
                        className="size-4 animate-spin motion-reduce:animate-none"
                        aria-hidden="true"
                      />
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

          <motion.div aria-live="polite" layout transition={spring}>
            <p className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-memory/85">
              <LockKeyhole className="size-3.5" aria-hidden="true" />
              Your clips and video stay private on this device.
            </p>
          </motion.div>
        </motion.div>
      </div>
      <Progress
        className="bg-memory/22"
        indicatorClassName="bg-gradient-to-r from-primary via-memory to-accent"
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
        <BookOpen
          className={`size-5 text-memory ${
            active ? "animate-[sparkle-breathe_1.7s_ease-in-out_infinite] motion-reduce:animate-none" : ""
          }`}
        />
      </span>
    );
  }

  if (id === "writing") {
    return (
      <span aria-hidden="true" className={`flex justify-end ${activeClass}`}>
        <Film
          className={`size-5 text-memory ${
            active ? "animate-[card-land_1.8s_ease-in-out_infinite] motion-reduce:animate-none" : ""
          }`}
        />
      </span>
    );
  }

  if (id === "normalizing" || id === "encoding") {
    return (
      <span aria-hidden="true" className={`flex justify-end ${activeClass}`}>
        <WandSparkles
          className={`size-5 text-memory ${
            active ? "animate-[sparkle-breathe_1.45s_ease-in-out_infinite] motion-reduce:animate-none" : ""
          }`}
        />
      </span>
    );
  }

  return (
    <span aria-hidden="true" className={`flex justify-end ${activeClass}`}>
      <LockKeyhole
        className={`size-6 text-memory ${
          active ? "animate-[sparkle-breathe_1.7s_ease-in-out_infinite] motion-reduce:animate-none" : ""
        }`}
      />
    </span>
  );
}
