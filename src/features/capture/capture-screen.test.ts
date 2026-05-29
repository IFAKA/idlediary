import { describe, expect, it } from "vitest";
import { generationProgress } from "@/features/generation/generation";
import { shouldPublishGenerationProgress } from "./capture-screen";
import { videoConstraintsForDevice, videoConstraintsForFacingMode } from "./use-camera";

describe("shouldPublishGenerationProgress", () => {
  it("prevents delayed generation updates from moving the visible stepper backward", () => {
    expect(
      shouldPublishGenerationProgress(
        generationProgress("rendering", 24),
        generationProgress("loading", 8),
      ),
    ).toBe(false);
    expect(
      shouldPublishGenerationProgress(
        generationProgress("rendering", 24),
        generationProgress("writing", 14),
      ),
    ).toBe(false);
  });

  it("allows equal or forward generation progress", () => {
    expect(
      shouldPublishGenerationProgress(
        generationProgress("rendering", 24),
        generationProgress("rendering", 56),
      ),
    ).toBe(true);
    expect(
      shouldPublishGenerationProgress(
        generationProgress("rendering", 56),
        generationProgress("saving", 92),
      ),
    ).toBe(true);
  });
});

describe("camera video constraints", () => {
  it("requests ideal native photo dimensions for facing mode capture", () => {
    expect(videoConstraintsForFacingMode("environment")).toEqual({
      width: { ideal: 720 },
      height: { ideal: 960 },
      aspectRatio: { ideal: 3 / 4 },
      resizeMode: { ideal: "crop-and-scale" },
      frameRate: { ideal: 30, max: 30 },
      facingMode: { ideal: "environment" },
    });
  });

  it("keeps exact device selection with ideal native photo dimensions", () => {
    expect(videoConstraintsForDevice("front-camera")).toEqual({
      width: { ideal: 720 },
      height: { ideal: 960 },
      aspectRatio: { ideal: 3 / 4 },
      resizeMode: { ideal: "crop-and-scale" },
      frameRate: { ideal: 30, max: 30 },
      deviceId: { exact: "front-camera" },
    });
  });
});
