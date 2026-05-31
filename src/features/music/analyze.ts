import { AppError } from "@/features/errors/app-error";
import type { ClipKeyframe, ClipMoodDescription } from "./types";

type CaptionResult = { generated_text?: string; caption?: string };
type ImageToTextPipeline = (image: string) => Promise<CaptionResult[] | CaptionResult>;

const captionModel = "Xenova/vit-gpt2-image-captioning";
const modelPath = "/models/";
const wasmPath = "/transformers/";

export async function analyzeClipMoodDescriptions(
  keyframes: ClipKeyframe[],
): Promise<ClipMoodDescription[]> {
  if (keyframes.length === 0) {
    throw new AppError({
      code: "generation-unavailable",
      area: "generation",
      message: "No keyframes available for generated music analysis",
      userMessage: "Generated music needs at least one readable clip frame.",
    });
  }

  const classifier = await loadLocalCaptioner();
  const captionsByClip = new Map<string, string[]>();
  for (const frame of keyframes) {
    const caption = await captionFrame(classifier, frame.dataUrl);
    captionsByClip.set(frame.clipId, [...(captionsByClip.get(frame.clipId) ?? []), caption]);
  }

  return [...captionsByClip.entries()].map(([clipId, captions]) =>
    descriptionFromCaptions(clipId, captions),
  );
}

async function loadLocalCaptioner() {
  try {
    const transformers = await import("@huggingface/transformers");
    transformers.env.allowLocalModels = true;
    transformers.env.allowRemoteModels = false;
    transformers.env.localModelPath = modelPath;
    const onnxBackend = transformers.env.backends.onnx as {
      wasm?: { wasmPaths?: string };
    };
    onnxBackend.wasm ??= {};
    onnxBackend.wasm.wasmPaths = wasmPath;

    return (await transformers.pipeline("image-to-text", captionModel, {
      dtype: "q8",
      local_files_only: true,
    })) as ImageToTextPipeline;
  } catch (cause) {
    throw new AppError({
      code: "generation-unavailable",
      area: "generation",
      message: "Local image analysis model could not load",
      userMessage: "Generated music needs the local music AI model installed on this device.",
      cause,
      context: {
        model: captionModel,
        modelPath,
        wasmPath,
        installCommand: "npm run music:model:install",
      },
    });
  }
}

async function captionFrame(classifier: ImageToTextPipeline, dataUrl: string) {
  try {
    const result = await classifier(dataUrl);
    const first = Array.isArray(result) ? result[0] : result;
    const caption = first?.generated_text ?? first?.caption;
    if (!caption) throw new Error("Image model returned no caption");
    return caption;
  } catch (cause) {
    throw new AppError({
      code: "generation-unavailable",
      area: "generation",
      message: "Local image analysis failed",
      userMessage: "Generated music could not understand these clips locally.",
      cause,
    });
  }
}

export function descriptionFromCaptions(
  clipId: string,
  captions: string[],
): ClipMoodDescription {
  const text = captions.join(" ").toLowerCase();
  const tags = extractCaptionTags(text);
  const brightness = /night|dark|dim|black|shadow|rain|cloud/.test(text)
    ? "dim"
    : /sun|bright|white|day|sky|beach|light/.test(text)
      ? "bright"
      : "normal";

  return {
    clipId,
    description: captions.join(" / "),
    tags,
    mood: tags[0] ?? "daily",
    energy: tags.length >= 5 ? "medium" : "low",
    brightness,
  };
}

function extractCaptionTags(text: string) {
  const stopWords = new Set([
    "with",
    "from",
    "that",
    "this",
    "there",
    "their",
    "into",
    "onto",
    "through",
    "another",
    "some",
    "very",
    "over",
    "under",
    "laying",
    "standing",
    "sitting",
    "looking",
    "showing",
    "holding",
  ]);
  const words = text
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 3 && !stopWords.has(word));

  return [...new Set(words)].slice(0, 8);
}
