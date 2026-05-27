import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { AppError } from "@/features/errors/app-error";
import { addDebugEvent } from "@/features/errors/debug-store";
import { reportError } from "@/features/errors/report-error";
import type { ClipRecord, VlogRecord } from "@/features/clips/types";
import { getVlogByGenerationFingerprint } from "@/features/clips/storage";
import { exportProfile } from "@/features/video/export-profile";
export { exportProfile } from "@/features/video/export-profile";

export type GenerationProgress = {
  step: "idle" | "loading" | "writing" | "rendering" | "saving" | "done" | "error";
  value: number;
  label: string;
  detail: string;
  technical: string;
  logs: string[];
};

const maxLogLines = 8;
const videoFilters = [
  `scale=${exportProfile.width}:${exportProfile.height}:force_original_aspect_ratio=increase`,
  `crop=${exportProfile.width}:${exportProfile.height}`,
  `fps=${exportProfile.fps}`,
  "setsar=1",
  "format=yuv420p",
];

const technicalSummary = `${videoFilters.join(" -> ")} | H.264 MP4, AAC 48kHz stereo, faststart`;

const progressCopy: Record<
  GenerationProgress["step"],
  Pick<GenerationProgress, "label" | "detail" | "technical">
> = {
  idle: {
    label: "Preparing",
    detail: "Setting up the local video renderer",
    technical: technicalSummary,
  },
  loading: {
    label: "Loading local editor",
    detail: "Starting the on-device FFmpeg engine",
    technical: `${technicalSummary} | @ffmpeg/ffmpeg wasm core`,
  },
  writing: {
    label: "Collecting clips",
    detail: "Copying today's clips into the local renderer",
    technical: `${technicalSummary} | concat demuxer input list`,
  },
  rendering: {
    label: "Normalizing clips",
    detail: "Centering video, balancing audio, and encoding MP4",
    technical: technicalSummary,
  },
  saving: {
    label: "Saving result",
    detail: "Storing the finished diary video locally",
    technical: exportProfile.output,
  },
  done: {
    label: "Done",
    detail: "Your diary video is ready",
    technical: exportProfile.output,
  },
  error: {
    label: "Generation failed",
    detail: "Your clips are still saved for another try",
    technical: "ffmpeg error",
  },
};

let ffmpegPromise: Promise<FFmpeg> | null = null;
let activeProgressSink: ((progress: GenerationProgress) => void) | null = null;
let recentFfmpegLogs: string[] = [];
let activeRenderValue = 24;

export function buildVideoFilter() {
  return videoFilters.join(",");
}

export function buildFfmpegArgs() {
  return [
    "-fflags",
    "+genpts",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    "inputs.txt",
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    "-vf",
    buildVideoFilter(),
    "-c:v",
    exportProfile.videoCodec,
    "-preset",
    "veryfast",
    "-r",
    String(exportProfile.fps),
    "-pix_fmt",
    exportProfile.pixelFormat,
    "-c:a",
    exportProfile.audioCodec,
    "-ar",
    String(exportProfile.audioSampleRate),
    "-ac",
    String(exportProfile.audioChannels),
    "-af",
    exportProfile.audioFilter,
    "-movflags",
    "+faststart",
    "-avoid_negative_ts",
    "make_zero",
    "-shortest",
    exportProfile.output,
  ];
}

function stableJson(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return JSON.stringify(value);
  }

  return JSON.stringify(
    Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((sorted, key) => {
        sorted[key] = (value as Record<string, unknown>)[key];
        return sorted;
      }, {}),
  );
}

export function buildGenerationFingerprint(
  clips: ClipRecord[],
  profile: Record<string, unknown> = exportProfile,
) {
  return stableJson({
    clips: clips.map((clip) => ({
      id: clip.id,
      size: clip.size,
      createdAt: clip.createdAt,
      mimeType: clip.mimeType,
    })),
    exportProfile: profile,
  });
}

export function recentGenerationLogs(logs: string[], nextLog: string) {
  return [...logs, nextLog].slice(-maxLogLines);
}

export function generationProgress(
  step: GenerationProgress["step"],
  value: number,
  overrides: Partial<Pick<GenerationProgress, "label" | "detail" | "technical" | "logs">> = {},
): GenerationProgress {
  return {
    step,
    value,
    logs: [],
    ...progressCopy[step],
    ...overrides,
  };
}

export function resetGenerationForTests() {
  ffmpegPromise = null;
  activeProgressSink = null;
  recentFfmpegLogs = [];
  activeRenderValue = 24;
}

function renderingLabelFor(value: number) {
  if (value >= 78) return "Encoding MP4";
  if (value >= 52) return "Balancing audio";
  return "Normalizing clips";
}

function emitProgress(progress: GenerationProgress) {
  activeProgressSink?.({
    ...progress,
    logs: progress.logs.length > 0 ? progress.logs : recentFfmpegLogs,
  });
}

