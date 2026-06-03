import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useClips } from "./use-clips";
import type { ClipRecord, SessionSummary } from "./types";

const mocks = vi.hoisted(() => ({
  clearClipsForSession: vi.fn(),
  deleteClip: vi.fn(),
  getOrCreateTodaySession: vi.fn(),
  listClips: vi.fn(),
  saveClip: vi.fn(),
  saveClipThumbnail: vi.fn(),
  saveClipOrder: vi.fn(),
  generateVideoThumbnail: vi.fn(),
  enqueueClipMoodAnalysis: vi.fn(),
  releaseAllClipObjectUrls: vi.fn(),
  releaseClipObjectUrl: vi.fn(),
  retainClipObjectUrls: vi.fn(),
}));

vi.mock("./storage", () => ({
  clearClipsForSession: mocks.clearClipsForSession,
  deleteClip: mocks.deleteClip,
  getOrCreateTodaySession: mocks.getOrCreateTodaySession,
  listClips: mocks.listClips,
  saveClip: mocks.saveClip,
  saveClipThumbnail: mocks.saveClipThumbnail,
  saveClipOrder: mocks.saveClipOrder,
}));

vi.mock("./thumbnail", () => ({
  generateVideoThumbnail: mocks.generateVideoThumbnail,
  thumbnailSizes: {
    clip: { width: 256, height: 256 },
    vlog: { width: 360, height: 640 },
  },
}));

vi.mock("@/features/music/clip-analysis-queue", () => ({
  enqueueClipMoodAnalysis: mocks.enqueueClipMoodAnalysis,
}));

vi.mock("./media-cache", () => ({
  releaseAllClipObjectUrls: mocks.releaseAllClipObjectUrls,
  releaseClipObjectUrl: mocks.releaseClipObjectUrl,
  retainClipObjectUrls: mocks.retainClipObjectUrls,
}));

const session: SessionSummary = {
  id: "2026-05-27",
  startedAt: "2026-05-27T10:00:00.000Z",
  updatedAt: "2026-05-27T10:00:00.000Z",
};

function makeClip(id: string, order: number): ClipRecord {
  const blob = new Blob([id], { type: "video/webm" });
  return {
    id,
    sessionId: session.id,
    blob,
    mimeType: "video/webm",
    durationMs: 3000,
    order,
    createdAt: `2026-05-27T10:00:0${order}.000Z`,
    size: blob.size,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

type UseClipsValue = ReturnType<typeof useClips>;

function UseClipsProbe({ onValue }: { onValue: (value: UseClipsValue) => void }) {
  onValue(useClips());
  return null;
}

async function waitFor(assertion: () => void) {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < 1000) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await Promise.resolve();
      });
    }
  }

  throw lastError;
}

