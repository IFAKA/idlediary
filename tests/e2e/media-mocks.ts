import type { Page } from "@playwright/test";

export async function mockMediaCapture(
  page: Page,
  {
    failingDeviceIds = [],
    failingFacingModes = [],
    generationDelayMs = 250,
    requireStoppedBeforeSwitch = false,
    videoInputs = [
      { deviceId: "back-camera", groupId: "back", kind: "videoinput", label: "Back Camera" },
      { deviceId: "front-camera", groupId: "front", kind: "videoinput", label: "Front Camera" },
    ],
  }: {
    failingDeviceIds?: string[];
    failingFacingModes?: string[];
    generationDelayMs?: number;
    requireStoppedBeforeSwitch?: boolean;
    videoInputs?: Array<{
      deviceId: string;
      groupId: string;
      kind: "videoinput";
      label: string;
    }>;
  } = {},
) {
  await page.addInitScript(({ failingDeviceIds, failingFacingModes, generationDelayMs, requireStoppedBeforeSwitch, videoInputs }) => {
    const blob = new Blob(["mock-video"], { type: "video/webm" });
    const generatedBlob = new Blob(["mock-generated-video"], { type: "video/mp4" });
    const thumbnailBlob = new Blob(["mock-thumbnail"], { type: "image/webp" });
    let activeVideoStreams = 0;

    class MockMediaRecorder extends EventTarget {
      static isTypeSupported() {
        return true;
      }

      readonly mimeType = "video/webm";
      state: RecordingState = "inactive";
      ondataavailable: ((event: BlobEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onstop: (() => void) | null = null;

      start() {
        this.state = "recording";
      }

      requestData() {}

      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: blob } as BlobEvent);
        this.onstop?.();
      }
    }

    Object.defineProperty(window, "MediaRecorder", {
      configurable: true,
      value: MockMediaRecorder,
    });

    class MockFFmpeg {
      private readonly handlers = new Map<string, Array<(event: unknown) => void>>();

      on(event: string, handler: (event: unknown) => void) {
        this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
      }

      async load() {}
      async writeFile(path: string) {
        const testWindow = window as typeof window & { __idleDiaryGeneratedInputs?: string[] };
        if (path.startsWith("clip-")) {
          testWindow.__idleDiaryGeneratedInputs = [
            ...(testWindow.__idleDiaryGeneratedInputs ?? []),
            path,
          ];
        }
      }
      async exec(args: string[]) {
        const testWindow = window as typeof window & { __idleDiaryFfmpegExecArgs?: string[] };
        testWindow.__idleDiaryFfmpegExecArgs = args;
        this.emit("log", { message: "scale -> crop -> fps -> setsar -> format" });
        this.emit("progress", { progress: 0.64 });
        this.emit("log", { message: "AAC 48kHz stereo" });
        this.emit("progress", { progress: 0.96 });
        await new Promise((resolve) => window.setTimeout(resolve, generationDelayMs));
      }
      async readFile() {
        return new Uint8Array(await generatedBlob.arrayBuffer());
      }

      private emit(event: string, payload: unknown) {
        for (const handler of this.handlers.get(event) ?? []) {
          handler(payload);
        }
      }
    }

    Object.defineProperty(window, "__idleDiaryMockFFmpeg", {
      configurable: true,
      value: MockFFmpeg,
    });

    Object.defineProperty(window, "__idleDiaryMockVideoThumbnail", {
      configurable: true,
      value: async (_videoBlob: Blob, options: { width: number; height: number }) => ({
        thumbnailBlob,
        thumbnailMimeType: "image/webp",
        thumbnailWidth: options.width,
        thumbnailHeight: options.height,
      }),
    });

    Object.defineProperty(Navigator.prototype, "permissions", {
      configurable: true,
      value: {
        query: async () => ({ state: "prompt" }),
      },
    });

    Object.defineProperty(Navigator.prototype, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async (constraints?: MediaStreamConstraints) => {
          const testWindow = window as typeof window & {
            __idleDiaryCameraConstraints?: MediaStreamConstraints[];
            __idleDiaryStoppedTracksAtRequest?: number[];
            __idleDiaryStoppedTracks?: number;
            __idleDiaryStartedStreams?: number;
          };
          testWindow.__idleDiaryCameraConstraints = [
            ...(testWindow.__idleDiaryCameraConstraints ?? []),
            constraints ?? {},
          ];
          testWindow.__idleDiaryStoppedTracksAtRequest = [
            ...(testWindow.__idleDiaryStoppedTracksAtRequest ?? []),
            testWindow.__idleDiaryStoppedTracks ?? 0,
          ];
          if (constraints?.video && typeof constraints.video !== "boolean") {
            const deviceId = constraints.video.deviceId;
            const facingMode = constraints.video.facingMode;
            const exactDeviceId =
              deviceId && typeof deviceId === "object" && "exact" in deviceId
                ? deviceId.exact
                : null;
            const requestedFacingMode =
              typeof facingMode === "string"
                ? facingMode
                : facingMode && typeof facingMode === "object" && "ideal" in facingMode
                  ? facingMode.ideal
                  : null;
            const targetFrontCamera =
              exactDeviceId === "front-camera" || requestedFacingMode === "user";
            if (requireStoppedBeforeSwitch && targetFrontCamera && activeVideoStreams > 0) {
              throw new DOMException("busy", "NotReadableError");
            }
            if (typeof exactDeviceId === "string" && failingDeviceIds.includes(exactDeviceId)) {
              throw new DOMException("unavailable", "NotReadableError");
            }
            if (
              typeof requestedFacingMode === "string" &&
              failingFacingModes.includes(requestedFacingMode)
            ) {
              throw new DOMException("unavailable", "NotReadableError");
            }
          }

          testWindow.__idleDiaryStartedStreams = (testWindow.__idleDiaryStartedStreams ?? 0) + 1;
          activeVideoStreams += 1;
          let streamStopped = false;
          const stream = new MediaStream();
          Object.defineProperty(stream, "getTracks", {
            configurable: true,
            value: () => [
              {
                stop: () => {
                  if (streamStopped) return;
                  streamStopped = true;
                  activeVideoStreams = Math.max(0, activeVideoStreams - 1);
                  const testWindow = window as typeof window & {
                    __idleDiaryStoppedTracks?: number;
                  };
                  testWindow.__idleDiaryStoppedTracks =
                    (testWindow.__idleDiaryStoppedTracks ?? 0) + 1;
                },
              },
            ],
          });
          return stream;
        },
        enumerateDevices: async () => videoInputs,
      },
    });
  }, {
    failingDeviceIds,
    failingFacingModes,
    generationDelayMs,
    requireStoppedBeforeSwitch,
    videoInputs,
  });
}

export async function mockDeniedCamera(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "permissions", {
      configurable: true,
      value: {
        query: async () => ({ state: "prompt" }),
      },
    });

    Object.defineProperty(Navigator.prototype, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          throw new DOMException("denied", "NotAllowedError");
        },
      },
    });
  });
}
