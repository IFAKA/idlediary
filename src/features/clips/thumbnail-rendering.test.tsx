import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppHeaderProvider } from "@/components/app-header-shell";
import { ClipReviewPanel } from "@/features/capture/clip-review-panel";
import { HomeScreen } from "@/features/home/home-screen";
import type { ClipRecord, VlogRecord } from "./types";

const mocks = vi.hoisted(() => ({
  getObjectUrlForClip: vi.fn(),
  getObjectUrlForVlog: vi.fn(),
  getThumbnailObjectUrlForClip: vi.fn(),
  getThumbnailObjectUrlForVlog: vi.fn(),
  listVlogSummaries: vi.fn(),
  getVlog: vi.fn(),
  markNeedsActionVlogsHandled: vi.fn(),
  releaseVlogObjectUrl: vi.fn(),
  saveVlogThumbnail: vi.fn(),
  generateVideoThumbnail: vi.fn(),
}));

vi.mock("./media-cache", () => ({
  getObjectUrlForClip: mocks.getObjectUrlForClip,
  getObjectUrlForVlog: mocks.getObjectUrlForVlog,
  getThumbnailObjectUrlForClip: mocks.getThumbnailObjectUrlForClip,
  getThumbnailObjectUrlForVlog: mocks.getThumbnailObjectUrlForVlog,
  releaseVlogObjectUrl: mocks.releaseVlogObjectUrl,
}));

vi.mock("./storage", async (importOriginal) => ({
  ...((await importOriginal()) as object),
  listVlogSummaries: mocks.listVlogSummaries,
  getVlog: mocks.getVlog,
  markNeedsActionVlogsHandled: mocks.markNeedsActionVlogsHandled,
  saveVlogThumbnail: mocks.saveVlogThumbnail,
}));

vi.mock("./thumbnail", () => ({
  generateVideoThumbnail: mocks.generateVideoThumbnail,
  thumbnailSizes: {
    clip: { width: 256, height: 256 },
    vlog: { width: 360, height: 640 },
  },
}));

