import { AppError } from "@/features/errors/app-error";
import type { ClipRecord } from "@/features/clips/types";
import type { ClipKeyframe } from "./types";

const keyframeRatios = [0.2, 0.5, 0.8] as const;
const maxKeyframesPerClip = 3;

export function selectKeyframeTimes(durationMs: number, cap = maxKeyframesPerClip) {
  if (durationMs <= 0) return keyframeRatios.slice(0, cap).map(() => 0);

  const safeDuration = Math.max(1, durationMs);
  const endGuardMs = safeDuration > 500 ? 80 : 0;
  return keyframeRatios
    .slice(0, cap)
    .map((ratio) => Math.round(safeDuration * ratio))
    .map((timeMs) => Math.min(Math.max(0, timeMs), Math.max(0, safeDuration - endGuardMs)));
}

export async function extractClipKeyframes(
  clips: ClipRecord[],
  options: { width?: number; quality?: number; maxFramesPerClip?: number } = {},
): Promise<ClipKeyframe[]> {
  if (typeof document === "undefined") {
    throw new AppError({
      code: "generation-unavailable",
      area: "generation",
      message: "Keyframe extraction requires browser media APIs",
      userMessage: "Generated music needs browser video support on this device.",
    });
  }

  const width = options.width ?? 224;
  const quality = options.quality ?? 0.76;
  const keyframes: ClipKeyframe[] = [];

  for (const clip of clips) {
    const times = selectKeyframeTimes(clip.durationMs, options.maxFramesPerClip);
    for (const timeMs of times) {
      keyframes.push({
        clipId: clip.id,
        timeMs,
        dataUrl: await extractFrameDataUrl(clip.blob, timeMs, width, quality),
      });
    }
  }

  return keyframes;
}

async function extractFrameDataUrl(
  blob: Blob,
  timeMs: number,
  targetWidth: number,
  quality: number,
) {
  const src = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.src = src;
  video.load();

  try {
    const metadataResult = await waitForVideoEvent(video, "loadedmetadata");
    if (metadataResult === "timeout") throw new Error("Video metadata load timed out");
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await waitForVideoEvent(video, "loadeddata");
    }

    const durationSeconds = Number.isFinite(video.duration) ? video.duration : timeMs / 1000;
    const seekSeconds = Math.min(timeMs / 1000, Math.max(0, durationSeconds - 0.08));
    if (Math.abs(video.currentTime - seekSeconds) > 0.001) {
      video.currentTime = seekSeconds;
      await waitForVideoEvent(video, "seeked");
    }

    const sourceWidth = video.videoWidth || targetWidth;
    const sourceHeight = video.videoHeight || targetWidth;
    const scale = targetWidth / sourceWidth;
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas 2D context unavailable");
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  } catch (cause) {
    throw new AppError({
      code: "generation-unavailable",
      area: "generation",
      message: "Unable to extract a clip keyframe",
      userMessage: "Generated music needs readable video frames on this device.",
      cause,
    });
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(src);
  }
}

function waitForVideoEvent(
  video: HTMLVideoElement,
  eventName: "loadedmetadata" | "loadeddata" | "seeked",
  timeoutMs = 3_500,
) {
  return new Promise<"event" | "timeout">((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      resolve("timeout");
    }, timeoutMs);
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener(eventName, handleSuccess);
      video.removeEventListener("error", handleError);
    };
    const handleSuccess = () => {
      cleanup();
      resolve("event");
    };
    const handleError = () => {
      cleanup();
      reject(video.error ?? new Error(`Video ${eventName} failed`));
    };
    video.addEventListener(eventName, handleSuccess, { once: true });
    video.addEventListener("error", handleError, { once: true });
  });
}
