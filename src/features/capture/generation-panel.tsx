"use client";

import { BookOpen, Check, Circle, Film, LockKeyhole, Music2, WandSparkles } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { GenerationProgress } from "@/features/generation/generation";

type GenerationPanelProps = {
  progress: GenerationProgress;
};

type GenerationStageId = "loading" | "mood" | "soundtrack" | "polishing" | "saving";

type GenerationStage = {
  id: GenerationStageId;
  label: string;
};

const stages: GenerationStage[] = [
  { id: "loading", label: "Opening your diary" },
  { id: "mood", label: "Finding the mood" },
  { id: "soundtrack", label: "Making the soundtrack" },
  { id: "polishing", label: "Polishing the video" },
  { id: "saving", label: "Saving your vlog" },
];

export function shouldShowLocalGenerationLogs(
  env = process.env.NODE_ENV,
  flag = process.env.NEXT_PUBLIC_IDLEDIARY_GENERATION_LOGS,
  hostname = typeof window === "undefined" ? "" : window.location.hostname,
) {
  return (
    env === "development" ||
    flag === "true" ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  );
}

export function activeGenerationStage(progress: Pick<GenerationProgress, "step" | "label" | "value">) {
  if (progress.step === "done") return "saving";
  if (progress.step === "saving") return "saving";
  if (progress.step === "rendering") return "polishing";
  if (progress.step === "writing") return progress.value >= 18 ? "soundtrack" : "mood";
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
  const showLocalLogs = shouldShowLocalGenerationLogs() && progress.step !== "idle";
  const localLogLines =
    progress.rawLogs.length > 0
      ? progress.rawLogs
      : [`${progress.label}: waiting for raw generation output...`];

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

      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-5 pb-6">
        <div
          className="relative w-full max-w-sm contain-layout contain-paint"
          data-generation-panel-content=""
        >
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
            {showLocalLogs ? (
              <div className="mt-3 rounded-lg border border-border/60 bg-black/28 px-3 py-2.5">
                <div className="mb-1 flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>Raw local output</span>
                  <span>{progress.rawLogs.length > 0 ? `${progress.rawLogs.length} lines` : "waiting"}</span>
                </div>
                <pre
                  aria-label="Raw local generation output"
                  className="max-h-28 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-4 text-foreground/82"
                >
                  {localLogLines.join("\n")}
                </pre>
              </div>
            ) : null}
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

  if (id === "mood") {
    return (
      <span aria-hidden="true" className={`flex justify-end ${activeClass}`}>
        <Film className="size-5 text-memory" />
      </span>
    );
  }

  if (id === "soundtrack") {
    return (
      <span aria-hidden="true" className={`flex justify-end ${activeClass}`}>
        <Music2 className="size-5 text-memory" />
      </span>
    );
  }

  if (id === "polishing") {
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
