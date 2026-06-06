import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportProfile } from "@/features/video/export-profile";
import { maxRecordDurationMs } from "@/lib/motion";
import { useTwoSecondRecorder, type RecordingResult } from "./use-two-second-recorder";

const recorderInstances: MockMediaRecorder[] = [];
const stoppedCanvasTracks = vi.hoisted(() => ({
  stop: vi.fn(),
}));
let latestRecorder: ReturnType<typeof useTwoSecondRecorder> | null = null;
let pendingRecording: Promise<RecordingResult | null> | null = null;

class MockMediaRecorder extends EventTarget {
  static isTypeSupported() {
    return true;
  }

  readonly stream: MediaStream;
  readonly mimeType = 'video/mp4;codecs="avc1.42E01E,mp4a.40.2"';
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
    this.ondataavailable?.({ data: new Blob(["clip"], { type: "video/mp4" }) } as BlobEvent);
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
          pendingRecording = recorder.start();
          void pendingRecording?.catch(() => undefined);
        }}
      >
        Start
      </button>
      <button type="button" onClick={recorder.stop}>
        Stop
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

  function state() {
    return container.querySelector('[aria-label="state"]');
  }

  function progress() {
    return container.querySelector('[aria-label="progress"]');
  }

  async function startRecording() {
    await act(async () => {
      container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  it("returns null for holds shorter than the minimum duration", async () => {
    await act(async () => {
      root.render(<RecorderHarness />);
    });

    await startRecording();
    const recording = pendingRecording;
    await act(async () => {
      vi.advanceTimersByTime(699);
      latestRecorder?.stop();
    });

    await expect(recording).resolves.toBeNull();
    expect(state()).toHaveTextContent("idle");
    expect(progress()).toHaveTextContent("0");
    expect(stoppedCanvasTracks.stop).toHaveBeenCalledTimes(1);
  });

  it("returns a blob with the actual released duration", async () => {
    await act(async () => {
      root.render(<RecorderHarness />);
    });

    await startRecording();
    const recording = pendingRecording;
    await act(async () => {
      vi.advanceTimersByTime(925);
      latestRecorder?.stop();
    });

    const result = await recording;
    expect(result?.blob).toBeInstanceOf(Blob);
    expect(result?.durationMs).toBe(925);
    expect(state()).toHaveTextContent("success");
    expect(progress()).toHaveTextContent("100");
    expect(HTMLCanvasElement.prototype.captureStream).toHaveBeenCalledWith(exportProfile.fps);
    expect(recorderInstances[0]?.stream.getVideoTracks()).toHaveLength(1);
    expect(recorderInstances[0]?.stream.getAudioTracks()).toHaveLength(1);
    expect(stoppedCanvasTracks.stop).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(650);
    });

    expect(state()).toHaveTextContent("idle");
    expect(progress()).toHaveTextContent("0");
  });

  it("auto-stops and saves at the maximum duration", async () => {
    await act(async () => {
      root.render(<RecorderHarness />);
    });

    await startRecording();
    const recording = pendingRecording;
    await act(async () => {
      vi.advanceTimersByTime(maxRecordDurationMs);
    });

    const result = await recording;
    expect(result?.blob).toBeInstanceOf(Blob);
    expect(result?.durationMs).toBe(maxRecordDurationMs);
    expect(recorderInstances[0]?.requestData).toHaveBeenCalledTimes(1);
    expect(state()).toHaveTextContent("success");
    expect(progress()).toHaveTextContent("100");
  });

  it("cleans up the composed stream after recorder errors", async () => {
    await act(async () => {
      root.render(<RecorderHarness />);
    });

    await startRecording();

    await act(async () => {
      recorderInstances[0]?.onerror?.(new Event("error"));
    });

    expect(state()).toHaveTextContent("error");
    expect(stoppedCanvasTracks.stop).toHaveBeenCalledTimes(1);
  });
});
