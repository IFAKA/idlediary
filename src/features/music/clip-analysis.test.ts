import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClipRecord } from "@/features/clips/types";
import {
  clipAnalysisVersion,
  getClipMoodDescriptions,
  resetClipAnalysisCacheForTests,
} from "./clip-analysis";
import {
  enqueueClipMoodAnalysis,
  resetClipAnalysisQueueForTests,
} from "./clip-analysis-queue";

const storageMocks = vi.hoisted(() => ({
  saveClipAnalysis: vi.fn(),
}));
const analysisMocks = vi.hoisted(() => ({
  extractClipKeyframes: vi.fn(),
  analyzeClipMoodDescriptions: vi.fn(),
}));

vi.mock("@/features/clips/storage", () => ({
  saveClipAnalysis: storageMocks.saveClipAnalysis,
}));
vi.mock("./keyframes", () => ({
  extractClipKeyframes: analysisMocks.extractClipKeyframes,
}));
vi.mock("./analyze", () => ({
  analyzeClipMoodDescriptions: analysisMocks.analyzeClipMoodDescriptions,
  moodCuesFromText: (text: string) =>
    text
      .split(/\W+/)
      .filter((word) => word.length > 0),
}));

function clip(id: string, overrides: Partial<ClipRecord> = {}): ClipRecord {
  const blob = new Blob([id], { type: "video/mp4" });
  return {
    id,
    sessionId: "session-1",
    blob,
    mimeType: "video/mp4",
    durationMs: 3000,
    createdAt: "2026-05-27T10:00:00.000Z",
    size: blob.size,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("clip analysis cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetClipAnalysisCacheForTests();
    resetClipAnalysisQueueForTests();
    storageMocks.saveClipAnalysis.mockResolvedValue(null);
    analysisMocks.extractClipKeyframes.mockResolvedValue([
      { clipId: "clip-1", timeMs: 600, dataUrl: "data:image/jpeg;base64,aa" },
    ]);
    analysisMocks.analyzeClipMoodDescriptions.mockResolvedValue([
      {
        clipId: "clip-1",
        description: "coffee cup / table",
        moodCues: ["coffee", "table"],
        mood: "coffee",
        energy: "low",
        brightness: "normal",
      },
    ]);
  });

  it("uses persisted clip analysis without reclassifying frames", async () => {
    const descriptions = await getClipMoodDescriptions([
      clip("clip-1", {
        analysis: {
          version: clipAnalysisVersion,
          description: "coffee cup / table",
          mood: "coffee",
          energy: "low",
          brightness: "normal",
          analyzedAt: "2026-05-27T10:01:00.000Z",
        },
      }),
    ]);

    expect(descriptions).toEqual([
      expect.objectContaining({ clipId: "clip-1", mood: "coffee" }),
    ]);
    expect(analysisMocks.extractClipKeyframes).not.toHaveBeenCalled();
    expect(storageMocks.saveClipAnalysis).not.toHaveBeenCalled();
  });

  it("queues background analysis one clip at a time", async () => {
    const firstFrames = deferred<Array<{ clipId: string; timeMs: number; dataUrl: string }>>();
    analysisMocks.extractClipKeyframes.mockReturnValueOnce(firstFrames.promise);

    const first = enqueueClipMoodAnalysis(clip("clip-1"));
    const second = enqueueClipMoodAnalysis(clip("clip-2"));

    await vi.waitFor(() => expect(analysisMocks.extractClipKeyframes).toHaveBeenCalledTimes(1));
    firstFrames.resolve([
      { clipId: "clip-1", timeMs: 600, dataUrl: "data:image/jpeg;base64,aa" },
    ]);
    await first;

    await vi.waitFor(() => expect(analysisMocks.extractClipKeyframes).toHaveBeenCalledTimes(2));
    await second;
    expect(storageMocks.saveClipAnalysis).toHaveBeenCalledTimes(2);
  });
});
