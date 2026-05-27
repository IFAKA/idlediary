import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generationProgress } from "@/features/generation/generation";
import {
  activeGenerationStage,
  completedGenerationStages,
  GenerationPanel,
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

  function renderPanel(progress = generationProgress("rendering", 52, { label: "Balancing audio" })) {
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
    expect(activeGenerationStage(generationProgress("writing", 18))).toBe("writing");
    expect(
      activeGenerationStage(generationProgress("rendering", 24, { label: "Normalizing clips" })),
    ).toBe("normalizing");
    expect(activeGenerationStage(generationProgress("saving", 94))).toBe("saving");
    expect(activeGenerationStage(generationProgress("done", 100))).toBe("saving");
  });

  it("distinguishes rendering labels before the encoding stage", () => {
    expect(
      activeGenerationStage(generationProgress("rendering", 24, { label: "Normalizing clips" })),
    ).toBe("normalizing");
    expect(
      activeGenerationStage(generationProgress("rendering", 56, { label: "Balancing audio" })),
    ).toBe("normalizing");
    expect(
      activeGenerationStage(generationProgress("rendering", 78, { label: "Encoding MP4" })),
    ).toBe("encoding");
  });

  it("marks earlier stages complete and all stages complete when done", () => {
    expect([
      ...completedGenerationStages(
        generationProgress("rendering", 78, { label: "Encoding MP4" }),
      ),
    ]).toEqual(["loading", "writing", "normalizing"]);

    expect([...completedGenerationStages(generationProgress("done", 100))]).toEqual([
      "loading",
      "writing",
      "normalizing",
      "encoding",
      "saving",
    ]);
  });

  it("keeps the factual status, progress bar, and reduced-motion classes visible", () => {
    const view = renderPanel(
      generationProgress("rendering", 56, {
        label: "Balancing audio",
        logs: ["scale -> crop -> fps -> setsar -> format"],
      }),
    );

    expect(view.textContent).toContain("Starting editor");
    expect(view.textContent).toContain("Collecting clips");
    expect(view.textContent).toContain("Normalizing");
    expect(view.textContent).toContain("Encoding");
    expect(view.textContent).toContain("Saving");
    expect(view.textContent).toContain("Balancing audio");
    expect(view.textContent).toContain("scale -> crop -> fps -> setsar -> format");
    expect(view.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(view.querySelector('[class*="motion-reduce:animate-none"]')).not.toBeNull();
  });

  it("shows the local safety reassurance after a long wait", () => {
    vi.useFakeTimers();
    const view = renderPanel(generationProgress("loading", 8));

    expect(view.textContent).not.toContain("Still working locally. Your clips are safe.");

    act(() => {
      vi.advanceTimersByTime(8_000);
    });

    expect(view.textContent).toContain("Still working locally. Your clips are safe.");
  });
});
