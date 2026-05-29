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

  beforeEach(() => {
    vi.useFakeTimers();
    debugEvents.addDebugEvent.mockClear();
    Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
      configurable: true,
      value: null,
      writable: true,
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
    const video = container.querySelector('[aria-label="Camera preview"]') as HTMLVideoElement;
    const frame = container.querySelector('[data-testid="camera-preview-frame"]') as HTMLElement;
    expect(placeholder).not.toBeNull();
    expect(video).not.toBeNull();
    expect(placeholder).toHaveAttribute("data-preview-ready", "false");
    expect(video).toHaveProperty("srcObject", stream);
    expect(frame.style.aspectRatio).toBe("0.5625");
    expect(video).toHaveClass("object-cover");
    expect(container.querySelector('[data-testid="recording-crop-guide"]')).not.toBeInTheDocument();

    setVideoSize(video);
    act(() => {
      video.dispatchEvent(new Event("loadedmetadata", { bubbles: true }));
      video.dispatchEvent(new Event("loadeddata", { bubbles: true }));
    });

    expect(frame.style.aspectRatio).toBe("0.5625");

    act(() => {
      vi.advanceTimersByTime(189);
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
        exportAspectRatio: 9 / 16,
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

  it("renders the camera stream inside the final recording crop", () => {
    const stream = makeStream();
    act(() => {
      root.render(<CameraPreview stream={stream} />);
    });

    const video = container.querySelector('[aria-label="Camera preview"]') as HTMLVideoElement;
    const frame = container.querySelector('[data-testid="camera-preview-frame"]') as HTMLElement;
    setVideoSize(video, 720, 960);

    act(() => {
      video.dispatchEvent(new Event("loadedmetadata", { bubbles: true }));
      video.dispatchEvent(new Event("loadeddata", { bubbles: true }));
    });

    expect(frame.style.aspectRatio).toBe("0.5625");
    expect(video).toHaveClass("object-cover");
  });

  it("resets the placeholder when the stream changes or clears", () => {
    const firstStream = makeStream();
    act(() => {
      root.render(<CameraPreview stream={firstStream} />);
    });
    const firstVideo = container.querySelector('[aria-label="Camera preview"]') as HTMLVideoElement;

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
    expect(container.querySelector('[aria-label="Camera preview"]')).toHaveProperty(
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
  });
});
