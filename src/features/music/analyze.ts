import { AppError } from "@/features/errors/app-error";
import type { ClipKeyframe, ClipMoodDescription } from "./types";

type CaptionResult = { generated_text?: string; caption?: string };
type ImageToTextPipeline = (image: string) => Promise<CaptionResult[] | CaptionResult>;

const captionModel = "Xenova/vit-gpt2-image-captioning";

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

  let classifier: ImageToTextPipeline;
  try {
    const transformers = await import("@huggingface/transformers");
    classifier = (await transformers.pipeline("image-to-text", captionModel)) as ImageToTextPipeline;
  } catch (cause) {
    throw new AppError({
      code: "generation-unavailable",
      area: "generation",
      message: "Local image analysis model could not load",
      userMessage: "Generated music needs local AI support on this device.",
      cause,
    });
  }

  const captionsByClip = new Map<string, string[]>();
  for (const frame of keyframes) {
    const caption = await captionFrame(classifier, frame.dataUrl);
    captionsByClip.set(frame.clipId, [...(captionsByClip.get(frame.clipId) ?? []), caption]);
  }

  return [...captionsByClip.entries()].map(([clipId, captions]) =>
    descriptionFromCaptions(clipId, captions),
  );
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
  const tags = uniqueTags(text);
  const brightness = /night|dark|dim|black|shadow|rain|cloud/.test(text)
    ? "dim"
    : /sun|bright|white|day|sky|beach|light/.test(text)
      ? "bright"
      : "normal";
  const mood = chooseMood(text, tags, brightness);

  return {
    clipId,
    description: captions.join(" / "),
    tags,
    mood,
    energy: /street|city|car|train|crowd|walk|road|travel|beach|market/.test(text)
      ? "medium"
      : "low",
    brightness,
  };
}

function chooseMood(
  text: string,
  tags: string[],
  brightness: ClipMoodDescription["brightness"],
): ClipMoodDescription["mood"] {
  if (/rain|wet|umbrella|cloud|storm|window/.test(text)) return "rainy";
  if (/night|dark|lamp|bar|streetlight|shadow/.test(text)) return "night";
  if (/road|train|plane|car|bus|street|city|beach|mountain|walk/.test(text)) return "travel";
  if (brightness === "bright" || /sun|garden|flower|park|sky/.test(text)) return "bright";
  if (tags.some((tag) => ["home", "food", "coffee", "table", "room"].includes(tag))) return "cozy";
  return "neutral";
}

function uniqueTags(text: string) {
  const tagWords = [
    "home",
    "food",
    "coffee",
    "table",
    "room",
    "rain",
    "night",
    "city",
    "street",
    "travel",
    "sun",
    "park",
    "beach",
    "window",
  ];
  const tags = tagWords.filter((word) => text.includes(word));
  return tags.length > 0 ? tags : ["daily"];
}
