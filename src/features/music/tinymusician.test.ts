import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildTinyMusicianPrompt,
  generateTinyMusicianWav,
  musicDurationSecondsForVideo,
  resetTinyMusicianForTests,
  verifyTinyMusicianReadiness,
} from "./tinymusician";
import type { ClipMoodDescription, MusicPlan } from "./types";

const transformerMocks = vi.hoisted(() => ({
  tokenizer: vi.fn(),
  generate: vi.fn(),
  tokenizerFromPretrained: vi.fn(),
  modelFromPretrained: vi.fn(),
}));

vi.mock("@huggingface/transformers", () => ({
  env: {
    allowLocalModels: false,
    allowRemoteModels: true,
    localModelPath: "",
    backends: { onnx: {} },
  },
  AutoTokenizer: {
    from_pretrained: transformerMocks.tokenizerFromPretrained,
  },
  MusicgenForConditionalGeneration: {
    from_pretrained: transformerMocks.modelFromPretrained,
  },
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
    transformerMocks.tokenizer.mockReset();
    transformerMocks.generate.mockReset();
    transformerMocks.tokenizerFromPretrained.mockReset();
    transformerMocks.modelFromPretrained.mockReset();
    transformerMocks.tokenizer.mockReturnValue({
      input_ids: "input-ids",
      attention_mask: "attention-mask",
    });
    transformerMocks.generate.mockResolvedValue({
      data: new Float32Array([0, 0.2, -0.2, 0.1]),
    });
    transformerMocks.tokenizerFromPretrained.mockResolvedValue(transformerMocks.tokenizer);
    transformerMocks.modelFromPretrained.mockResolvedValue({
      config: {
        audio_encoder: {
          sampling_rate: 24_000,
        },
      },
      generate: transformerMocks.generate,
    });
  });

  afterEach(() => {
    resetTinyMusicianForTests();
    delete (window as typeof window & { __idleDiaryMockTinyMusician?: unknown }).__idleDiaryMockTinyMusician;
    delete (navigator as Navigator & { gpu?: unknown }).gpu;
  });

  it("builds an instrumental lo-fi prompt from plan and video analysis", () => {
    expect(buildTinyMusicianPrompt(plan, [description])).toBe(
      "Clean mellow lo-fi hip hop instrumental, 74 BPM steady relaxed groove, simple warm Rhodes two chord progression, soft brushed drums with muted kick and snare, gentle hi hats, round sub bass following the chords, subtle vinyl texture with low noise, coffee home mood background feel, key C major pentatonic, texture vinyl, minimal arrangement, no lead melody, no vocals, no distortion, no glitch, no busy percussion, no abrupt changes, seamless calm loop.",
    );
  });

  it("filters noisy vision labels out of the lo-fi prompt", () => {
    expect(
      buildTinyMusicianPrompt(
        { ...plan, mood: "oxygen" },
        [
          {
            ...description,
            description: "oxygen mask / shower curtain",
            tags: ["oxygen", "mask", "shower", "curtain"],
            mood: "oxygen",
          },
        ],
      ),
    ).toContain("daily mood background feel");
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

  it("generates TinyMusician audio from local WebGPU assets with the MusicGen API", async () => {
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
    expect(transformerMocks.tokenizerFromPretrained).toHaveBeenCalledWith("itsmax/TinyMusician", {
      local_files_only: true,
    });
    expect(transformerMocks.modelFromPretrained).toHaveBeenCalledWith(
      "itsmax/TinyMusician",
      {
        device: "webgpu",
        dtype: "fp32",
        local_files_only: true,
      },
    );
    expect(transformerMocks.tokenizer).toHaveBeenCalledWith(
      expect.stringContaining("Clean mellow lo-fi hip hop instrumental"),
      {
        padding: true,
        truncation: true,
      },
    );
    expect(transformerMocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        input_ids: "input-ids",
        attention_mask: "attention-mask",
        do_sample: true,
        guidance_scale: 4,
        temperature: 0.65,
      }),
    );
  });

  it("verifies WebGPU and required local model files before generation", async () => {
    Object.defineProperty(navigator, "gpu", {
      configurable: true,
      value: {},
    });
    const fetcher = vi.fn().mockResolvedValue({ ok: true });

    await expect(verifyTinyMusicianReadiness(fetcher)).resolves.toBeUndefined();

    expect(fetcher).toHaveBeenCalledTimes(6);
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/models/itsmax/TinyMusician/config.json"),
      expect.objectContaining({ method: "HEAD" }),
    );
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/models/itsmax/TinyMusician/onnx/text_encoder.onnx"),
      expect.objectContaining({ method: "HEAD" }),
    );
  });

  it("throws a clear readiness error when a local model file is missing", async () => {
    Object.defineProperty(navigator, "gpu", {
      configurable: true,
      value: {},
    });
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 404 });

    await expect(verifyTinyMusicianReadiness(fetcher)).rejects.toMatchObject({
      code: "generation-unavailable",
      context: expect.objectContaining({
        musicEngine: "tinymusician",
        installCommand: "npm run music:model:install",
        causeMessage: expect.stringContaining("TinyMusician file missing"),
      }),
    });
  });

  it("throws a clear local-model error when TinyMusician cannot load", async () => {
    Object.defineProperty(navigator, "gpu", {
      configurable: true,
      value: {},
    });
    transformerMocks.modelFromPretrained.mockRejectedValue(new Error("missing local model file"));

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
