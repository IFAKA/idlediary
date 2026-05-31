import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/features/errors/app-error";
import type { ClipRecord } from "@/features/clips/types";
import {
  buildFfmpegArgs,
  buildFfmpegThumbnailArgs,
  buildGenerationFingerprint,
  exportProfile,
  generateVlog,
  generationProgress,
  isFastConcatCompatibleClip,
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
const musicMocks = vi.hoisted(() => ({
  getQueuedClipMoodDescriptions: vi.fn(),
  buildMusicPlan: vi.fn(),
  generateTinyMusicianWav: vi.fn(),
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
vi.mock("@/features/music/clip-analysis-queue", () => ({
  getQueuedClipMoodDescriptions: musicMocks.getQueuedClipMoodDescriptions,
}));
vi.mock("@/features/music/plan", async (importOriginal) => ({
  ...((await importOriginal()) as object),
  buildMusicPlan: musicMocks.buildMusicPlan,
}));
vi.mock("@/features/music/tinymusician", async (importOriginal) => ({
  ...((await importOriginal()) as object),
  generateTinyMusicianWav: musicMocks.generateTinyMusicianWav,
}));

function clip(id: string): ClipRecord {
  return {
    id,
    sessionId: "session-1",
    blob: new Blob(["clip"], { type: "video/mp4" }),
    mimeType: "video/mp4",
    durationMs: 3_000,
    createdAt: "2026-05-27T10:00:00.000Z",
    size: 4,
  };
}

describe("generation export profile", () => {
  beforeEach(() => {
    resetGenerationForTests();
    storageMocks.getVlogByGenerationFingerprint.mockReset();
    thumbnailMocks.generateVideoThumbnail.mockReset();
    musicMocks.getQueuedClipMoodDescriptions.mockReset();
    musicMocks.buildMusicPlan.mockReset();
    musicMocks.generateTinyMusicianWav.mockReset();
    musicMocks.getQueuedClipMoodDescriptions.mockResolvedValue([
      {
        clipId: "clip-1",
        description: "a cozy room",
        tags: ["home"],
        mood: "cozy",
        energy: "low",
        brightness: "normal",
      },
    ]);
    musicMocks.buildMusicPlan.mockReturnValue({
      seed: "seed-1",
      durationMs: 3_000,
      mood: "cozy",
      energy: "low",
      bpm: 74,
      key: "C",
      scale: "major pentatonic",
      instruments: ["felt-piano"],
      texture: "room",
    });
    musicMocks.generateTinyMusicianWav.mockResolvedValue({
      musicWav: new Uint8Array([82, 73, 70, 70]),
      musicPrompt: "Instrumental classic lo-fi hip-hop loop, 74 BPM, no vocals.",
      musicDurationSeconds: 8,
    });
  });

  afterEach(() => {
    resetGenerationForTests();
    storageMocks.getVlogByGenerationFingerprint.mockReset();
    thumbnailMocks.generateVideoThumbnail.mockReset();
    musicMocks.getQueuedClipMoodDescriptions.mockReset();
    musicMocks.buildMusicPlan.mockReset();
    musicMocks.generateTinyMusicianWav.mockReset();
    delete (window as typeof window & { __idleDiaryMockFFmpeg?: unknown }).__idleDiaryMockFFmpeg;
  });

  it("keeps the vertical MP4 export profile", () => {
    expect(exportProfile).toEqual(
      expect.objectContaining({
        width: 720,
        height: 1280,
        fps: 30,
        aspectRatio: 9 / 16,
      }),
    );
  });

  it("uses concat plus generated music mixing args", () => {
    const args = buildFfmpegArgs(3_000);

    expect(args).toEqual(expect.arrayContaining(["-i", "inputs.txt", "-stream_loop", "-1", "-i", "music.wav"]));
    expect(args).toEqual(expect.arrayContaining(["-c:v", "copy"]));
    expect(args).toEqual(expect.arrayContaining(["-c:a", "aac"]));
    expect(args).toEqual(expect.arrayContaining(["-ar", "48000", "-ac", "2"]));
    expect(args).toContain("-movflags");
    expect(args).toContain("+faststart");
    expect(args).toContain("-filter_complex");
    expect(args.join(" ")).toContain("dynaudnorm");
    expect(args.join(" ")).toContain("volume=0.45[music]");
    expect(args.join(" ")).toContain("amix=inputs=2");
    expect(args.join(" ")).toContain("normalize=0");
    expect(args.join(" ")).toContain("alimiter=limit=0.95");
  });

  it("includes timestamp hardening and exports the MP4 output", () => {
    const args = buildFfmpegArgs();

    expect(args).toEqual(expect.arrayContaining(["-fflags", "+genpts"]));
    expect(args).toEqual(expect.arrayContaining(["-avoid_negative_ts", "make_zero"]));
    expect(args).toContain("-shortest");
    expect(args.at(-1)).toBe("vlog.mp4");
  });

  it("extracts generated thumbnails from the FFmpeg output", () => {
    expect(buildFfmpegThumbnailArgs({ width: 360, height: 640 })).toEqual([
      "-y",
      "-ss",
      "0.1",
      "-i",
      "vlog.mp4",
      "-frames:v",
      "1",
      "-vf",
      "scale=360:640:force_original_aspect_ratio=increase,crop=360:640,setsar=1",
      "-q:v",
      "3",
      "vlog-thumbnail.jpg",
    ]);
  });

  it("captures progress phases, technical detail, and bounded FFmpeg logs", async () => {
    const execArgs: string[][] = [];
    const writtenFiles: string[] = [];

    class MockFFmpeg {
      private readonly handlers = new Map<string, Array<(event: never) => void>>();

      on(event: string, handler: (event: never) => void) {
        this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
      }

      async load() {}

      async writeFile(path: string) {
        writtenFiles.push(path);
      }

      async exec(args: string[]) {
        execArgs.push(args);
        this.emit("log", { message: "concat demuxer stream copy" });
        this.emit("progress", { progress: 0.62 });
        this.emit("log", { message: "faststart remux" });
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

    const progress: GenerationProgress[] = [];
    const vlog = await generateVlog(
      [clip("clip-1")],
      "session-1",
      (nextProgress) => {
        progress.push(nextProgress);
      },
      { generatedMusic: true, musicSeed: "seed-1" },
    );

    expect(execArgs).toEqual([
      buildFfmpegArgs(3_000),
      buildFfmpegThumbnailArgs({ width: 360, height: 640 }),
    ]);
    expect(writtenFiles).toEqual(["music.wav", "clip-0.mp4", "inputs.txt"]);
    expect(musicMocks.getQueuedClipMoodDescriptions).toHaveBeenCalledWith([
      expect.objectContaining({ id: "clip-1" }),
    ]);
    expect(musicMocks.buildMusicPlan).toHaveBeenCalledWith(expect.any(Array), 8_000, "seed-1");
    expect(musicMocks.generateTinyMusicianWav).toHaveBeenCalledWith({
      plan: expect.objectContaining({ seed: "seed-1", bpm: 74 }),
      descriptions: expect.any(Array),
      durationSeconds: 8,
    });
    expect(thumbnailMocks.generateVideoThumbnail).not.toHaveBeenCalled();
    expect(vlog.thumbnailBlob).toBeDefined();
    expect(vlog.thumbnailMimeType).toBe("image/jpeg");
    expect(progress.map((entry) => entry.label)).toEqual(
      expect.arrayContaining([
        "Opening your diary",
        "Composing music",
        "Assembling MP4",
        "Making playback ready",
        "Saving privately",
        "Ready",
      ]),
    );
    expect(progress.some((entry) => entry.technical.includes("generated music mix"))).toBe(true);
    expect(progress.at(-1)?.logs).toHaveLength(4);
  });

  it("identifies MP4 clips as compatible for fast concat", () => {
    expect(isFastConcatCompatibleClip(clip("clip-1"))).toBe(true);
    expect(
      isFastConcatCompatibleClip({
        ...clip("clip-2"),
        blob: new Blob(["clip"], { type: "video/webm" }),
        mimeType: "video/webm",
      }),
    ).toBe(false);
  });

  it("rejects non-MP4 clips before calling FFmpeg", async () => {
    class MockFFmpeg {
      on() {}
      async load() {
        throw new Error("ffmpeg should not load");
      }
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

    await expect(
      generateVlog(
        [
          {
            ...clip("clip-1"),
            blob: new Blob(["clip"], { type: "video/webm" }),
            mimeType: "video/webm",
          },
        ],
        "session-1",
        () => undefined,
      ),
    ).rejects.toMatchObject({
      code: "generation-unavailable",
      userMessage: expect.stringContaining("unsupported video format"),
    });
    expect(storageMocks.getVlogByGenerationFingerprint).not.toHaveBeenCalled();
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
      buildGenerationFingerprint(
        [{ ...first, mimeType: 'video/mp4;codecs="avc1.42E01E,mp4a.40.2"' }, second],
      ),
    );
    expect(buildGenerationFingerprint([first, second])).not.toBe(
      buildGenerationFingerprint([first, second], { ...exportProfile, fps: 24 }),
    );
    expect(buildGenerationFingerprint([first, second], exportProfile, { seed: "a", profileVersion: 2 })).not.toBe(
      buildGenerationFingerprint([first, second], exportProfile, { seed: "b", profileVersion: 2 }),
    );
  });

  it("does not call the procedural fallback when TinyMusician fails", async () => {
    class MockFFmpeg {
      on() {}
      async load() {}
      async writeFile() {
        throw new Error("ffmpeg should not receive music");
      }
      async exec() {
        throw new Error("ffmpeg should not run");
      }
      async readFile() {
        return new Uint8Array([1, 2, 3]);
      }
    }
    (window as typeof window & { __idleDiaryMockFFmpeg?: typeof MockFFmpeg }).__idleDiaryMockFFmpeg =
      MockFFmpeg;
    storageMocks.getVlogByGenerationFingerprint.mockResolvedValue(null);
    musicMocks.generateTinyMusicianWav.mockRejectedValue(
      new AppError({
        code: "generation-unavailable",
        area: "generation",
        message: "TinyMusician missing",
        userMessage: "Generated music needs TinyMusician installed locally with WebGPU support.",
      }),
    );

    await expect(
      generateVlog([clip("clip-1")], "session-1", () => undefined, {
        generatedMusic: true,
        musicSeed: "seed-1",
      }),
    ).rejects.toMatchObject({
      code: "generation-unavailable",
      message: "TinyMusician missing",
    });
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
      thumbnailBlob: new Blob(["cached-thumb"], { type: "image/jpeg" }),
      thumbnailMimeType: "image/jpeg",
      thumbnailWidth: 360,
      thumbnailHeight: 640,
      generationFingerprint: buildGenerationFingerprint([sourceClip], exportProfile, {
        seed: "seed-1",
        profileVersion: 2,
      }),
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

    const vlog = await generateVlog([sourceClip], "session-1", () => undefined, {
      generatedMusic: true,
      musicSeed: "seed-1",
    });

    expect(vlog.id).toBe("cached-vlog");
    expect(musicMocks.getQueuedClipMoodDescriptions).not.toHaveBeenCalled();
  });
});
