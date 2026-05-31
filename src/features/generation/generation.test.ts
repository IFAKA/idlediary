import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/features/errors/app-error";
import type { ClipRecord } from "@/features/clips/types";
import {
  buildFfmpegArgs,
  buildGenerationFingerprint,
  exportProfile,
  generateVlog,
  generationProgress,
  isFastConcatCompatibleClip,
  recentGenerationLogs,
  recentRawGenerationLogs,
  renderPipelineVersion,
  resetGenerationForTests,
  warmGenerationPipeline,
  type GenerationProgress,
} from "./generation";

const storageMocks = vi.hoisted(() => ({
  getVlogByGenerationFingerprint: vi.fn(),
}));
const thumbnailMocks = vi.hoisted(() => ({
  generateVideoThumbnail: vi.fn(),
}));
const debugMocks = vi.hoisted(() => ({
  addDebugEvent: vi.fn(),
  addDebugError: vi.fn(),
}));
const musicMocks = vi.hoisted(() => ({
  buildMusicPlan: vi.fn(),
  buildVisualMusicProfile: vi.fn(),
  renderLocalMusicWav: vi.fn(),
}));

vi.mock("@/features/clips/storage", () => ({
  getVlogByGenerationFingerprint: storageMocks.getVlogByGenerationFingerprint,
}));
vi.mock("@/features/errors/debug-store", () => ({
  addDebugEvent: debugMocks.addDebugEvent,
  addDebugError: debugMocks.addDebugError,
}));
vi.mock("@/features/clips/thumbnail", () => ({
  generateVideoThumbnail: thumbnailMocks.generateVideoThumbnail,
  thumbnailSizes: {
    vlog: { width: 360, height: 640 },
  },
}));
vi.mock("@/features/music/plan", async (importOriginal) => ({
  ...((await importOriginal()) as object),
  buildMusicPlan: musicMocks.buildMusicPlan,
}));
vi.mock("@/features/music/profile", async (importOriginal) => ({
  ...((await importOriginal()) as object),
  buildVisualMusicProfile: musicMocks.buildVisualMusicProfile,
}));
vi.mock("@/features/music/local-music", async (importOriginal) => ({
  ...((await importOriginal()) as object),
  renderLocalMusicWav: musicMocks.renderLocalMusicWav,
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
    debugMocks.addDebugEvent.mockReset();
    debugMocks.addDebugError.mockReset();
    musicMocks.buildMusicPlan.mockReset();
    musicMocks.buildVisualMusicProfile.mockReset();
    musicMocks.renderLocalMusicWav.mockReset();
    musicMocks.buildVisualMusicProfile.mockResolvedValue({
      version: 10,
      brightness: 0.5,
      saturation: 0.4,
      contrast: 0.35,
      warmth: 0.5,
      pacing: 0.2,
      originalAudioActivity: 0.2,
    });
    musicMocks.buildMusicPlan.mockReturnValue({
      seed: "seed-1",
      durationMs: 3_000,
      mood: "cozy",
      energy: "low",
      activity: "low",
      bpm: 74,
      key: "C",
      scale: "major pentatonic",
      instruments: ["felt-piano"],
      texture: "room",
    });
    musicMocks.renderLocalMusicWav.mockResolvedValue({
      musicWav: new Uint8Array([82, 73, 70, 70]),
      musicMidi: new Uint8Array([77, 84, 104, 100]),
      musicDurationSeconds: 8,
      debug: {
        musicEngine: "scribbletune-spessasynth",
        musicSeed: "seed-1",
        musicDurationSeconds: 8,
        musicMood: "cozy",
        midiBytes: 4,
        renderer: "procedural",
      },
    });
  });

  afterEach(() => {
    resetGenerationForTests();
    storageMocks.getVlogByGenerationFingerprint.mockReset();
    thumbnailMocks.generateVideoThumbnail.mockReset();
    debugMocks.addDebugEvent.mockReset();
    debugMocks.addDebugError.mockReset();
    musicMocks.buildMusicPlan.mockReset();
    musicMocks.buildVisualMusicProfile.mockReset();
    musicMocks.renderLocalMusicWav.mockReset();
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
    expect(args).toEqual(expect.arrayContaining(["-c:v", "libx264"]));
    expect(args).toEqual(expect.arrayContaining(["-pix_fmt", "yuv420p"]));
    expect(args).toEqual(expect.arrayContaining(["-c:a", "aac"]));
    expect(args).toEqual(expect.arrayContaining(["-ar", "48000", "-ac", "2"]));
    expect(args).not.toContain("-movflags");
    expect(args).not.toContain("+faststart");
    expect(args).toContain("-filter_complex");
    expect(args.join(" ")).toContain("loudnorm=I=-16:TP=-1.5:LRA=11");
    expect(args.join(" ")).toContain("dynaudnorm");
    expect(args.join(" ")).toContain("volume=0.82,asplit=2[clipmix][clipduck]");
    expect(args.join(" ")).toContain("eq=contrast=0.985:saturation=1.14");
    expect(args.join(" ")).toContain("colorbalance=rs=0.035");
    expect(args.join(" ")).toContain("curves=r='0/0.035 0.22/0.25 0.78/0.82 1/0.965'");
    expect(args.join(" ")).toContain("format=yuv420p[vout]");
    expect(args.join(" ")).toContain("volume=0.42[musicbase]");
    expect(args.join(" ")).toContain("sidechaincompress=threshold=0.09:ratio=3.5");
    expect(args.join(" ")).toContain("amix=inputs=2");
    expect(args.join(" ")).toContain("normalize=0");
    expect(args.join(" ")).toContain("loudnorm=I=-14:TP=-1.5:LRA=11");
    expect(args.join(" ")).toContain("alimiter=limit=0.84");
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
    const sourceClip = {
      ...clip("clip-1"),
      thumbnailBlob: new Blob(["clip-thumb"], { type: "image/jpeg" }),
      thumbnailMimeType: "image/jpeg",
      thumbnailWidth: 256,
      thumbnailHeight: 256,
    };

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
        this.emit("log", { message: "audio mix complete" });
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
      [sourceClip],
      "session-1",
      (nextProgress) => {
        progress.push(nextProgress);
      },
      { generatedMusic: true, musicSeed: "seed-1" },
    );

    expect(execArgs).toEqual([buildFfmpegArgs(3_000)]);
    expect(writtenFiles).toEqual(["music.wav", "clip-0.mp4", "inputs.txt"]);
    expect(musicMocks.buildVisualMusicProfile).toHaveBeenCalledWith([
      expect.objectContaining({ id: "clip-1" }),
    ]);
    expect(musicMocks.buildMusicPlan).toHaveBeenCalledWith(expect.objectContaining({ version: 10 }), 8_000, "seed-1");
    expect(musicMocks.renderLocalMusicWav).toHaveBeenCalledWith({
      plan: expect.objectContaining({ seed: "seed-1", bpm: 74 }),
      descriptions: [],
      durationSeconds: 8,
      onRawLog: expect.any(Function),
    });
    expect(thumbnailMocks.generateVideoThumbnail).not.toHaveBeenCalled();
    expect(vlog.thumbnailBlob).toBe(sourceClip.thumbnailBlob);
    expect(vlog.thumbnailMimeType).toBe("image/jpeg");
    expect(vlog.thumbnailWidth).toBe(256);
    expect(vlog.thumbnailHeight).toBe(256);
    expect(progress.map((entry) => entry.label)).toEqual(
      expect.arrayContaining([
        "Opening your diary",
        "Making the soundtrack",
        "Polishing the video",
        "Saving your vlog",
        "Ready",
      ]),
    );
    expect(progress.some((entry) => entry.technical.includes("original music mix"))).toBe(true);
    expect(progress.some((entry) => entry.technical.includes("silent-vlog color grade"))).toBe(true);
    expect(progress.at(-1)?.logs).toHaveLength(8);
    expect(progress.at(-1)?.rawLogs).toEqual(
      expect.arrayContaining([
        "$ ffmpeg.wasm load",
        "ffmpeg.wasm load complete",
        expect.stringContaining("$ ffmpeg -fflags +genpts"),
        "concat demuxer stream copy",
        "progress=62%",
        "audio mix complete",
        "progress=96%",
      ]),
    );
    expect(progress.some((entry) => entry.logs.includes("Creating original lo-fi music"))).toBe(true);
    expect(progress.some((entry) => entry.logs.includes("Writing clip-0.mp4 (0.0 KB)"))).toBe(true);
    expect(progress.at(-1)?.logs).toEqual(
      expect.arrayContaining([
        "ffmpeg: concat demuxer stream copy",
        "ffmpeg: audio mix complete",
        "Video polish complete",
        "Generated video ready (3 bytes)",
      ]),
    );
    expect(debugMocks.addDebugEvent).toHaveBeenCalledWith(
      "generation-timing",
      "generation",
      expect.objectContaining({
        ffmpegLoadMs: expect.any(Number),
        musicGenerationMs: expect.any(Number),
        ffmpegWriteFilesMs: expect.any(Number),
        ffmpegMuxMixExecMs: expect.any(Number),
        ffmpegOutputReadMs: expect.any(Number),
        thumbnailSelectionMs: expect.any(Number),
        saveHandoffMs: expect.any(Number),
        totalMs: expect.any(Number),
        clipCount: 1,
        outputBytes: vlog.size,
        audioFilters: ["loudnorm", "dynaudnorm", "afade", "sidechaincompress", "amix", "alimiter"],
        videoFilters: ["scale", "crop", "fps", "eq", "colorbalance", "curves", "unsharp", "format"],
      }),
    );
  });

  it("warms FFmpeg without calling the music renderer", async () => {
    const calls: string[] = [];

    class MockFFmpeg {
      on() {}
      async load() {
        calls.push("load");
      }
      async writeFile() {
        calls.push("writeFile");
      }
      async exec() {
        calls.push("exec");
      }
      async readFile() {
        calls.push("readFile");
        return new Uint8Array([1, 2, 3]);
      }
    }
    (window as typeof window & { __idleDiaryMockFFmpeg?: typeof MockFFmpeg }).__idleDiaryMockFFmpeg =
      MockFFmpeg;

    await warmGenerationPipeline();

    expect(calls).toEqual(["load"]);
    expect(musicMocks.renderLocalMusicWav).not.toHaveBeenCalled();
    expect(debugMocks.addDebugEvent).toHaveBeenCalledWith(
      "generation-warmup",
      "generation",
      expect.objectContaining({
        ffmpeg: "fulfilled",
        musicEngine: "scribbletune-spessasynth",
      }),
    );
  });

  it("uses the first complete selected clip thumbnail for the generated vlog", async () => {
    class MockFFmpeg {
      on() {}
      async load() {}
      async writeFile() {}
      async exec() {}
      async readFile() {
        return new Uint8Array([1, 2, 3]);
      }
    }
    (window as typeof window & { __idleDiaryMockFFmpeg?: typeof MockFFmpeg }).__idleDiaryMockFFmpeg =
      MockFFmpeg;
    storageMocks.getVlogByGenerationFingerprint.mockResolvedValue(null);
    const incomplete = {
      ...clip("clip-1"),
      thumbnailBlob: new Blob(["incomplete"], { type: "image/jpeg" }),
      thumbnailMimeType: "image/jpeg",
    };
    const complete = {
      ...clip("clip-2"),
      thumbnailBlob: new Blob(["complete"], { type: "image/webp" }),
      thumbnailMimeType: "image/webp",
      thumbnailWidth: 111,
      thumbnailHeight: 222,
    };

    const vlog = await generateVlog([incomplete, complete], "session-1", () => undefined, {
      generatedMusic: true,
      musicSeed: "seed-1",
    });

    expect(vlog.thumbnailBlob).toBe(complete.thumbnailBlob);
    expect(vlog.thumbnailMimeType).toBe("image/webp");
    expect(vlog.thumbnailWidth).toBe(111);
    expect(vlog.thumbnailHeight).toBe(222);
    expect(thumbnailMocks.generateVideoThumbnail).not.toHaveBeenCalled();
  });

  it("generates a browser thumbnail only when selected clips lack complete thumbnails", async () => {
    class MockFFmpeg {
      on() {}
      async load() {}
      async writeFile() {}
      async exec() {}
      async readFile() {
        return new Uint8Array([1, 2, 3]);
      }
    }
    (window as typeof window & { __idleDiaryMockFFmpeg?: typeof MockFFmpeg }).__idleDiaryMockFFmpeg =
      MockFFmpeg;
    storageMocks.getVlogByGenerationFingerprint.mockResolvedValue(null);
    const sourceClip = clip("clip-1");
    const generatedThumbnail = {
      thumbnailBlob: new Blob(["generated"], { type: "image/jpeg" }),
      thumbnailMimeType: "image/jpeg",
      thumbnailWidth: 360,
      thumbnailHeight: 640,
    };
    thumbnailMocks.generateVideoThumbnail.mockResolvedValue(generatedThumbnail);

    const vlog = await generateVlog([sourceClip], "session-1", () => undefined, {
      generatedMusic: true,
      musicSeed: "seed-1",
    });

    expect(thumbnailMocks.generateVideoThumbnail).toHaveBeenCalledOnce();
    expect(thumbnailMocks.generateVideoThumbnail).toHaveBeenCalledWith(sourceClip.blob, {
      width: 360,
      height: 640,
    });
    expect(vlog.thumbnailBlob).toBe(generatedThumbnail.thumbnailBlob);
    expect(vlog.thumbnailWidth).toBe(360);
    expect(vlog.thumbnailHeight).toBe(640);
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

  it("keeps recent raw generation logs bounded separately from friendly logs", () => {
    const rawLogs = Array.from({ length: 125 }, (_, index) => `raw-${index}`).reduce(
      recentRawGenerationLogs,
      [],
    );

    expect(rawLogs).toHaveLength(120);
    expect(rawLogs[0]).toBe("raw-5");
    expect(generationProgress("rendering", 24, { rawLogs }).rawLogs).toEqual(rawLogs);
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
    expect(buildGenerationFingerprint([first, second])).toContain(
      `"renderPipelineVersion":${renderPipelineVersion}`,
    );
  });

  it("does not run FFmpeg when local music rendering fails", async () => {
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
    musicMocks.renderLocalMusicWav.mockRejectedValue(
      new AppError({
        code: "generation-unavailable",
        area: "generation",
        message: "local music failed",
        userMessage: "Generated music needs local browser audio support on this device.",
      }),
    );

    await expect(
      generateVlog([clip("clip-1")], "session-1", () => undefined, {
        generatedMusic: true,
        musicSeed: "seed-1",
      }),
    ).rejects.toMatchObject({
      code: "generation-unavailable",
      message: "local music failed",
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
    expect(musicMocks.buildVisualMusicProfile).not.toHaveBeenCalled();
  });
});
