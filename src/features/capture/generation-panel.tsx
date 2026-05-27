"use client";

import { Check, Circle, Disc3, FileVideo2 } from "lucide-react";
import { useEffect, useState } from "react";
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

const reassuranceDelayMs = 8_000;

const stages: GenerationStage[] = [
  { id: "loading", label: "Starting editor" },
  { id: "writing", label: "Collecting clips" },
  { id: "normalizing", label: "Normalizing" },
  { id: "encoding", label: "Encoding" },
  { id: "saving", label: "Saving" },
];

export function activeGenerationStage(progress: Pick<GenerationProgress, "step" | "label" | "value">) {
  if (progress.step === "done") return "saving";
  if (progress.step === "saving") return "saving";
  if (progress.step === "rendering") {
    return progress.label === "Encoding MP4" || progress.value >= 78 ? "encoding" : "normalizing";
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
  const logs = progress.logs.slice(-5);
  const activeStage = activeGenerationStage(progress);
  const completedStages = completedGenerationStages(progress);
  const [reassuranceStep, setReassuranceStep] = useState<GenerationProgress["step"] | null>(null);
  const showReassurance =
    reassuranceStep === progress.step && progress.step !== "done" && progress.step !== "error";

  useEffect(() => {
    if (progress.step === "done" || progress.step === "error") {
      return;
    }

    const timer = window.setTimeout(
      () => setReassuranceStep(progress.step),
      reassuranceDelayMs,
    );
    return () => window.clearTimeout(timer);
  }, [progress.step]);

  return (
    <div className="relative z-10 flex h-[100svh] flex-col justify-end overflow-hidden top-level-screen">
      <div
        aria-hidden="true"
        className="absolute inset-x-[-18%] bottom-6 h-72 bg-[radial-gradient(circle,hsl(var(--memory)/0.18),transparent_62%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-28 top-[var(--app-header-background-start)] overflow-hidden rounded-lg border border-memory/20 bg-surface-soft/45 p-4 text-[11px] leading-5 text-memory/40 [mask-image:linear-gradient(to_bottom,transparent,black_18%,black_72%,transparent)]"
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

      <div className="relative mb-6 w-full max-w-sm">
        <div className="mb-5 flex items-center gap-3 text-memory" aria-hidden="true">
          <Disc3 className="size-8 animate-spin motion-reduce:animate-none" />
          <div className="relative h-8 w-20 overflow-hidden rounded-full border border-memory/25 bg-black/20">
            <span className="absolute left-3 top-1/2 size-2 -translate-y-1/2 rounded-full bg-memory/70 animate-[local-orbit_1.6s_linear_infinite] motion-reduce:animate-none" />
            <span
              className="absolute left-8 top-1/2 size-2 -translate-y-1/2 rounded-full bg-primary/80 animate-[local-orbit_1.6s_linear_infinite] motion-reduce:animate-none"
              style={{ animationDelay: "0.18s" }}
            />
            <span
              className="absolute left-[52px] top-1/2 size-2 -translate-y-1/2 rounded-full bg-accent/80 animate-[local-orbit_1.6s_linear_infinite] motion-reduce:animate-none"
              style={{ animationDelay: "0.36s" }}
            />
          </div>
        </div>

        <ol className="relative mb-5 grid gap-2">
          {stages.map((stage) => {
            const isActive = stage.id === activeStage;
            const isComplete = completedStages.has(stage.id);

            return (
              <li
                key={stage.id}
                className={`relative grid min-h-12 grid-cols-[32px_minmax(0,1fr)_72px] items-center gap-3 overflow-hidden rounded-lg border px-3 py-2 transition ${
                  isActive
                    ? "border-memory/60 bg-memory/15 text-foreground shadow-[0_0_24px_hsl(var(--memory)/0.16)]"
                    : isComplete
                      ? "border-memory/24 bg-surface-soft/58 text-foreground"
                      : "border-border/70 bg-black/18 text-muted-foreground"
                } motion-reduce:transition-none`}
              >
                {isActive ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 -left-20 w-24 rotate-6 bg-memory/12 blur-sm animate-[generation-shine_1.8s_ease-in-out_infinite] motion-reduce:hidden"
                  />
                ) : null}
                <span
                  className={`relative inline-flex size-8 items-center justify-center rounded-full border ${
                    isComplete
                      ? "border-memory bg-memory text-memory-foreground"
                      : isActive
                        ? "border-memory/70 bg-memory/18 text-memory animate-pulse motion-reduce:animate-none"
                        : "border-muted-foreground/30 bg-black/24 text-muted-foreground/70"
                  }`}
                >
                  {isComplete ? (
                    <Check className="size-4" aria-hidden="true" />
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

        <div aria-live="polite">
          <p className="text-sm leading-6 text-muted-foreground">
            {progress.detail}
          </p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-memory/80">
            {progress.label}
          </p>
          {showReassurance ? (
            <p className="mt-3 rounded-lg border border-memory/20 bg-black/25 px-3 py-2 text-xs leading-5 text-muted-foreground">
              Still working locally. Your clips are safe.
            </p>
          ) : null}
        </div>
      </div>
      <Progress indicatorClassName="bg-memory" value={progress.value} />
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
      <span
        aria-hidden="true"
        className={`relative h-7 w-16 ${activeClass}`}
        data-generation-motion="decorative-loop"
      >
        <span className="absolute left-1 top-2.5 size-2 rounded-full bg-memory animate-[local-orbit_1.5s_linear_infinite] motion-reduce:animate-none" />
        <span
          className="absolute left-7 top-2.5 size-2 rounded-full bg-primary animate-[local-orbit_1.5s_linear_infinite] motion-reduce:animate-none"
          style={{ animationDelay: "0.2s" }}
        />
        <span
          className="absolute left-[52px] top-2.5 size-2 rounded-full bg-accent animate-[local-orbit_1.5s_linear_infinite] motion-reduce:animate-none"
          style={{ animationDelay: "0.4s" }}
        />
      </span>
    );
  }

  if (id === "writing") {
    return (
      <span aria-hidden="true" className={`relative h-7 w-16 ${activeClass}`}>
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className={`absolute h-3 w-8 rounded-sm border border-memory/35 bg-memory/20 ${
              active ? "animate-[clip-stack_1.8s_ease-in-out_infinite] motion-reduce:animate-none" : ""
            }`}
            style={{
              animationDelay: `${index * 0.14}s`,
              left: `${index * 10}px`,
              top: `${4 + index * 3}px`,
            }}
          />
        ))}
      </span>
    );
  }

  if (id === "normalizing" || id === "encoding") {
    return (
      <span aria-hidden="true" className={`flex h-7 w-16 items-center gap-1 ${activeClass}`}>
        {[0, 1, 2, 3, 4].map((index) => (
          <span
            key={index}
            className={`h-6 w-2 rounded-[2px] bg-memory/45 ${
              active ? "animate-[video-frame_1.3s_ease-in-out_infinite] motion-reduce:animate-none" : ""
            }`}
            style={{ animationDelay: `${index * 0.08}s` }}
          />
        ))}
      </span>
    );
  }

  return (
    <span aria-hidden="true" className={`relative flex h-7 w-16 items-center justify-center ${activeClass}`}>
      <FileVideo2
        className={`size-6 text-memory ${
          active ? "animate-[card-land_1.6s_ease-in-out_infinite] motion-reduce:animate-none" : ""
        }`}
      />
    </span>
  );
}