async function loadFfmpeg() {
  if (ffmpegPromise) return ffmpegPromise;

  ffmpegPromise = (async () => {
    const MockFFmpeg =
      typeof window !== "undefined"
        ? (window as typeof window & { __idleDiaryMockFFmpeg?: typeof FFmpeg })
            .__idleDiaryMockFFmpeg
        : undefined;
    const ffmpeg = MockFFmpeg ? new MockFFmpeg() : new FFmpeg();
    ffmpeg.on("log", ({ message }) => {
      recentFfmpegLogs = recentGenerationLogs(recentFfmpegLogs, message);
      addDebugEvent("ffmpeg-log", "generation", { message });
      emitProgress(
        generationProgress("rendering", activeRenderValue, {
          label: renderingLabelFor(activeRenderValue),
          logs: recentFfmpegLogs,
        }),
      );
    });
    ffmpeg.on("progress", ({ progress }) => {
      activeRenderValue = Math.max(24, Math.round(progress * 88));
      emitProgress(
        generationProgress("rendering", activeRenderValue, {
          label: renderingLabelFor(activeRenderValue),
        }),
      );
    });

    emitProgress(generationProgress("loading", 8));
    if (MockFFmpeg) {
      await ffmpeg.load();
      addDebugEvent("ffmpeg-loaded", "generation", { mocked: true });
      return ffmpeg;
    }

    const baseURL =
      typeof window === "undefined"
        ? "/ffmpeg"
        : new URL("/ffmpeg", window.location.href).href;
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });
    addDebugEvent("ffmpeg-loaded", "generation");
    return ffmpeg;
  })();

  return ffmpegPromise;
}

function extensionFor(mimeType: string) {
  if (mimeType.includes("mp4")) return "mp4";
  return "webm";
}

export async function generateVlog(
  clips: ClipRecord[],
  sessionId: string,
  onProgress: (progress: GenerationProgress) => void,
): Promise<VlogRecord> {
  if (clips.length === 0) {
    throw reportError(
      new AppError({
        code: "generation-failed",
        area: "generation",
        message: "Generation requested with no clips",
        userMessage: "Record at least one clip before finishing.",
        context: { sessionId, clipCount: 0 },
      }),
    );
  }

  try {
    activeProgressSink = onProgress;
    recentFfmpegLogs = [];
    activeRenderValue = 24;
    if (typeof window !== "undefined") {
      (window as typeof window & { __idleDiaryGenerationClipIds?: string[] })
        .__idleDiaryGenerationClipIds = clips.map((clip) => clip.id);
    }
    const generationFingerprint = buildGenerationFingerprint(clips, exportProfile);
    const cachedVlog = await getVlogByGenerationFingerprint(generationFingerprint, sessionId);
    if (cachedVlog) {
      emitProgress(generationProgress("done", 100));
      addDebugEvent("vlog-generation-reused", "generation", {
        vlogId: cachedVlog.id,
        size: cachedVlog.size,
        clipCount: clips.length,
      });
      return cachedVlog;
    }

    const ffmpeg = await loadFfmpeg();
    emitProgress(generationProgress("writing", 14));

    const listLines: string[] = [];
    for (const [index, clip] of clips.entries()) {
      const input = `clip-${index}.${extensionFor(clip.mimeType)}`;
      await ffmpeg.writeFile(input, await fetchFile(clip.blob));
      listLines.push(`file '${input}'`);
    }
    await ffmpeg.writeFile("inputs.txt", listLines.join("\n"));
    addDebugEvent("ffmpeg-inputs-written", "generation", {
      clipCount: clips.length,
      bytes: clips.reduce((total, clip) => total + clip.size, 0),
    });

    emitProgress(generationProgress("rendering", 24));
    await ffmpeg.exec(buildFfmpegArgs());

    emitProgress(generationProgress("saving", 92));
    const data = await ffmpeg.readFile(exportProfile.output);
    const bytes =
      typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
    const output = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const blob = new Blob([output], { type: "video/mp4" });
    const firstThumbnailClip = clips.find((clip) => clip.thumbnailBlob);
    const vlog: VlogRecord = {
      id: crypto.randomUUID(),
      sessionId,
      blob,
      mimeType: "video/mp4",
      ...(firstThumbnailClip
        ? {
            thumbnailBlob: firstThumbnailClip.thumbnailBlob,
            thumbnailMimeType: firstThumbnailClip.thumbnailMimeType,
            thumbnailWidth: firstThumbnailClip.thumbnailWidth,
            thumbnailHeight: firstThumbnailClip.thumbnailHeight,
          }
        : {}),
      clipCount: clips.length,
      title: suggestTitle(clips.length),
      caption: suggestCaption(clips.length),
      createdAt: new Date().toISOString(),
      size: blob.size,
      generationFingerprint,
    };
    emitProgress(generationProgress("done", 100));
    addDebugEvent("vlog-generated", "generation", {
      vlogId: vlog.id,
      size: blob.size,
      clipCount: clips.length,
    });
    return vlog;
  } catch (cause) {
    throw reportError(
      new AppError({
        code: "generation-failed",
        area: "generation",
        message: "ffmpeg generation failed",
        userMessage: "Generation failed, but your clips are still saved. Retry when the phone is less busy.",
        cause,
        context: {
          sessionId,
          clipCount: clips.length,
          totalBytes: clips.reduce((total, clip) => total + clip.size, 0),
        },
      }),
    );
  }
}

export function suggestTitle(clipCount: number) {
  if (clipCount === 1) return "Two Seconds Today";
  return `${clipCount} Tiny Moments`;
}

export function suggestCaption(clipCount: number) {
  return `A quiet ${clipCount * 2}-second diary from today.`;
}