function clip(overrides: Partial<ClipRecord> = {}): ClipRecord {
  const blob = new Blob(["clip"], { type: "video/webm" });
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

function vlog(overrides: Partial<VlogRecord> = {}): VlogRecord {
  const blob = new Blob(["vlog"], { type: "video/mp4" });
  return {
    id: "vlog-1",
    sessionId: "session-1",
    blob,
    mimeType: "video/mp4",
    clipCount: 1,
    title: "Two Seconds Today",
    caption: "",
    createdAt: "2026-05-27T10:00:00.000Z",
    size: blob.size,
    ...overrides,
  };
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

describe("thumbnail rendering", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn((query: string) => ({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: false,
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    });
    mocks.getObjectUrlForClip.mockReturnValue("blob:clip-video");
    mocks.getObjectUrlForVlog.mockReturnValue("blob:vlog-video");
    mocks.getThumbnailObjectUrlForClip.mockImplementation((record: ClipRecord) =>
      record.thumbnailBlob ? "blob:clip-thumb" : null,
    );
    mocks.getThumbnailObjectUrlForVlog.mockImplementation((record: VlogRecord) =>
      record.thumbnailBlob ? "blob:vlog-thumb" : null,
    );
    mocks.listVlogSummaries.mockResolvedValue([]);
    mocks.getVlog.mockResolvedValue(null);
    mocks.markNeedsActionVlogsHandled.mockResolvedValue([]);
    mocks.saveVlogThumbnail.mockResolvedValue(null);
    mocks.generateVideoThumbnail.mockResolvedValue({
      thumbnailBlob: new Blob(["thumb"], { type: "image/webp" }),
      thumbnailMimeType: "image/webp",
      thumbnailWidth: 360,
      thumbnailHeight: 640,
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("draft review cards prefer image thumbnails and fall back to video", () => {
    const withThumbnail = clip({
      thumbnailBlob: new Blob(["thumb"], { type: "image/webp" }),
      thumbnailMimeType: "image/webp",
      thumbnailWidth: 256,
      thumbnailHeight: 256,
    });
    const withoutThumbnail = clip({ id: "clip-2", order: 1 });

    act(() => {
      root.render(
        <ClipReviewPanel
          clips={[withThumbnail, withoutThumbnail]}
          isFinishing={false}
          onBack={() => undefined}
          onClearDraft={async () => true}
          onDeleteClip={async () => true}
          onMakeVideo={() => undefined}
          onReorderClips={async () => true}
        />,
      );
    });

    const first = container.querySelector('[data-clip-id="clip-1"]');
    const second = container.querySelector('[data-clip-id="clip-2"]');

    expect(first?.querySelector("img")).toHaveAttribute("src", "blob:clip-thumb");
    expect(first?.querySelector("video")).not.toBeInTheDocument();
    expect(second?.querySelector("img")).not.toBeInTheDocument();
    expect(second?.querySelector("video")).toHaveAttribute("src", "blob:clip-video");
  });

  it("saved video cards prefer image thumbnails and fall back to video", async () => {
    const withThumbnail = vlog({
      thumbnailBlob: new Blob(["thumb"], { type: "image/webp" }),
      thumbnailMimeType: "image/webp",
      thumbnailWidth: 360,
      thumbnailHeight: 640,
    });
    const withoutThumbnail = vlog({ id: "vlog-2", createdAt: "2026-05-26T10:00:00.000Z" });
    mocks.listVlogSummaries.mockResolvedValueOnce([withoutThumbnail, withThumbnail]);
    mocks.getVlog.mockResolvedValue(withoutThumbnail);

    act(() => {
      root.render(<HomeScreen />);
    });

    await waitFor(() => {
      expect(container.querySelectorAll('a[aria-label^="Open "]')).toHaveLength(2);
    });

    const cards = container.querySelectorAll('a[aria-label^="Open "]');
    expect(cards[0]?.querySelector("img")).toHaveAttribute("src", "blob:vlog-thumb");
    expect(cards[0]?.querySelector("video")).not.toBeInTheDocument();
    expect(cards[1]?.querySelector("img")).not.toBeInTheDocument();
    expect(cards[1]?.querySelector("video")).not.toBeInTheDocument();
  });

  it("highlights saved video cards that were still marked new on entry", async () => {
    const newVlog = vlog({ id: "vlog-new", needsAction: true });
    const oldVlog = vlog({
      id: "vlog-old",
      createdAt: "2026-05-26T10:00:00.000Z",
      needsAction: false,
      title: "Yesterday",
    });
    mocks.listVlogSummaries.mockResolvedValueOnce([oldVlog, newVlog]);
    mocks.markNeedsActionVlogsHandled.mockResolvedValueOnce([{ ...newVlog, needsAction: false }]);

    act(() => {
      root.render(<HomeScreen />);
    });

    await waitFor(() => {
      expect(container.querySelectorAll('a[aria-label^="Open "]')).toHaveLength(2);
    });

    expect(container.querySelector('a[aria-label="Open Two Seconds Today"]')).toHaveClass(
      "new-video-card-highlight",
    );
    expect(container.querySelector('a[aria-label="Open Yesterday"]')).not.toHaveClass(
      "new-video-card-highlight",
    );
  });

  it("does not publish a zero saved video count while loading history", async () => {
    const history = deferred<VlogRecord[]>();
    const savedVlog = vlog();
    mocks.listVlogSummaries.mockReturnValueOnce(history.promise);

    act(() => {
      root.render(
        <AppHeaderProvider>
          <HomeScreen />
        </AppHeaderProvider>,
      );
    });

    expect(container).not.toHaveTextContent("0 videos");

    await act(async () => {
      history.resolve([savedVlog]);
      await history.promise;
    });

    await waitFor(() => {
      expect(container).toHaveTextContent("1 video");
    });
  });

  it("regenerates a saved video thumbnail when the stored image fails to decode", async () => {
    const badThumbnail = vlog({
      thumbnailBlob: new Blob(["bad!"], { type: "image/webp" }),
      thumbnailMimeType: "image/webp",
      thumbnailWidth: 360,
      thumbnailHeight: 640,
    });
    const regeneratedThumbnail = {
      thumbnailBlob: new Blob(["good"], { type: "image/webp" }),
      thumbnailMimeType: "image/webp",
      thumbnailWidth: 360,
      thumbnailHeight: 640,
    };
    mocks.listVlogSummaries.mockResolvedValueOnce([badThumbnail]);
    mocks.getVlog.mockResolvedValue(badThumbnail);
    mocks.generateVideoThumbnail.mockResolvedValueOnce(regeneratedThumbnail);
    mocks.saveVlogThumbnail.mockResolvedValueOnce({
      ...badThumbnail,
      ...regeneratedThumbnail,
    });

    act(() => {
      root.render(<HomeScreen />);
    });

    await waitFor(() => {
      expect(container.querySelector('a[aria-label^="Open "] img')).toBeTruthy();
    });

    const image = container.querySelector('a[aria-label^="Open "] img');
    act(() => {
      image?.dispatchEvent(new Event("error"));
    });

    await waitFor(() => {
      expect(mocks.generateVideoThumbnail).toHaveBeenCalledWith(
        badThumbnail.blob,
        expect.objectContaining({ width: 360, height: 640 }),
      );
    });
    expect(mocks.saveVlogThumbnail).toHaveBeenCalledWith("vlog-1", regeneratedThumbnail);
  });
});
