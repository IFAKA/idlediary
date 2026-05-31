import { describe, expect, it } from "vitest";
import { generationProgress } from "@/features/generation/generation";
import {
  generationProgressWithLiveLogs,
  shouldPublishGenerationProgress,
} from "./capture-screen";
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

  it("keeps live generation logs when the visible intro step has no logs yet", () => {
    expect(
      generationProgressWithLiveLogs(
        generationProgress("writing", 14, { logs: ["Preparing FFmpeg workspace"] }),
        generationProgress("rendering", 24, { label: "Polishing the video" }),
        generationProgress("writing", 20, {
          logs: ["Writing clip-0.mp4"],
          rawLogs: ["frame=1 fps=0"],
        }),
      ),
    ).toEqual(
      expect.objectContaining({
        step: "rendering",
        label: "Polishing the video",
        logs: ["Writing clip-0.mp4"],
        rawLogs: ["frame=1 fps=0"],
      }),
    );
  });

  it("preserves displayed generation logs and raw output when the latest progress has no logs", () => {
    expect(
      generationProgressWithLiveLogs(
        generationProgress("rendering", 24, {
          logs: ["Balancing sound and color"],
          rawLogs: ["$ ffmpeg -i inputs.txt"],
        }),
        generationProgress("saving", 92),
        generationProgress("idle", 0),
      ),
    ).toEqual(
      expect.objectContaining({
        step: "saving",
        logs: ["Balancing sound and color"],
        rawLogs: ["$ ffmpeg -i inputs.txt"],
      }),
    );
  });
});

describe("camera video constraints", () => {
  it("requests the camera source format without forcing preview dimensions", () => {
    expect(videoConstraintsForFacingMode("environment")).toEqual({
      frameRate: { ideal: 30, max: 30 },
      facingMode: { ideal: "environment" },
    });
  });

  it("keeps exact device selection without forcing preview dimensions", () => {
    expect(videoConstraintsForDevice("front-camera")).toEqual({
      frameRate: { ideal: 30, max: 30 },
      deviceId: { exact: "front-camera" },
    });
  });
});
