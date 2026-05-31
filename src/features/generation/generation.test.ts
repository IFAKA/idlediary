import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClipRecord } from "@/features/clips/types";
import {
  buildFfmpegArgs,
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
  extractClipKeyframes: vi.fn(),
  analyzeClipMoodDescriptions: vi.fn(),
  buildMusicPlan: vi.fn(),
  composeGeneratedMusic: vi.fn(),
  renderCompositionToWav: vi.fn(),
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
vi.mock("@/features/music/keyframes", () => ({
  extractClipKeyframes: musicMocks.extractClipKeyframes,
}));
vi.mock("@/features/music/analyze", () => ({
  analyzeClipMoodDescriptions: musicMocks.analyzeClipMoodDescriptions,
}));
vi.mock("@/features/music/plan", async (importOriginal) => ({
  ...((await importOriginal()) as object),
  buildMusicPlan: musicMocks.buildMusicPlan,
}));
vi.mock("@/features/music/compose", () => ({
  composeGeneratedMusic: musicMocks.composeGeneratedMusic,
}));
vi.mock("@/features/music/render", () => ({
  renderCompositionToWav: musicMocks.renderCompositionToWav,
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
    musicMocks.extractClipKeyframes.mockReset();
    musicMocks.analyzeClipMoodDescriptions.mockReset();
    musicMocks.buildMusicPlan.mockReset();
    musicMocks.composeGeneratedMusic.mockReset();
    musicMocks.renderCompositionToWav.mockReset();
    musicMocks.extractClipKeyframes.mockResolvedValue([
      {
        clipId: "clip-1",
        timeMs: 600,
        dataUrl: "data:image/jpeg;base64,aa",
      },
    ]);
    musicMocks.analyzeClipMoodDescriptions.mockResolvedValue([
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
    musicMocks.composeGeneratedMusic.mockResolvedValue({
      sampleRate: 48_000,
      samples: new Float32Array(48_000),
    });
    musicMocks.renderCompositionToWav.mockReturnValue(new Uint8Array([82, 73, 70, 70]));
  });

  afterEach(() => {
    resetGenerationForTests();
    storageMocks.getVlogByGenerationFingerprint.mockReset();
    thumbnailMocks.generateVideoThumbnail.mockReset();
    musicMocks.extractClipKeyframes.mockReset();
    musicMocks.analyzeClipMoodDescriptions.mockReset();
    musicMocks.buildMusicPlan.mockReset();
    musicMocks.composeGeneratedMusic.mockReset();
    musicMocks.renderCompositionToWav.mockReset();
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

    expect(args).toEqual(expect.arrayContaining(["-i", "inputs.txt", "-i", "music.wav"]));
    expect(args).toEqual(expect.arrayContaining(["-c:v", "copy"]));
    expect(args).toEqual(expect.arrayContaining(["-c:a", "aac"]));
    expect(args).toEqual(expect.arrayContaining(["-ar", "48000", "-ac", "2"]));
    expect(args).toContain("-movflags");
    expect(args).toContain("+faststart");
    expect(args).toContain("-filter_complex");
    expect(args.join(" ")).toContain("dynaudnorm");
    expect(args.join(" ")).toContain("amix=inputs=2");
    expect(args.join(" ")).toContain("alimiter=limit=0.95");
  });

  it("includes timestamp hardening and exports the MP4 output", () => {
    const args = buildFfmpegArgs();

    expect(args).toEqual(expect.arrayContaining(["-fflags", "+genpts"]));
    expect(args).toEqual(expect.arrayContaining(["-avoid_negative_ts", "make_zero"]));
    expect(args).toContain("-shortest");
    expect(args.at(-1)).toBe("vlog.mp4");
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
    thumbnailMocks.generateVideoThumbnail.mockResolvedValue({
      thumbnailBlob: new Blob(["thumb"], { type: "image/webp" }),
      thumbnailMimeType: "image/webp",
      thumbnailWidth: 360,
      thumbnailHeight: 640,
    });

    const progress: GenerationProgress[] = [];
    const vlog = await generateVlog(
      [clip("clip-1")],
      "session-1",
      (nextProgress) => {
        progress.push(nextProgress);
      },
      { generatedMusic: true, musicSeed: "seed-1" },
    );

    expect(execArgs).toEqual([buildFfmpegArgs(3_000)]);
    expect(writtenFiles).toEqual(["music.wav", "clip-0.mp4", "inputs.txt"]);
    expect(musicMocks.extractClipKeyframes).toHaveBeenCalledWith([expect.objectContaining({ id: "clip-1" })]);
    expect(musicMocks.buildMusicPlan).toHaveBeenCalledWith(expect.any(Array), 3_000, "seed-1");
    expect(thumbnailMocks.generateVideoThumbnail).toHaveBeenCalledWith(
      vlog.blob,
      expect.objectContaining({ width: 360, height: 640 }),
    );
    expect(vlog.thumbnailBlob).toBeDefined();
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
    expect(progress.at(-1)?.logs).toHaveLength(2);
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
    expect(musicMocks.extractClipKeyframes).not.toHaveBeenCalled();
  });
});
