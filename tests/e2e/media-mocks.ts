import type { Page } from "@playwright/test";

export async function mockMediaCapture(
  page: Page,
  { generationDelayMs = 250 }: { generationDelayMs?: number } = {},
) {
  await page.addInitScript(({ generationDelayMs }) => {
    const blob = new Blob(["mock-video"], { type: "video/webm" });
    const generatedBlob = new Blob(["mock-generated-video"], { type: "video/mp4" });

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
        this.emit("log", { message: "loudnorm AAC 48kHz stereo" });
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
          const testWindow = window as typeof window & { __idleDiaryStartedStreams?: number };
          testWindow.__idleDiaryStartedStreams = (testWindow.__idleDiaryStartedStreams ?? 0) + 1;
          const stream = new MediaStream();
          Object.defineProperty(stream, "getTracks", {
            configurable: true,
            value: () => [
              {
                stop: () => {
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
      },
    });
  }, { generationDelayMs });
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
