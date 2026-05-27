import { afterEach, describe, expect, it } from "vitest";
import type { ClipRecord } from "@/features/clips/types";
import {
  buildFfmpegArgs,
  buildVideoFilter,
  exportProfile,
  generateVlog,
  generationProgress,
  recentGenerationLogs,
  resetGenerationForTests,
  type GenerationProgress,
} from "./generation";

function clip(id: string): ClipRecord {
  return {
    id,
    sessionId: "session-1",
    blob: new Blob(["clip"], { type: "video/webm" }),
    mimeType: "video/webm",
    durationMs: 2_000,
    createdAt: "2026-05-27T10:00:00.000Z",
    size: 4,
  };
}

describe("generation export profile", () => {
  afterEach(() => {
    resetGenerationForTests();
    delete (window as typeof window & { __idleDiaryMockFFmpeg?: unknown }).__idleDiaryMockFFmpeg;
  });

  it("builds the vertical center-crop filter chain", () => {
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

    const progress: GenerationProgress[] = [];
    await generateVlog([clip("clip-1")], "session-1", (nextProgress) => {
      progress.push(nextProgress);
    });

    expect(execArgs).toEqual([buildFfmpegArgs()]);
    expect(progress.map((entry) => entry.label)).toEqual(
      expect.arrayContaining([
        "Loading local editor",
        "Collecting clips",
        "Normalizing clips",
        "Balancing audio",
        "Encoding MP4",
        "Saving result",
        "Done",
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
});
