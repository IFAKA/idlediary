import { describe, expect, it, vi } from "vitest";
import { analyzeClipMoodDescriptions, descriptionFromCaptions } from "./analyze";

const transformerMocks = vi.hoisted(() => ({
  processor: vi.fn(),
  model: vi.fn(),
  rawRead: vi.fn(),
}));

vi.mock("@huggingface/transformers", () => {
  const RawImage = {
    fromURL: vi.fn((image: string) => ({ image })),
    read(this: { fromURL?: (image: string) => unknown }, image: string) {
      if (this !== RawImage) {
        throw new Error("RawImage.read lost its class binding");
      }
      return this.fromURL?.(image);
    },
  };
  transformerMocks.rawRead.mockImplementation(RawImage.read.bind(RawImage));

  return {
    env: {
      allowLocalModels: false,
      allowRemoteModels: true,
      localModelPath: "",
      backends: { onnx: {} },
    },
    AutoProcessor: {
      from_pretrained: vi.fn(async () => transformerMocks.processor),
    },
    AutoModelForImageClassification: {
      from_pretrained: vi.fn(async () => {
        (transformerMocks.model as typeof transformerMocks.model & {
          config: { id2label: Record<number, string> };
        }).config = {
          id2label: {
            0: "rainy window",
            1: "coffee cup",
            2: "bright beach",
          },
        };
        return transformerMocks.model;
      }),
    },
    RawImage,
  };
});

describe("descriptionFromCaptions", () => {
  it("returns strict mood fields from local captions", () => {
    expect(descriptionFromCaptions("clip-1", ["a rainy night street through a window"])).toEqual({
      clipId: "clip-1",
      description: "a rainy night street through a window",
      moodCues: ["rainy", "night", "street", "window"],
      mood: "rainy",
      energy: "low",
      brightness: "dim",
    });
  });

  it("falls back to a neutral music mood for noisy object labels", () => {
    expect(
      descriptionFromCaptions("clip-1", [
        "shower curtain",
        "oxygen mask",
        "mask",
        "sunglass",
        "safety pin",
      ]),
    ).toEqual({
      clipId: "clip-1",
      description: "shower curtain / oxygen mask / mask / sunglass / safety pin",
      moodCues: [],
      mood: "daily",
      energy: "low",
      brightness: "normal",
    });
  });
});

describe("analyzeClipMoodDescriptions", () => {
  it("classifies frame data without losing the RawImage static method binding", async () => {
    transformerMocks.processor.mockResolvedValue({ pixel_values: "pixels" });
    transformerMocks.model.mockResolvedValue({
      logits: {
        data: [0.9, 0.5, 0.1],
      },
    });

    await expect(
      analyzeClipMoodDescriptions([
        {
          clipId: "clip-1",
          timeMs: 100,
          dataUrl: "data:image/jpeg;base64,frame",
        },
      ]),
    ).resolves.toEqual([
      {
        clipId: "clip-1",
        description: "rainy window / coffee cup / bright beach",
        moodCues: ["rainy", "window", "coffee", "bright", "beach"],
        mood: "rainy",
        energy: "medium",
        brightness: "dim",
      },
    ]);
    expect(transformerMocks.processor).toHaveBeenCalledWith([
      { image: "data:image/jpeg;base64,frame" },
    ]);
  });
});
