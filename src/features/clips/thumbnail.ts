import { AppError } from "@/features/errors/app-error";
import { reportError } from "@/features/errors/report-error";
import { drawCoverFrame } from "@/features/video/cover-frame";

export type ThumbnailResult = {
  thumbnailBlob: Blob;
  thumbnailMimeType: string;
  thumbnailWidth: number;
  thumbnailHeight: number;
};

export const thumbnailSizes = {
  clip: { width: 256, height: 256 },
  vlog: { width: 360, height: 640 },
} as const;

type ThumbnailOptions = {
  width: number;
  height: number;
};

const videoLoadStageTimeoutMs = 3500;

function waitForVideoEvent(
  video: HTMLVideoElement,
  eventName: keyof HTMLMediaElementEventMap,
  timeoutMs = videoLoadStageTimeoutMs,
) {
  return new Promise<"event" | "timeout">((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      resolve("timeout");
    }, timeoutMs);
    const onEvent = () => {
      cleanup();
      resolve("event");
    };
    const onError = () => {
      cleanup();
      reject(video.error ?? new Error(`Video ${eventName} failed`));
    };
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener(eventName, onEvent);
      video.removeEventListener("error", onError);
    };

    video.addEventListener(eventName, onEvent, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType?: "image/jpeg",
  quality?: number,
) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, mimeType, quality);
  });
}

async function exportThumbnailBlob(canvas: HTMLCanvasElement) {
  const jpegBlob = await canvasToBlob(canvas, "image/jpeg", 0.86);
  if (jpegBlob && jpegBlob.size > 0) {
    return {
      blob: jpegBlob,
      mimeType: jpegBlob.type || "image/jpeg",
    };
  }

  const pngBlob = await canvasToBlob(canvas);
  if (pngBlob && pngBlob.size > 0) {
    return {
      blob: pngBlob,
      mimeType: pngBlob.type || "image/png",
    };
  }

  return null;
}

function hasDrawableVideoFrame(video: HTMLVideoElement) {
  return (
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    video.videoWidth > 0 &&
    video.videoHeight > 0
  );
}

export async function generateVideoThumbnail(
  videoBlob: Blob,
  { width, height }: ThumbnailOptions,
): Promise<ThumbnailResult> {
  const mockThumbnail =
    typeof window !== "undefined"
      ? (
          window as typeof window & {
            __idleDiaryMockVideoThumbnail?: (
              videoBlob: Blob,
              options: ThumbnailOptions,
            ) => Promise<ThumbnailResult> | ThumbnailResult;
          }
        ).__idleDiaryMockVideoThumbnail
      : undefined;
  if (mockThumbnail) return mockThumbnail(videoBlob, { width, height });

  if (typeof document === "undefined") {
    throw reportError(
      new AppError({
        code: "storage-write-failed",
        area: "storage",
        message: "Cannot generate a thumbnail outside the browser",
        userMessage: "This video thumbnail could not be generated.",
      }),
    );
  }

  const src = URL.createObjectURL(videoBlob);
  const video = document.createElement("video");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  try {
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = src;
    video.load();

    const metadataResult = await waitForVideoEvent(video, "loadedmetadata");
    if (metadataResult === "timeout") {
      throw new Error("Video metadata load timed out");
    }

    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await waitForVideoEvent(video, "loadeddata");
    }

    const seekTime =
      Number.isFinite(video.duration) && video.duration > 0
        ? Math.min(0.1, Math.max(video.duration - 0.05, 0))
        : 0;

    if (Math.abs(video.currentTime - seekTime) > 0.001) {
      video.currentTime = seekTime;
      await waitForVideoEvent(video, "seeked");
    }

    if (!hasDrawableVideoFrame(video)) {
      throw new Error("Video frame was not drawable for thumbnail generation");
    }
    drawCoverFrame(video, canvas, video.videoWidth, video.videoHeight);

    const thumbnail = await exportThumbnailBlob(canvas);
    if (!thumbnail) throw new Error("Canvas thumbnail export failed");

    return {
      thumbnailBlob: thumbnail.blob,
      thumbnailMimeType: thumbnail.mimeType,
      thumbnailWidth: width,
      thumbnailHeight: height,
    };
  } catch (cause) {
    throw reportError(
      new AppError({
        code: "storage-write-failed",
        area: "storage",
        message: "Could not generate video thumbnail",
        userMessage: "This video thumbnail could not be generated.",
        cause,
        context: { videoBytes: videoBlob.size, width, height },
      }),
    );
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(src);
  }
}
