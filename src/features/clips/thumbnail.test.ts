import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateVideoThumbnail } from "./thumbnail";

describe("generateVideoThumbnail", () => {
  const originalCreateElement = document.createElement.bind(document);
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  let drawImage: ReturnType<typeof vi.fn>;
  let toBlobImpl: (
    callback: BlobCallback,
    type?: string,
    quality?: unknown,
  ) => void;

  beforeEach(() => {
    drawImage = vi.fn();
    toBlobImpl = (callback, type) => {
      callback(new Blob(["thumb"], { type }));
    };
    URL.createObjectURL = vi.fn(() => "blob:video");
    URL.revokeObjectURL = vi.fn();

    vi.spyOn(document, "createElement").mockImplementation((tagName) => {
      if (tagName === "video") {
        const video = originalCreateElement("video");
        let currentTime = 0;

        Object.defineProperties(video, {
          currentTime: {
            configurable: true,
            get: () => currentTime,
            set: (value: number) => {
              currentTime = value;
              window.setTimeout(() => video.dispatchEvent(new Event("seeked")), 0);
            },
          },
          duration: { configurable: true, value: 3 },
          readyState: { configurable: true, value: HTMLMediaElement.HAVE_METADATA },
          videoHeight: { configurable: true, value: 1280 },
          videoWidth: { configurable: true, value: 720 },
        });
        video.load = vi.fn(() => {
          window.setTimeout(() => video.dispatchEvent(new Event("loadedmetadata")), 0);
        });
        return video;
      }

      if (tagName === "canvas") {
        const canvas = originalCreateElement("canvas");
        Object.defineProperty(canvas, "getContext", {
          configurable: true,
          value: vi.fn(() => ({ drawImage }) as unknown as CanvasRenderingContext2D),
        });
        Object.defineProperty(canvas, "toBlob", {
          configurable: true,
          value: vi.fn((callback: BlobCallback, type?: string, quality?: unknown) =>
            toBlobImpl(callback, type, quality),
          ),
        });
        return canvas;
      }

      return originalCreateElement(tagName);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
    delete (
      window as typeof window & { __idleDiaryMockVideoThumbnail?: unknown }
    ).__idleDiaryMockVideoThumbnail;
  });

  it("draws a cover frame and exports a WebP thumbnail", async () => {
    const thumbnail = await generateVideoThumbnail(new Blob(["video"]), {
      width: 256,
      height: 256,
    });

    expect(thumbnail.thumbnailMimeType).toBe("image/webp");
    expect(thumbnail.thumbnailWidth).toBe(256);
    expect(thumbnail.thumbnailHeight).toBe(256);
    expect(drawImage).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:video");
  });

  it("falls back to JPEG when WebP export returns no blob", async () => {
    toBlobImpl = (callback, type) => {
      callback(type === "image/webp" ? null : new Blob(["thumb"], { type }));
    };

    const thumbnail = await generateVideoThumbnail(new Blob(["video"]), {
      width: 360,
      height: 640,
    });

    expect(thumbnail.thumbnailMimeType).toBe("image/jpeg");
    expect(thumbnail.thumbnailWidth).toBe(360);
    expect(thumbnail.thumbnailHeight).toBe(640);
  });

  it("reports failures when no thumbnail can be exported", async () => {
    toBlobImpl = (callback) => callback(null);

    await expect(
      generateVideoThumbnail(new Blob(["video"]), {
        width: 256,
        height: 256,
      }),
    ).rejects.toMatchObject({
      code: "storage-write-failed",
      message: "Could not generate video thumbnail",
    });
  });

  it("uses the test thumbnail hook when present", async () => {
    (
      window as typeof window & {
        __idleDiaryMockVideoThumbnail?: typeof generateVideoThumbnail;
      }
    ).__idleDiaryMockVideoThumbnail = vi.fn(async () => ({
      thumbnailBlob: new Blob(["mock"], { type: "image/webp" }),
      thumbnailMimeType: "image/webp",
      thumbnailWidth: 10,
      thumbnailHeight: 20,
    }));

    const thumbnail = await generateVideoThumbnail(new Blob(["video"]), {
      width: 256,
      height: 256,
    });

    expect(thumbnail.thumbnailWidth).toBe(10);
    expect(document.createElement).not.toHaveBeenCalled();
  });
});
