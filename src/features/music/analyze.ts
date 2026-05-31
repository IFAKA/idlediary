import { AppError } from "@/features/errors/app-error";
import type { ClipKeyframe, ClipMoodDescription } from "./types";

type LocalVisionClassifier = {
  model: (inputs: { pixel_values: unknown }) => Promise<{ logits: { data: Iterable<number> } }>;
  processor: (images: unknown[]) => Promise<{ pixel_values: unknown }>;
  readImage: (image: string) => Promise<unknown>;
  idToLabel?: Record<string, string>;
};

const visionModel = "Xenova/mobilevit-small";
const modelPath = "/models/";
const wasmPath = "/transformers/";
const classificationsPerFrame = 5;

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

  const classifier = await loadLocalVisionClassifier();
  const labelsByClip = new Map<string, string[]>();
  for (const frame of keyframes) {
    const labels = await classifyFrame(classifier, frame.dataUrl);
    labelsByClip.set(frame.clipId, [...(labelsByClip.get(frame.clipId) ?? []), ...labels]);
  }

  return [...labelsByClip.entries()].map(([clipId, labels]) =>
    descriptionFromLabels(clipId, labels),
  );
}

async function loadLocalVisionClassifier() {
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

    const [processor, model] = await Promise.all([
      transformers.AutoProcessor.from_pretrained(visionModel, {
        local_files_only: true,
      }),
      transformers.AutoModelForImageClassification.from_pretrained(visionModel, {
        dtype: "q8",
        local_files_only: true,
      }),
    ]);

    return {
      model,
      processor,
      readImage: (image: string) => transformers.RawImage.read(image),
      idToLabel: (model as { config?: { id2label?: Record<string, string> } }).config?.id2label,
    } satisfies LocalVisionClassifier;
  } catch (cause) {
    throw new AppError({
      code: "generation-unavailable",
      area: "generation",
      message: "Local image analysis model could not load",
      userMessage: "Generated music needs the local music AI model installed on this device.",
      cause,
      context: {
        model: visionModel,
        modelPath,
        wasmPath,
        installCommand: "npm run music:model:install",
        causeName: cause instanceof Error ? cause.name : typeof cause,
        causeMessage: cause instanceof Error ? cause.message : String(cause),
      },
    });
  }
}

async function classifyFrame(classifier: LocalVisionClassifier, dataUrl: string) {
  try {
    const image = await classifier.readImage(dataUrl);
    const { pixel_values } = await classifier.processor([image]);
    const { logits } = await classifier.model({ pixel_values });
    const labels = topClassifications([...logits.data], classifier.idToLabel, classificationsPerFrame);
    if (labels.length === 0) throw new Error("Image model returned no labels");
    return labels;
  } catch (cause) {
    throw new AppError({
      code: "generation-unavailable",
      area: "generation",
      message: "Local image analysis failed",
      userMessage: "Generated music could not understand these clips locally.",
      cause,
      context: {
        causeName: cause instanceof Error ? cause.name : typeof cause,
        causeMessage: cause instanceof Error ? cause.message : String(cause),
      },
    });
  }
}

export function descriptionFromCaptions(
  clipId: string,
  captions: string[],
): ClipMoodDescription {
  return descriptionFromLabels(clipId, captions);
}

export function descriptionFromLabels(
  clipId: string,
  labels: string[],
): ClipMoodDescription {
  const text = labels.join(" ").toLowerCase();
  const tags = extractCaptionTags(text);
  const brightness = /night|dark|dim|black|shadow|rain|cloud/.test(text)
    ? "dim"
    : /sun|bright|white|day|sky|beach|light/.test(text)
      ? "bright"
      : "normal";

  return {
    clipId,
    description: labels.join(" / "),
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

function topClassifications(
  logits: number[],
  idToLabel: Record<string, string> | undefined,
  limit: number,
) {
  return logits
    .map((score, index) => ({
      index,
      score,
      label: idToLabel?.[index] ?? `LABEL_${index}`,
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((classification) => classification.label);
}
