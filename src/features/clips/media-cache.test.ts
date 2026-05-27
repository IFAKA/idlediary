import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getObjectUrlForClip,
  getThumbnailObjectUrlForClip,
  releaseAllClipObjectUrls,
  releaseClipObjectUrl,
} from "./media-cache";
import type { ClipRecord } from "./types";

function makeClip(overrides: Partial<ClipRecord> = {}): ClipRecord {
  const blob = new Blob(["video"], { type: "video/webm" });
  return {
    id: "clip-1",
    sessionId: "session-1",
    blob,
    mimeType: "video/webm",
    durationMs: 3000,
    order: 0,
    createdAt: "2026-05-27T10:00:00.000Z",
    size: blob.size,
    ...overrides,
  };
}

describe("media cache", () => {
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  let nextUrlId = 0;

  beforeEach(() => {
    nextUrlId = 0;
    URL.createObjectURL = vi.fn(() => `blob:mock-${nextUrlId++}`);
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    releaseAllClipObjectUrls();
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  });

  it("reuses the URL for the same clip version", () => {
    const clip = makeClip();

    expect(getObjectUrlForClip(clip)).toBe("blob:mock-0");
    expect(getObjectUrlForClip(clip)).toBe("blob:mock-0");

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it("creates a new URL and revokes the old URL when the clip version changes", () => {
    const clip = makeClip();
    const updated = makeClip({
      blob: new Blob(["new-video"], { type: "video/webm" }),
      size: 9,
    });

    expect(getObjectUrlForClip(clip)).toBe("blob:mock-0");
    expect(getObjectUrlForClip(updated)).toBe("blob:mock-1");

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-0");
  });

  it("revokes clip URLs on delete and clear", () => {
    const first = makeClip({ id: "clip-1" });
    const second = makeClip({ id: "clip-2" });

    getObjectUrlForClip(first);
    getObjectUrlForClip(second);

    releaseClipObjectUrl(first.id);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-0");

    releaseAllClipObjectUrls();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-1");
  });

  it("caches thumbnail URLs separately from video URLs and revokes both on delete", () => {
    const clip = makeClip({
      thumbnailBlob: new Blob(["thumb"], { type: "image/webp" }),
      thumbnailMimeType: "image/webp",
      thumbnailWidth: 256,
      thumbnailHeight: 256,
    });

    expect(getObjectUrlForClip(clip)).toBe("blob:mock-0");
    expect(getThumbnailObjectUrlForClip(clip)).toBe("blob:mock-1");
    expect(getThumbnailObjectUrlForClip(clip)).toBe("blob:mock-1");

    releaseClipObjectUrl(clip.id);

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-0");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-1");
  });

  it("refreshes a thumbnail URL when the thumbnail version changes", () => {
    const clip = makeClip({
      thumbnailBlob: new Blob(["thumb"], { type: "image/webp" }),
      thumbnailMimeType: "image/webp",
      thumbnailWidth: 256,
      thumbnailHeight: 256,
    });
    const updated = {
      ...clip,
      thumbnailBlob: new Blob(["new-thumb"], { type: "image/webp" }),
    };

    expect(getThumbnailObjectUrlForClip(clip)).toBe("blob:mock-0");
    expect(getThumbnailObjectUrlForClip(updated)).toBe("blob:mock-1");

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-0");
  });
});
