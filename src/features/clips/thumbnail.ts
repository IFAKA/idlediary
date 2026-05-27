import { AppError } from "@/features/errors/app-error";
import { reportError } from "@/features/errors/report-error";

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

function waitForVideoEvent(video: HTMLVideoElement, eventName: keyof HTMLMediaElementEventMap) {
  return new Promise<void>((resolve, reject) => {
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(video.error ?? new Error(`Video ${eventName} failed`));
    };
    const cleanup = () => {
      video.removeEventListener(eventName, onEvent);
      video.removeEventListener("error", onError);
    };

    video.addEventListener(eventName, onEvent, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: "image/webp" | "image/jpeg",
  quality: number,
) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, mimeType, quality);
  });
}

function drawCoverFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context is unavailable");

  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("Video frame has no dimensions");
  }

  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = canvas.width / canvas.height;
  const cropWidth = sourceRatio > targetRatio ? sourceHeight * targetRatio : sourceWidth;
  const cropHeight = sourceRatio > targetRatio ? sourceHeight : sourceWidth / targetRatio;
  const cropX = (sourceWidth - cropWidth) / 2;
  const cropY = (sourceHeight - cropHeight) / 2;

  context.drawImage(
    video,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    canvas.width,
    canvas.height,
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

    await waitForVideoEvent(video, "loadedmetadata");
    const seekTime =
      Number.isFinite(video.duration) && video.duration > 0
        ? Math.min(0.1, Math.max(video.duration - 0.05, 0))
        : 0;

    if (Math.abs(video.currentTime - seekTime) > 0.001) {
      video.currentTime = seekTime;
      await waitForVideoEvent(video, "seeked");
    } else if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await waitForVideoEvent(video, "loadeddata");
    }

    drawCoverFrame(video, canvas);

    const webpBlob = await canvasToBlob(canvas, "image/webp", 0.78);
    const thumbnailBlob = webpBlob ?? (await canvasToBlob(canvas, "image/jpeg", 0.82));
    if (!thumbnailBlob) throw new Error("Canvas thumbnail export failed");

    return {
      thumbnailBlob,
      thumbnailMimeType: thumbnailBlob.type || (webpBlob ? "image/webp" : "image/jpeg"),
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
