import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generationProgress } from "@/features/generation/generation";
import {
  activeGenerationStage,
  completedGenerationStages,
  GenerationPanel,
  shouldShowLocalGenerationLogs,
} from "./generation-panel";

describe("GenerationPanel", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
    }
    container?.remove();
    container = null;
    root = null;
    vi.useRealTimers();
  });

  function renderPanel(progress = generationProgress("rendering", 52, { label: "Polishing the video" })) {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => {
      root?.render(<GenerationPanel progress={progress} />);
    });

    return container;
  }

  it("maps progress phases to visible stepper stages", () => {
    expect(activeGenerationStage(generationProgress("idle", 0))).toBe("loading");
    expect(activeGenerationStage(generationProgress("loading", 8))).toBe("loading");
    expect(activeGenerationStage(generationProgress("writing", 14))).toBe("mood");
    expect(activeGenerationStage(generationProgress("writing", 18))).toBe("soundtrack");
    expect(activeGenerationStage(generationProgress("rendering", 24))).toBe("polishing");
    expect(activeGenerationStage(generationProgress("saving", 94))).toBe("saving");
    expect(activeGenerationStage(generationProgress("done", 100))).toBe("saving");
  });

  it("marks earlier stages complete and all stages complete when done", () => {
    expect([
      ...completedGenerationStages(generationProgress("rendering", 78)),
    ]).toEqual(["loading", "mood", "soundtrack"]);

    expect([...completedGenerationStages(generationProgress("done", 100))]).toEqual([
      "loading",
      "mood",
      "soundtrack",
      "polishing",
      "saving",
    ]);
  });

  it("keeps the friendly stages, privacy note, progress bar, and lightweight export visuals visible", () => {
    const view = renderPanel(
      generationProgress("rendering", 56, {
        label: "Polishing the video",
        detail: "Balancing sound and color",
        logs: ["concat demuxer stream copy"],
        rawLogs: ["concat demuxer stream copy"],
      }),
    );

    expect(view.textContent).toContain("Opening your diary");
    expect(view.textContent).toContain("Finding the mood");
    expect(view.textContent).toContain("Making the soundtrack");
    expect(view.textContent).toContain("Polishing the video");
    expect(view.textContent).toContain("Saving your vlog");
    expect(view.textContent).toContain("Balancing sound and color");
    expect(view.textContent).not.toContain("Assembling MP4");
    expect(view.textContent).not.toContain("Finishing audio mix");
    expect(view.textContent).not.toContain("Rendering video");
    expect(view.textContent).toContain("Your clips and video stay private on this device.");
    expect(view.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(view.querySelector("[data-generation-panel-content]")?.parentElement?.className).toContain(
      "items-center",
    );
    expect(view.querySelector(".generation-spinner")).toBeNull();
    expect(view.querySelector(".generation-step-shimmer")).not.toBeNull();
    expect(view.querySelector(".generation-step-shimmer")?.className).toContain("motion-reduce:hidden");
  });

  it("shows live FFmpeg output only for local diagnostics", () => {
    expect(shouldShowLocalGenerationLogs("development", undefined, "app.example.test")).toBe(true);
    expect(shouldShowLocalGenerationLogs("production", undefined, "app.example.test")).toBe(false);
    expect(shouldShowLocalGenerationLogs("production", "true", "app.example.test")).toBe(true);
    expect(shouldShowLocalGenerationLogs("production", undefined, "localhost")).toBe(true);

    vi.stubEnv("NEXT_PUBLIC_IDLEDIARY_GENERATION_LOGS", "true");
    const view = renderPanel(
      generationProgress("rendering", 56, {
        label: "Polishing the video",
        logs: ["friendly summary"],
        rawLogs: ["frame=42 fps=30", "muxing overhead: 0.1%"],
      }),
    );

    expect(view.textContent).toContain("Raw local output");
    expect(view.textContent).toContain("frame=42 fps=30");
    expect(view.textContent).toContain("muxing overhead: 0.1%");
    expect(view.textContent).not.toContain("friendly summary");
  });

  it("shows a local waiting line before raw generation output arrives", () => {
    vi.stubEnv("NEXT_PUBLIC_IDLEDIARY_GENERATION_LOGS", "true");
    const view = renderPanel(
      generationProgress("rendering", 24, {
        label: "Polishing the video",
        logs: [],
        rawLogs: [],
      }),
    );

    expect(view.textContent).toContain("Raw local output");
    expect(view.textContent).toContain("Polishing the video: waiting for raw generation output...");
  });

  it("does not show the removed long-wait reassurance", () => {
    vi.useFakeTimers();
    const view = renderPanel(generationProgress("loading", 8));

    expect(view.textContent).not.toContain("Still working privately. Your clips are safe.");

    act(() => {
      vi.advanceTimersByTime(8_000);
    });

    expect(view.textContent).not.toContain("Still working privately. Your clips are safe.");
  });
});