describe("useClips", () => {
  let container: HTMLDivElement;
  let root: Root | null;
  let latest: UseClipsValue | null;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "clip-new"),
    });
    mocks.getOrCreateTodaySession.mockResolvedValue(session);
    mocks.listClips.mockResolvedValue([]);
    mocks.saveClip.mockResolvedValue(undefined);
    mocks.saveClipThumbnail.mockResolvedValue(null);
    mocks.saveClipOrder.mockResolvedValue(undefined);
    mocks.generateVideoThumbnail.mockResolvedValue({
      thumbnailBlob: new Blob(["thumb"], { type: "image/webp" }),
      thumbnailMimeType: "image/webp",
      thumbnailWidth: 256,
      thumbnailHeight: 256,
    });
    mocks.enqueueClipMoodAnalysis.mockResolvedValue({
      clipId: "clip-new",
      description: "daily clip",
      moodCues: ["daily"],
      mood: "daily",
      energy: "low",
      brightness: "normal",
    });
    mocks.deleteClip.mockResolvedValue(undefined);
    mocks.clearClipsForSession.mockResolvedValue(undefined);
    container = document.createElement("div");
    document.body.append(container);
    root = null;
    latest = null;
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container.remove();
    vi.unstubAllGlobals();
  });

  function renderUseClips() {
    root = createRoot(container);
    act(() => {
      root?.render(<UseClipsProbe onValue={(value) => (latest = value)} />);
    });
  }

  it("ignores stale refresh results after a newer delete", async () => {
    const first = makeClip("clip-1", 0);
    const second = makeClip("clip-2", 1);
    const refresh = deferred<ClipRecord[]>();
    mocks.listClips
      .mockResolvedValueOnce([first, second])
      .mockReturnValueOnce(refresh.promise);

    renderUseClips();
    await waitFor(() => expect(latest?.loading).toBe(false));

    await act(async () => {
      const refreshPromise = latest!.refresh(session.id);
      await latest!.removeClip(first.id);
      refresh.resolve([first, second]);
      await refreshPromise;
    });

    expect(latest?.clips.map((clip) => clip.id)).toEqual([second.id]);
    expect(mocks.releaseClipObjectUrl).toHaveBeenCalledWith(first.id);
  });

  it("updates local state after successful add, reorder, and clear mutations", async () => {
    const first = makeClip("clip-1", 0);
    const secondBlob = new Blob(["second"], { type: "video/webm" });
    mocks.listClips.mockResolvedValueOnce([first]);

    renderUseClips();
    await waitFor(() => expect(latest?.loading).toBe(false));

    await act(async () => {
      await latest!.addClip(secondBlob, 3000);
    });
    expect(latest?.clips.map((clip) => clip.id)).toEqual(["clip-1", "clip-new"]);
    expect(mocks.saveClip).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "clip-new",
        thumbnailMimeType: "image/webp",
        thumbnailWidth: 256,
        thumbnailHeight: 256,
      }),
    );
    expect(mocks.listClips).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueClipMoodAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ id: "clip-new" }),
    );
    await waitFor(() => expect(latest?.clips[1]?.analysis?.mood).toBe("daily"));

    await act(async () => {
      await latest!.reorderClips(["clip-new", "clip-1"]);
    });
    expect(latest?.clips.map((clip) => clip.id)).toEqual(["clip-new", "clip-1"]);
    expect(mocks.saveClipOrder).toHaveBeenCalledWith(session.id, ["clip-new", "clip-1"]);

    await act(async () => {
      await latest!.clearClips();
    });
    expect(latest?.clips).toEqual([]);
    expect(mocks.clearClipsForSession).toHaveBeenCalledWith(session.id);
    expect(mocks.releaseAllClipObjectUrls).toHaveBeenCalled();
  });

  it("saves and adds a new clip when initial thumbnail generation fails", async () => {
    const secondBlob = new Blob(["second"], { type: "video/webm" });
    mocks.generateVideoThumbnail.mockRejectedValueOnce(new Error("thumbnail failed"));

    renderUseClips();
    await waitFor(() => expect(latest?.loading).toBe(false));

    await act(async () => {
      await latest!.addClip(secondBlob, 3000);
    });

    expect(mocks.saveClip).toHaveBeenCalledWith(
      expect.not.objectContaining({
        thumbnailBlob: expect.any(Blob),
      }),
    );
    expect(latest?.clips.map((clip) => clip.id)).toEqual(["clip-new"]);
  });

  it("backfills thumbnails for loaded clips that do not have one", async () => {
    const clip = makeClip("clip-1", 0);
    const updatedClip = {
      ...clip,
      thumbnailBlob: new Blob(["thumb"], { type: "image/webp" }),
      thumbnailMimeType: "image/webp",
      thumbnailWidth: 256,
      thumbnailHeight: 256,
    };
    mocks.listClips.mockResolvedValueOnce([clip]);
    mocks.saveClipThumbnail.mockResolvedValueOnce(updatedClip);

    renderUseClips();

    await waitFor(() => expect(latest?.clips[0]?.thumbnailBlob).toBeDefined());
    expect(mocks.saveClipThumbnail).toHaveBeenCalledWith(
      clip.id,
      expect.objectContaining({ thumbnailMimeType: "image/webp" }),
    );
  });

  it("keeps state unchanged when a mutation fails", async () => {
    const clip = makeClip("clip-1", 0);
    mocks.listClips.mockResolvedValueOnce([clip]);
    mocks.deleteClip.mockRejectedValueOnce(new Error("delete failed"));

    renderUseClips();
    await waitFor(() => expect(latest?.loading).toBe(false));

    await expect(async () => {
      await act(async () => {
        await latest!.removeClip(clip.id);
      });
    }).rejects.toThrow("delete failed");

    expect(latest?.clips.map((item) => item.id)).toEqual([clip.id]);
    expect(mocks.releaseClipObjectUrl).not.toHaveBeenCalled();
  });

  it("can clear only local clip state after an external storage mutation succeeds", async () => {
    const clip = makeClip("clip-1", 0);
    mocks.listClips.mockResolvedValueOnce([clip]);

    renderUseClips();
    await waitFor(() => expect(latest?.loading).toBe(false));

    act(() => {
      latest!.clearLocalClips();
    });

    expect(latest?.clips).toEqual([]);
    expect(mocks.clearClipsForSession).not.toHaveBeenCalled();
    expect(mocks.releaseAllClipObjectUrls).toHaveBeenCalled();
  });
});
