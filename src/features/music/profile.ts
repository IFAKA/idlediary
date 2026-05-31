import type { ClipRecord } from "@/features/clips/types";
import type { VisualMusicProfile } from "./types";

export const visualMusicProfileVersion = 10;

type VisualMetrics = Pick<VisualMusicProfile, "brightness" | "saturation" | "contrast" | "warmth">;

const neutralVisualMetrics: VisualMetrics = {
  brightness: 0.5,
  saturation: 0.42,
  contrast: 0.36,
  warmth: 0.5,
};

export async function buildVisualMusicProfile(clips: ClipRecord[]): Promise<VisualMusicProfile> {
  const durationSeconds = clips.reduce((total, clip) => total + clip.durationMs / 1000, 0);
  const clipPacing = clamp(clips.length / Math.max(durationSeconds / 60, 0.05), 0, 36) / 36;
  const audioActivity = estimateOriginalAudioActivity(clips, durationSeconds);
  const metrics = await Promise.all(clips.map((clip) => visualMetricsForClip(clip)));
  const visual = averageVisualMetrics(metrics.length > 0 ? metrics : [neutralVisualMetrics]);

  return {
    version: visualMusicProfileVersion,
    brightness: roundMetric(visual.brightness),
    saturation: roundMetric(visual.saturation),
    contrast: roundMetric(visual.contrast),
    warmth: roundMetric(visual.warmth),
    pacing: roundMetric(clipPacing),
    originalAudioActivity: roundMetric(audioActivity),
  };
}

export function profileSignature(profile: VisualMusicProfile) {
  return [
    `v${profile.version}`,
    profile.brightness,
    profile.saturation,
    profile.contrast,
    profile.warmth,
    profile.pacing,
    profile.originalAudioActivity,
  ].join("|");
}

async function visualMetricsForClip(clip: ClipRecord): Promise<VisualMetrics> {
  const thumbnailMetrics = await readThumbnailMetrics(clip.thumbnailBlob);
  if (thumbnailMetrics) return thumbnailMetrics;

  if (clip.analysis?.brightness === "dim") return { ...neutralVisualMetrics, brightness: 0.28, saturation: 0.34 };
  if (clip.analysis?.brightness === "bright") return { ...neutralVisualMetrics, brightness: 0.72, saturation: 0.52 };
  return neutralVisualMetrics;
}

async function readThumbnailMetrics(thumbnail: Blob | undefined): Promise<VisualMetrics | null> {
  if (!thumbnail || typeof createImageBitmap === "undefined" || typeof document === "undefined") return null;

  try {
    const bitmap = await createImageBitmap(thumbnail);
    const sampleSize = 32;
    const canvas = document.createElement("canvas");
    canvas.width = sampleSize;
    canvas.height = sampleSize;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      bitmap.close();
      return null;
    }

    context.drawImage(bitmap, 0, 0, sampleSize, sampleSize);
    bitmap.close();
    const pixels = context.getImageData(0, 0, sampleSize, sampleSize).data;
    let brightness = 0;
    let saturation = 0;
    let warmth = 0;
    const luminanceValues: number[] = [];

    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index] / 255;
      const green = pixels[index + 1] / 255;
      const blue = pixels[index + 2] / 255;
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      brightness += luminance;
      saturation += max === 0 ? 0 : (max - min) / max;
      warmth += clamp((red - blue + 1) / 2, 0, 1);
      luminanceValues.push(luminance);
    }

    const count = luminanceValues.length || 1;
    const mean = brightness / count;
    const variance =
      luminanceValues.reduce((total, luminance) => total + (luminance - mean) ** 2, 0) / count;

    return {
      brightness: mean,
      saturation: saturation / count,
      contrast: clamp(Math.sqrt(variance) * 2.2, 0, 1),
      warmth: warmth / count,
    };
  } catch {
    return null;
  }
}

function averageVisualMetrics(metrics: VisualMetrics[]): VisualMetrics {
  const total = metrics.reduce<VisualMetrics>(
    (sum, metric) => ({
      brightness: sum.brightness + metric.brightness,
      saturation: sum.saturation + metric.saturation,
      contrast: sum.contrast + metric.contrast,
      warmth: sum.warmth + metric.warmth,
    }),
    { brightness: 0, saturation: 0, contrast: 0, warmth: 0 },
  );
  const count = metrics.length || 1;
  return {
    brightness: total.brightness / count,
    saturation: total.saturation / count,
    contrast: total.contrast / count,
    warmth: total.warmth / count,
  };
}

function estimateOriginalAudioActivity(clips: ClipRecord[], durationSeconds: number) {
  const bytesPerSecond = clips.reduce((total, clip) => total + clip.size, 0) / Math.max(durationSeconds, 0.5);
  return clamp((bytesPerSecond - 80_000) / 260_000, 0, 1);
}

function roundMetric(value: number) {
  return Math.round(clamp(value, 0, 1) * 1000) / 1000;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
