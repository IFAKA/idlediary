import { afterEach, describe, expect, it, vi } from "vitest";
import { createRecorder, supportedRecordingMimeType } from "./media-recorder";

class MockMediaRecorder {
  static supportedTypes = new Set<string>();
  static instances: MockMediaRecorder[] = [];

  readonly stream: MediaStream;
  readonly options?: MediaRecorderOptions;

  constructor(stream: MediaStream, options?: MediaRecorderOptions) {
    this.stream = stream;
    this.options = options;
    MockMediaRecorder.instances.push(this);
  }

  static isTypeSupported(type: string) {
    return MockMediaRecorder.supportedTypes.has(type);
  }
}

class MockMediaStream {
  constructor(private readonly tracks: MediaStreamTrack[] = []) {}

  getVideoTracks() {
    return this.tracks.filter((track) => track.kind === "video");
  }

  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === "audio");
  }
}

describe("supportedRecordingMimeType", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    MockMediaRecorder.supportedTypes.clear();
    MockMediaRecorder.instances = [];
  });

  it("prefers MP4 with explicit H.264 video and AAC audio", () => {
    MockMediaRecorder.supportedTypes = new Set([
      "video/mp4",
      'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
      "video/webm;codecs=vp9,opus",
    ]);
    vi.stubGlobal("MediaRecorder", MockMediaRecorder);

    expect(supportedRecordingMimeType()).toBe(
      'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
    );
  });

  it("does not choose bare MP4 because browsers may pair it with unsupported audio", () => {
    MockMediaRecorder.supportedTypes = new Set(["video/mp4"]);
    vi.stubGlobal("MediaRecorder", MockMediaRecorder);

    expect(supportedRecordingMimeType()).toBe("");
  });

  it("falls back to WebM when compatible MP4 is unavailable", () => {
    MockMediaRecorder.supportedTypes = new Set([
      "video/webm;codecs=vp9,opus",
      "video/webm",
    ]);
    vi.stubGlobal("MediaRecorder", MockMediaRecorder);

    expect(supportedRecordingMimeType()).toBe("video/webm;codecs=vp9,opus");
  });
});

describe("createRecorder", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    MockMediaRecorder.supportedTypes.clear();
    MockMediaRecorder.instances = [];
  });

  it("records video-only MP4 when bare MP4 is the only MP4 option", () => {
    const videoTrack = { kind: "video" } as MediaStreamTrack;
    const audioTrack = { kind: "audio" } as MediaStreamTrack;
    const stream = new MockMediaStream([videoTrack, audioTrack]) as unknown as MediaStream;
    MockMediaRecorder.supportedTypes = new Set(["video/mp4"]);
    vi.stubGlobal("MediaRecorder", MockMediaRecorder);
    vi.stubGlobal("MediaStream", MockMediaStream);

    const recorder = createRecorder(stream);

    expect(recorder).toBe(MockMediaRecorder.instances[0]);
    expect(MockMediaRecorder.instances[0]?.options).toEqual({ mimeType: "video/mp4" });
    expect(MockMediaRecorder.instances[0]?.stream.getVideoTracks()).toEqual([videoTrack]);
    expect(MockMediaRecorder.instances[0]?.stream.getAudioTracks()).toEqual([]);
  });

  it("keeps audio when an explicit playable audio codec is supported", () => {
    const videoTrack = { kind: "video" } as MediaStreamTrack;
    const audioTrack = { kind: "audio" } as MediaStreamTrack;
    const stream = new MockMediaStream([videoTrack, audioTrack]) as unknown as MediaStream;
    MockMediaRecorder.supportedTypes = new Set([
      'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
      "video/mp4",
    ]);
    vi.stubGlobal("MediaRecorder", MockMediaRecorder);
    vi.stubGlobal("MediaStream", MockMediaStream);

    createRecorder(stream);

    expect(MockMediaRecorder.instances[0]?.options).toEqual({
      mimeType: 'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
    });
    expect(MockMediaRecorder.instances[0]?.stream.getAudioTracks()).toEqual([audioTrack]);
  });
});
