import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CameraPreview } from "./camera-preview";

const debugEvents = vi.hoisted(() => ({
  addDebugEvent: vi.fn(),
}));

vi.mock("@/features/errors/debug-store", () => ({
  addDebugEvent: debugEvents.addDebugEvent,
}));

function makeStream() {
  return {} as MediaStream;
}

function setVideoSize(video: HTMLVideoElement, width = 1280, height = 720) {
  Object.defineProperty(video, "videoWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(video, "videoHeight", {
    configurable: true,
    value: height,
  });
}

describe("CameraPreview", () => {
  let container: HTMLDivElement;
  let root: Root;
  let drawImage: ReturnType<typeof vi.fn>;
  let clearRect: ReturnType<typeof vi.fn>;
  let fillRect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    drawImage = vi.fn();
    clearRect = vi.fn();
    fillRect = vi.fn();
    debugEvents.addDebugEvent.mockClear();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 16),
    );
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => window.clearTimeout(handle));
    Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
      configurable: true,
      value: null,
      writable: true,
    });
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: vi.fn(() => ({ clearRect, drawImage, fillRect })),
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    root.unmount();
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows the mesh placeholder when no stream is available", () => {
    act(() => {
      root.render(<CameraPreview stream={null} />);
    });

    const backdrop = container.querySelector(
      '[data-testid="camera-preview-backdrop"]',
    ) as HTMLElement;
    const frame = container.querySelector('[data-testid="camera-preview-frame"]') as HTMLElement;
    expect(backdrop).toBeInTheDocument();
    expect(frame).not.toContainElement(backdrop);
    expect(container.querySelector('[data-testid="camera-preview-placeholder"]')).toBeInTheDocument();
    expect(container.querySelector('[aria-label="Camera preview"]')).not.toBeInTheDocument();
  });

  it("keeps the placeholder over a new stream until the video is ready and settled", () => {
    const stream = makeStream();
    act(() => {
      root.render(<CameraPreview stream={stream} />);
    });

    const placeholder = container.querySelector('[data-testid="camera-preview-placeholder"]');
    const canvas = container.querySelector('[aria-label="Camera preview"]') as HTMLCanvasElement;
    const video = container.querySelector('[data-testid="camera-preview-source"]') as HTMLVideoElement;
    expect(placeholder).not.toBeNull();
    expect(canvas).not.toBeNull();
    expect(video).not.toBeNull();
    expect(placeholder).toHaveAttribute("data-preview-ready", "false");
    expect(video).toHaveProperty("srcObject", stream);
    expect(canvas).toHaveAttribute("width", "720");
    expect(canvas).toHaveAttribute("height", "1280");
    expect(
      (container.querySelector('[data-testid="camera-preview-frame"]') as HTMLElement).style
        .aspectRatio,
    ).toBe("0.5625");

    setVideoSize(video);
    act(() => {
      video.dispatchEvent(new Event("loadedmetadata", { bubbles: true }));
      video.dispatchEvent(new Event("loadeddata", { bubbles: true }));
    });

    act(() => {
      vi.advanceTimersByTime(16);
    });

    expect(clearRect).not.toHaveBeenCalled();
    expect(fillRect).not.toHaveBeenCalled();
    expect(drawImage).toHaveBeenCalledWith(video, 437.5, 0, 405, 720, 0, 0, 720, 1280);

    act(() => {
      vi.advanceTimersByTime(173);
    });

    expect(container.querySelector('[data-testid="camera-preview-placeholder"]')).toHaveAttribute(
      "data-preview-ready",
      "false",
    );

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(container.querySelector('[data-testid="camera-preview-placeholder"]')).toHaveAttribute(
      "data-preview-ready",
      "true",
    );
    expect(debugEvents.addDebugEvent).toHaveBeenCalledWith(
      "camera-preview-metadata",
      "capture",
      expect.objectContaining({
        rawAspectRatio: 1280 / 720,
        compositionWidth: 720,
        compositionHeight: 1280,
        compositionAspectRatio: 9 / 16,
      }),
    );
    expect(debugEvents.addDebugEvent).toHaveBeenCalledWith(
      "camera-preview-ready",
      "capture",
      expect.objectContaining({ settleMs: 190 }),
    );

    act(() => {
      vi.advanceTimersByTime(420);
    });

    expect(container.querySelector('[data-testid="camera-preview-placeholder"]')).not.toBeInTheDocument();
  });

  it("resets the placeholder when the stream changes or clears", () => {
    const firstStream = makeStream();
    act(() => {
      root.render(<CameraPreview stream={firstStream} />);
    });
    const firstVideo = container.querySelector('[data-testid="camera-preview-source"]') as HTMLVideoElement;

    setVideoSize(firstVideo);
    act(() => {
      firstVideo.dispatchEvent(new Event("loadedmetadata", { bubbles: true }));
      firstVideo.dispatchEvent(new Event("canplay", { bubbles: true }));
    });

    act(() => {
      vi.advanceTimersByTime(610);
    });

    expect(container.querySelector('[data-testid="camera-preview-placeholder"]')).not.toBeInTheDocument();

    const secondStream = makeStream();
    act(() => {
      root.render(<CameraPreview stream={secondStream} />);
    });

    expect(container.querySelector('[data-testid="camera-preview-placeholder"]')).toHaveAttribute(
      "data-preview-ready",
      "false",
    );
    expect(container.querySelector('[data-testid="camera-preview-source"]')).toHaveProperty(
      "srcObject",
      secondStream,
    );

    act(() => {
      root.render(<CameraPreview stream={null} />);
    });

    expect(container.querySelector('[data-testid="camera-preview-placeholder"]')).toHaveAttribute(
      "data-preview-ready",
      "false",
    );
    expect(container.querySelector('[aria-label="Camera preview"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="camera-preview-source"]')).not.toBeInTheDocument();
  });
});
