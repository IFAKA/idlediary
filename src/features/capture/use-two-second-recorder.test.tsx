import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportProfile } from "@/features/video/export-profile";
import { useTwoSecondRecorder } from "./use-two-second-recorder";

const recorderInstances: MockMediaRecorder[] = [];
const stoppedCanvasTracks = vi.hoisted(() => ({
  stop: vi.fn(),
}));
let latestRecorder: ReturnType<typeof useTwoSecondRecorder> | null = null;
let pendingRecording: Promise<Blob | null> | null = null;

class MockMediaRecorder extends EventTarget {
  static isTypeSupported() {
    return true;
  }

  readonly stream: MediaStream;
  readonly mimeType = "video/webm";
  state: RecordingState = "inactive";
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onstop: (() => void) | null = null;
  requestData = vi.fn();

  constructor(stream: MediaStream) {
    super();
    this.stream = stream;
    recorderInstances.push(this);
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["clip"], { type: "video/webm" }) } as BlobEvent);
    this.onstop?.();
  }
}

function makeTrack(kind: "audio" | "video") {
  return {
    kind,
    stop: vi.fn(),
  } as unknown as MediaStreamTrack;
}

function RecorderHarness() {
  const audioTrack = makeTrack("audio");
  const recorder = useTwoSecondRecorder({
    getAudioTracks: () => [audioTrack],
    getVideoTracks: () => [makeTrack("video")],
  } as unknown as MediaStream);

  useEffect(() => {
    latestRecorder = recorder;
  }, [recorder]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          pendingRecording = recorder.record();
          void pendingRecording.catch(() => undefined);
        }}
      >
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
    recorderInstances.length = 0;
    stoppedCanvasTracks.stop.mockClear();
    latestRecorder = null;
    pendingRecording = null;
    vi.stubGlobal("MediaRecorder", MockMediaRecorder);
    vi.stubGlobal(
      "MediaStream",
      class {
        private readonly tracks: MediaStreamTrack[];

        constructor(tracks: MediaStreamTrack[] = []) {
          this.tracks = tracks;
        }

        getAudioTracks() {
          return this.tracks.filter((track) => track.kind === "audio");
        }

        getTracks() {
          return this.tracks;
        }

        getVideoTracks() {
          return this.tracks.filter((track) => track.kind === "video");
        }
      },
    );
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 16),
    );
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => window.clearTimeout(handle));
    Object.defineProperties(HTMLMediaElement.prototype, {
      load: { configurable: true, value: vi.fn() },
      pause: { configurable: true, value: vi.fn() },
      play: { configurable: true, value: vi.fn(() => Promise.resolve()) },
      srcObject: { configurable: true, value: null, writable: true },
      videoHeight: { configurable: true, value: 720 },
      videoWidth: { configurable: true, value: 1280 },
    });
    Object.defineProperty(HTMLCanvasElement.prototype, "captureStream", {
      configurable: true,
      value: vi.fn(() => {
        const videoTrack = {
          kind: "video",
          stop: stoppedCanvasTracks.stop,
        } as unknown as MediaStreamTrack;
        return {
          getAudioTracks: () => [],
          getTracks: () => [videoTrack],
          getVideoTracks: () => [videoTrack],
        } as unknown as MediaStream;
      }),
    });
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: vi.fn(() => ({ drawImage: vi.fn() })),
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
    expect(HTMLCanvasElement.prototype.captureStream).toHaveBeenCalledWith(exportProfile.fps);
    expect(recorderInstances[0]?.stream.getVideoTracks()).toHaveLength(1);
    expect(recorderInstances[0]?.stream.getAudioTracks()).toHaveLength(1);
    expect(stoppedCanvasTracks.stop).toHaveBeenCalledTimes(1);
  });

  it("cancels an active recording and resolves with no blob", async () => {
    await act(async () => {
      root.render(<RecorderHarness />);
    });

    await act(async () => {
      container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const recording = pendingRecording;
    if (!recording) {
      throw new Error("Expected recording promise");
    }

    await act(async () => {
      latestRecorder?.cancel();
    });

    await expect(recording).resolves.toBeNull();
    expect(container.querySelector('[aria-label="state"]')).toHaveTextContent("idle");
    expect(container.querySelector('[aria-label="progress"]')).toHaveTextContent("0");
    expect(stoppedCanvasTracks.stop).toHaveBeenCalledTimes(1);
  });

  it("cleans up the composed stream after recorder errors", async () => {
    await act(async () => {
      root.render(<RecorderHarness />);
    });

    await act(async () => {
      container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await act(async () => {
      recorderInstances[0]?.onerror?.(new Event("error"));
    });

    expect(container.querySelector('[aria-label="state"]')).toHaveTextContent("error");
    expect(stoppedCanvasTracks.stop).toHaveBeenCalledTimes(1);
  });
});
