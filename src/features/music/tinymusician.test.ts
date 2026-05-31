import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildTinyMusicianPrompt,
  generateTinyMusicianWav,
  musicDurationSecondsForVideo,
  resetTinyMusicianForTests,
} from "./tinymusician";
import type { ClipMoodDescription, MusicPlan } from "./types";

const transformerMocks = vi.hoisted(() => ({
  pipeline: vi.fn(),
  generatedAudio: vi.fn(),
}));

vi.mock("@huggingface/transformers", () => ({
  env: {
    allowLocalModels: false,
    allowRemoteModels: true,
    localModelPath: "",
    backends: { onnx: {} },
  },
  pipeline: transformerMocks.pipeline,
}));

const plan: MusicPlan = {
  seed: "seed-1",
  durationMs: 8_000,
  mood: "coffee",
  energy: "low",
  bpm: 74,
  key: "C",
  scale: "major pentatonic",
  instruments: ["electric-piano", "soft-bass", "brush-kit"],
  texture: "vinyl",
};

const description: ClipMoodDescription = {
  clipId: "clip-1",
  description: "coffee on a table at home",
  tags: ["coffee", "home"],
  mood: "coffee",
  energy: "low",
  brightness: "normal",
};

describe("TinyMusician generation", () => {
  beforeEach(() => {
    transformerMocks.pipeline.mockReset();
    transformerMocks.generatedAudio.mockReset();
    transformerMocks.generatedAudio.mockResolvedValue({
      audio: new Float32Array([0, 0.2, -0.2, 0.1]),
      sampling_rate: 24_000,
    });
    transformerMocks.pipeline.mockResolvedValue(transformerMocks.generatedAudio);
  });

  afterEach(() => {
    resetTinyMusicianForTests();
    delete (window as typeof window & { __idleDiaryMockTinyMusician?: unknown }).__idleDiaryMockTinyMusician;
    delete (navigator as Navigator & { gpu?: unknown }).gpu;
  });

  it("builds an instrumental lo-fi prompt from plan and video analysis", () => {
    expect(buildTinyMusicianPrompt(plan, [description])).toBe(
      "Instrumental classic lo-fi hip-hop loop, 74 BPM, warm Rhodes jazz chords, dusty swung drums, mellow bass, vinyl crackle, coffee home mood, key C major pentatonic, texture vinyl, no vocals, seamless background loop.",
    );
  });

  it("bounds music duration around the final video length", () => {
    expect(musicDurationSecondsForVideo(1_000)).toBe(8);
    expect(musicDurationSecondsForVideo(12_000)).toBe(14.4);
    expect(musicDurationSecondsForVideo(45_000)).toBe(30);
  });

  it("encodes mocked generated samples into a valid 48 kHz WAV", async () => {
    (window as typeof window & {
      __idleDiaryMockTinyMusician?: () => {
        audio: Float32Array;
        sampling_rate: number;
      };
    }).__idleDiaryMockTinyMusician = () => ({
      audio: new Float32Array([0, 0.5, -0.5, 0.25]),
      sampling_rate: 24_000,
    });

    const result = await generateTinyMusicianWav({
      plan,
      descriptions: [description],
      durationSeconds: 8,
    });

    expect(result.musicWav.slice(0, 4)).toEqual(new Uint8Array([82, 73, 70, 70]));
    expect(result.musicWav.length).toBe(44 + 48_000 * 8 * 2);
    expect(result.musicPrompt).toContain("74 BPM");
    expect(result.musicDurationSeconds).toBe(8);
  });

  it("loads TinyMusician from local WebGPU assets without requesting quantized filenames", async () => {
    Object.defineProperty(navigator, "gpu", {
      configurable: true,
      value: {},
    });

    const result = await generateTinyMusicianWav({
      plan,
      descriptions: [description],
      durationSeconds: 8,
    });

    expect(result.musicWav.slice(0, 4)).toEqual(new Uint8Array([82, 73, 70, 70]));
    expect(transformerMocks.pipeline).toHaveBeenCalledWith(
      "text-to-audio",
      "itsmax/TinyMusician",
      {
        device: "webgpu",
        dtype: "fp32",
        local_files_only: true,
      },
    );
    expect(transformerMocks.generatedAudio).toHaveBeenCalledWith(
      expect.stringContaining("Instrumental classic lo-fi hip-hop loop"),
      expect.objectContaining({
        guidance_scale: 3,
        temperature: 0.9,
      }),
    );
  });

  it("throws a clear local-model error when TinyMusician cannot load", async () => {
    Object.defineProperty(navigator, "gpu", {
      configurable: true,
      value: {},
    });
    transformerMocks.pipeline.mockRejectedValue(new Error("missing local model file"));

    await expect(
      generateTinyMusicianWav({
        plan,
        descriptions: [description],
        durationSeconds: 8,
      }),
    ).rejects.toMatchObject({
      code: "generation-unavailable",
      context: expect.objectContaining({
        musicEngine: "tinymusician",
        installCommand: "npm run music:model:install",
      }),
    });
  });
});
