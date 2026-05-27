import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClipRecord } from "@/features/clips/types";
import {
  buildFfmpegArgs,
  buildGenerationFingerprint,
  buildVideoFilter,
  exportProfile,
  generateVlog,
  generationProgress,
  recentGenerationLogs,
  resetGenerationForTests,
  type GenerationProgress,
} from "./generation";

const storageMocks = vi.hoisted(() => ({
  getVlogByGenerationFingerprint: vi.fn(),
}));
const thumbnailMocks = vi.hoisted(() => ({
  generateVideoThumbnail: vi.fn(),
}));

vi.mock("@/features/clips/storage", () => ({
  getVlogByGenerationFingerprint: storageMocks.getVlogByGenerationFingerprint,
}));
vi.mock("@/features/clips/thumbnail", () => ({
  generateVideoThumbnail: thumbnailMocks.generateVideoThumbnail,
  thumbnailSizes: {
    vlog: { width: 360, height: 640 },
  },
}));

function clip(id: string): ClipRecord {
  return {
    id,
    sessionId: "session-1",
    blob: new Blob(["clip"], { type: "video/webm" }),
    mimeType: "video/webm",
    durationMs: 3_000,
    createdAt: "2026-05-27T10:00:00.000Z",
    size: 4,
  };
}

describe("generation export profile", () => {
  afterEach(() => {
    resetGenerationForTests();
    storageMocks.getVlogByGenerationFingerprint.mockReset();
    thumbnailMocks.generateVideoThumbnail.mockReset();
    delete (window as typeof window & { __idleDiaryMockFFmpeg?: unknown }).__idleDiaryMockFFmpeg;
  });

  it("builds the vertical center-crop filter chain", () => {
    expect(exportProfile).toEqual(
      expect.objectContaining({
        width: 720,
        height: 1280,
        fps: 30,
        aspectRatio: 9 / 16,
      }),
    );
    expect(buildVideoFilter()).toBe(
      "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=30,setsar=1,format=yuv420p",
    );
  });

  it("includes mobile-compatible H.264/AAC settings", () => {
    const args = buildFfmpegArgs();

    expect(args).toContain("-c:v");
    expect(args).toContain("libx264");
    expect(args).toContain("-pix_fmt");
    expect(args).toContain("yuv420p");
    expect(args).toContain("-r");
    expect(args).toContain("30");
    expect(args).toContain("-c:a");
    expect(args).toContain("aac");
    expect(args).toContain("-ar");
    expect(args).toContain("48000");
    expect(args).toContain("-ac");
    expect(args).toContain("2");
    expect(args).toContain("-movflags");
    expect(args).toContain("+faststart");
  });

  it("includes timestamp hardening and safe audio normalization", () => {
    const args = buildFfmpegArgs();

    expect(args).toEqual(expect.arrayContaining(["-fflags", "+genpts"]));
    expect(args).toEqual(expect.arrayContaining(["-avoid_negative_ts", "make_zero"]));
    expect(args).toContain("-shortest");
    expect(args).toEqual(expect.arrayContaining(["-af", exportProfile.audioFilter]));
    expect(args.at(-1)).toBe("vlog.mp4");
  });

  it("captures progress phases, technical detail, and bounded FFmpeg logs", async () => {
    const execArgs: string[][] = [];

    class MockFFmpeg {
      private readonly handlers = new Map<string, Array<(event: never) => void>>();

      on(event: string, handler: (event: never) => void) {
        this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
      }

      async load() {}

      async writeFile() {}

      async exec(args: string[]) {
        execArgs.push(args);
        this.emit("log", { message: "scale -> crop -> fps -> setsar -> format" });
        this.emit("progress", { progress: 0.62 });
        this.emit("log", { message: "loudnorm AAC 48kHz stereo" });
        this.emit("progress", { progress: 0.96 });
      }

      async readFile() {
        return new Uint8Array([1, 2, 3]);
      }

      private emit(event: string, payload: unknown) {
        for (const handler of this.handlers.get(event) ?? []) {
          handler(payload as never);
        }
      }
    }

    (window as typeof window & { __idleDiaryMockFFmpeg?: typeof MockFFmpeg }).__idleDiaryMockFFmpeg =
      MockFFmpeg;
    storageMocks.getVlogByGenerationFingerprint.mockResolvedValue(null);
    thumbnailMocks.generateVideoThumbnail.mockResolvedValue({
      thumbnailBlob: new Blob(["thumb"], { type: "image/webp" }),
      thumbnailMimeType: "image/webp",
      thumbnailWidth: 360,
      thumbnailHeight: 640,
    });

    const progress: GenerationProgress[] = [];
    const vlog = await generateVlog([clip("clip-1")], "session-1", (nextProgress) => {
      progress.push(nextProgress);
    });

    expect(execArgs).toEqual([buildFfmpegArgs()]);
    expect(thumbnailMocks.generateVideoThumbnail).toHaveBeenCalledWith(
      vlog.blob,
      expect.objectContaining({ width: 360, height: 640 }),
    );
    expect(vlog.thumbnailBlob).toBeDefined();
    expect(progress.map((entry) => entry.label)).toEqual(
      expect.arrayContaining([
        "Opening your diary",
        "Gathering moments",
        "Smoothing clips",
        "Softening audio",
        "Making playback ready",
        "Saving privately",
        "Ready",
      ]),
    );
    expect(progress.some((entry) => entry.technical.includes("H.264 MP4"))).toBe(true);
    expect(progress.at(-1)?.logs).toHaveLength(2);
  });

  it("keeps recent FFmpeg logs bounded", () => {
    const logs = Array.from({ length: 12 }, (_, index) => `line-${index}`).reduce(
      recentGenerationLogs,
      [] as string[],
    );

    expect(logs).toHaveLength(8);
    expect(logs[0]).toBe("line-4");
    expect(generationProgress("rendering", 24, { logs }).logs).toEqual(logs);
  });

  it("builds stable fingerprints from ordered clips and export settings", () => {
    const first = clip("clip-1");
    const second = {
      ...clip("clip-2"),
      size: 8,
      createdAt: "2026-05-27T10:00:01.000Z",
      mimeType: "video/mp4",
    };

    expect(buildGenerationFingerprint([first, second])).toBe(
      buildGenerationFingerprint([first, second]),
    );
    expect(buildGenerationFingerprint([first, second])).not.toBe(
      buildGenerationFingerprint([second, first]),
    );
    expect(buildGenerationFingerprint([first, second])).not.toBe(
      buildGenerationFingerprint([{ ...first, size: first.size + 1 }, second]),
    );
    expect(buildGenerationFingerprint([first, second])).not.toBe(
      buildGenerationFingerprint([{ ...first, createdAt: "2026-05-27T10:00:02.000Z" }, second]),
    );
    expect(buildGenerationFingerprint([first, second])).not.toBe(
      buildGenerationFingerprint([{ ...first, mimeType: "video/mp4" }, second]),
    );
    expect(buildGenerationFingerprint([first, second])).not.toBe(
      buildGenerationFingerprint([first, second], { ...exportProfile, fps: 24 }),
    );
  });

  it("reuses a matching generated vlog without running FFmpeg", async () => {
    const sourceClip = clip("clip-1");
    const cachedBlob = new Blob(["cached"], { type: "video/mp4" });
    storageMocks.getVlogByGenerationFingerprint.mockResolvedValue({
      id: "cached-vlog",
      sessionId: "session-1",
      blob: cachedBlob,
      mimeType: "video/mp4",
      clipCount: 1,
      title: "Cached",
      caption: "",
      createdAt: "2026-05-27T11:00:00.000Z",
      size: cachedBlob.size,
      generationFingerprint: buildGenerationFingerprint([sourceClip]),
    });

    class MockFFmpeg {
      on() {}
      async load() {}
      async writeFile() {}
      async exec() {
        throw new Error("ffmpeg should not run");
      }
      async readFile() {
        return new Uint8Array([1, 2, 3]);
      }
    }
    (window as typeof window & { __idleDiaryMockFFmpeg?: typeof MockFFmpeg }).__idleDiaryMockFFmpeg =
      MockFFmpeg;

    const vlog = await generateVlog([sourceClip], "session-1", () => undefined);

    expect(vlog.id).toBe("cached-vlog");
  });
});
