import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTwoSecondRecorder } from "./use-two-second-recorder";

class MockMediaRecorder extends EventTarget {
  static isTypeSupported() {
    return true;
  }

  readonly mimeType = "video/webm";
  state: RecordingState = "inactive";
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onstop: (() => void) | null = null;
  requestData = vi.fn();

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["clip"], { type: "video/webm" }) } as BlobEvent);
    this.onstop?.();
  }
}

function RecorderHarness() {
  const recorder = useTwoSecondRecorder({
    getVideoTracks: () => [],
  } as unknown as MediaStream);

  return (
    <>
      <button type="button" onClick={() => void recorder.record()}>
        Record
      </button>
      <output aria-label="state">{recorder.state}</output>
      <output aria-label="progress">{Math.round(recorder.progress)}</output>
    </>
  );
}

describe("useTwoSecondRecorder", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("MediaRecorder", MockMediaRecorder);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 16),
    );
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => window.clearTimeout(handle));
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

  it("resets progress after a successful recording returns to idle", async () => {
    await act(async () => {
      root.render(<RecorderHarness />);
    });

    const state = () => container.querySelector('[aria-label="state"]');
    const progress = () => container.querySelector('[aria-label="progress"]');

    await act(async () => {
      container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(state()).toHaveTextContent("recording");
    expect(progress()).toHaveTextContent("100");

    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    expect(state()).toHaveTextContent("success");
    expect(progress()).toHaveTextContent("100");

    await act(async () => {
      vi.advanceTimersByTime(650);
    });

    expect(state()).toHaveTextContent("idle");
    expect(progress()).toHaveTextContent("0");
  });
});
