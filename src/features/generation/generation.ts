import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { AppError } from "@/features/errors/app-error";
import { addDebugEvent } from "@/features/errors/debug-store";
import { reportError } from "@/features/errors/report-error";
import type { ClipRecord, VlogRecord } from "@/features/clips/types";
import {
  generateVideoThumbnail,
  thumbnailSizes,
  type ThumbnailResult,
} from "@/features/clips/thumbnail";
import { getVlogByGenerationFingerprint } from "@/features/clips/storage";
import { recorderSettleMs, twoSecondRecordMs } from "@/lib/motion";
import { exportProfile } from "@/features/video/export-profile";
import { getQueuedClipMoodDescriptions } from "@/features/music/clip-analysis-queue";
import { buildMusicPlan, musicProfileVersion } from "@/features/music/plan";
import {
  generateTinyMusicianWav,
  musicDurationSecondsForVideo,
  warmTinyMusician,
  verifyTinyMusicianReadiness,
} from "@/features/music/tinymusician";
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
const musicVolume = 0.45;
const technicalSummary = `MP4 concat demuxer | generated music mix | ${exportProfile.width}x${exportProfile.height} ${exportProfile.fps}fps H.264/AAC`;

const progressCopy: Record<
  GenerationProgress["step"],
  Pick<GenerationProgress, "label" | "detail" | "technical">
> = {
  idle: {
    label: "Preparing",
    detail: "Getting your diary space ready",
    technical: technicalSummary,
  },
  loading: {
    label: "Opening your diary",
    detail: "Warming up your private editor",
    technical: `${technicalSummary} | @ffmpeg/ffmpeg wasm core`,
  },
  writing: {
    label: "Gathering moments",
    detail: "Reading your clips and composing a quiet soundtrack",
    technical: `${technicalSummary} | local keyframes, local music synthesis`,
  },
  rendering: {
    label: "Assembling MP4",
    detail: "Joining compatible clips privately",
    technical: technicalSummary,
  },
  saving: {
    label: "Saving privately",
    detail: "Keeping the finished diary on your device",
    technical: exportProfile.output,
  },
  done: {
    label: "Ready",
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

export function buildFfmpegArgs(durationMs = twoSecondRecordMs + recorderSettleMs) {
  const durationSeconds = Math.max(0.1, durationMs / 1000);
  const fadeOutStart = Math.max(0, durationSeconds - 2.4).toFixed(3);
  const filterComplex = [
    "[0:a:0]aformat=sample_rates=48000:channel_layouts=stereo,dynaudnorm=f=150:g=9,volume=1.0[clipaudio]",
    `[1:a:0]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:${durationSeconds.toFixed(3)},afade=t=in:st=0:d=1.2,afade=t=out:st=${fadeOutStart}:d=2.4,volume=${musicVolume}[music]`,
    "[clipaudio][music]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95[aout]",
  ].join(";");

  return [
    "-fflags",
    "+genpts",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    "inputs.txt",
    "-stream_loop",
    "-1",
    "-i",
    "music.wav",
    "-filter_complex",
    filterComplex,
    "-map",
    "0:v:0",
    "-map",
    "[aout]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-ar",
    "48000",
    "-ac",
    "2",
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
  music: { seed: string; profileVersion: number } = {
    seed: "default",
    profileVersion: musicProfileVersion,
  },
) {
  return stableJson({
    clips: clips.map((clip) => ({
      id: clip.id,
      size: clip.size,
      createdAt: clip.createdAt,
      mimeType: clip.mimeType,
    })),
    exportProfile: profile,
    music,
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

async function createGeneratedMusicWav(clips: ClipRecord[], durationMs: number, seed: string) {
  const MockGeneratedMusic =
    typeof window !== "undefined"
      ? (
          window as typeof window & {
            __idleDiaryMockGeneratedMusic?: (input: {
              clips: ClipRecord[];
              durationMs: number;
              seed: string;
            }) => Uint8Array | Promise<Uint8Array>;
          }
        ).__idleDiaryMockGeneratedMusic
      : undefined;
  if (MockGeneratedMusic) {
    return {
      musicWav: await MockGeneratedMusic({ clips, durationMs, seed }),
      debug: { mocked: true },
    };
  }

  const descriptions = await getQueuedClipMoodDescriptions(clips);
  const musicDurationSeconds = musicDurationSecondsForVideo(durationMs);
  const musicPlan = buildMusicPlan(descriptions, musicDurationSeconds * 1000, seed);
  const generatedMusic = await generateTinyMusicianWav({
    plan: musicPlan,
    descriptions,
    durationSeconds: musicDurationSeconds,
  });
  return {
    musicWav: generatedMusic.musicWav,
    debug: {
      mocked: false,
      musicEngine: "tinymusician",
      musicSeed: seed,
      musicPrompt: generatedMusic.musicPrompt,
      musicProfileVersion,
      musicDurationSeconds: generatedMusic.musicDurationSeconds,
      musicMood: musicPlan.mood,
    },
  };
}

function renderingLabelFor(value: number) {
  if (value >= 78) return "Finishing audio mix";
  return "Assembling MP4";
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

export async function warmGenerationPipeline(): Promise<void> {
  const results = await Promise.allSettled([loadFfmpeg(), warmTinyMusician()]);
  const rejected = results.filter((result) => result.status === "rejected");
  addDebugEvent("generation-warmup", "generation", {
    ffmpeg: results[0]?.status ?? "unknown",
    tinyMusician: results[1]?.status ?? "unknown",
    errors: rejected.map((result) =>
      result.status === "rejected" && result.reason instanceof Error
        ? result.reason.message
        : "warmup failed",
    ),
  });
}

function ffmpegFileToUint8Array(data: Awaited<ReturnType<FFmpeg["readFile"]>>) {
  return typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
}

function clipThumbnailFields(clip: ClipRecord): ThumbnailResult | null {
  if (
    !clip.thumbnailBlob ||
    !clip.thumbnailMimeType ||
    typeof clip.thumbnailWidth !== "number" ||
    typeof clip.thumbnailHeight !== "number"
  ) {
    return null;
  }

  return {
    thumbnailBlob: clip.thumbnailBlob,
    thumbnailMimeType: clip.thumbnailMimeType,
    thumbnailWidth: clip.thumbnailWidth,
    thumbnailHeight: clip.thumbnailHeight,
  };
}

async function selectVlogThumbnail(
  clips: ClipRecord[],
  size: (typeof thumbnailSizes)["vlog"],
): Promise<ThumbnailResult> {
  const existingThumbnail = clips.map(clipThumbnailFields).find((thumbnail) => thumbnail !== null);
  if (existingThumbnail) return existingThumbnail;

  return generateVideoThumbnail(clips[0].blob, size);
}

export function isFastConcatCompatibleClip(clip: Pick<ClipRecord, "mimeType" | "blob">) {
  const mimeType = clip.mimeType || clip.blob.type;
  return /^video\/mp4(?:\s*;|$)/i.test(mimeType);
}

function validateFastConcatCompatibleClips(clips: ClipRecord[], sessionId: string) {
  const incompatibleClips = clips.filter((clip) => !isFastConcatCompatibleClip(clip));
  if (incompatibleClips.length === 0) return;

  throw reportError(
    new AppError({
      code: "generation-unavailable",
      area: "generation",
      message: "Generation requires MP4/H.264/AAC clips for stream-copy concat",
      userMessage: "This draft was recorded in an unsupported video format. Record new clips on a compatible device.",
      context: {
        sessionId,
        incompatibleClipIds: incompatibleClips.map((clip) => clip.id),
        mimeTypes: incompatibleClips.map((clip) => clip.mimeType || clip.blob.type || "unknown"),
      },
    }),
  );
}

export async function generateVlog(
  clips: ClipRecord[],
  sessionId: string,
  onProgress: (progress: GenerationProgress) => void,
  options: { generatedMusic?: true; musicSeed?: string } = { generatedMusic: true },
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
  validateFastConcatCompatibleClips(clips, sessionId);

  try {
    activeProgressSink = onProgress;
    recentFfmpegLogs = [];
    activeRenderValue = 24;
    const startedAt = performance.now();
    const timing: Record<string, number> = {};
    const markTiming = (name: string, since: number) => {
      timing[name] = Math.round(performance.now() - since);
    };
    const musicSeed = options.musicSeed ?? crypto.randomUUID();
    if (typeof window !== "undefined") {
      (window as typeof window & { __idleDiaryGenerationClipIds?: string[] })
        .__idleDiaryGenerationClipIds = clips.map((clip) => clip.id);
    }
    const generationFingerprint = buildGenerationFingerprint(clips, exportProfile, {
      seed: musicSeed,
      profileVersion: musicProfileVersion,
    });
    const cachedVlog = await getVlogByGenerationFingerprint(generationFingerprint, sessionId);
    if (cachedVlog?.thumbnailBlob) {
      emitProgress(generationProgress("done", 100));
      addDebugEvent("vlog-generation-reused", "generation", {
        vlogId: cachedVlog.id,
        size: cachedVlog.size,
        clipCount: clips.length,
      });
      return cachedVlog;
    }

    const ffmpegLoadStartedAt = performance.now();
    const ffmpeg = await loadFfmpeg();
    markTiming("ffmpegLoadMs", ffmpegLoadStartedAt);
    emitProgress(
      generationProgress("writing", 14, {
        label: "Getting music ready",
        detail: "Checking this browser can make the soundtrack",
      }),
    );
    const readinessStartedAt = performance.now();
    await verifyTinyMusicianReadiness();
    markTiming("tinyMusicianReadinessMs", readinessStartedAt);

    emitProgress(
      generationProgress("writing", 18, {
        label: "Preparing soundtrack",
        detail: "First time here can take a little longer",
      }),
    );

    const totalDurationMs = clips.reduce((total, clip) => total + clip.durationMs, 0);
    const musicStartedAt = performance.now();
    const { musicWav, debug: musicDebug } = await createGeneratedMusicWav(
      clips,
      totalDurationMs,
      musicSeed,
    );
    markTiming("musicGenerationMs", musicStartedAt);
    const writeStartedAt = performance.now();
    await ffmpeg.writeFile("music.wav", musicWav);

    const listLines: string[] = [];
    for (const [index, clip] of clips.entries()) {
      const input = `clip-${index}.mp4`;
      await ffmpeg.writeFile(input, await fetchFile(clip.blob));
      listLines.push(`file '${input}'`);
    }
    await ffmpeg.writeFile("inputs.txt", listLines.join("\n"));
    markTiming("ffmpegWriteFilesMs", writeStartedAt);
    addDebugEvent("ffmpeg-inputs-written", "generation", {
      clipCount: clips.length,
      bytes: clips.reduce((total, clip) => total + clip.size, 0),
      ...musicDebug,
    });

    emitProgress(generationProgress("rendering", 24));
    const muxStartedAt = performance.now();
    await ffmpeg.exec(buildFfmpegArgs(totalDurationMs));
    markTiming("ffmpegMuxMixExecMs", muxStartedAt);
    const thumbnailStartedAt = performance.now();
    const thumbnailFields = await selectVlogThumbnail(clips, thumbnailSizes.vlog);
    markTiming("thumbnailSelectionMs", thumbnailStartedAt);

    emitProgress(generationProgress("saving", 92));
    const readStartedAt = performance.now();
    const bytes = ffmpegFileToUint8Array(await ffmpeg.readFile(exportProfile.output));
    markTiming("ffmpegOutputReadMs", readStartedAt);
    const output = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const blob = new Blob([output], { type: "video/mp4" });

    const vlog: VlogRecord = {
      id: crypto.randomUUID(),
      sessionId,
      blob,
      mimeType: "video/mp4",
      ...thumbnailFields,
      clipCount: clips.length,
      title: suggestTitle(clips.length),
      caption: suggestCaption(clips.length),
      createdAt: new Date().toISOString(),
      size: blob.size,
      generationFingerprint,
    };
    markTiming("saveHandoffMs", startedAt);
    emitProgress(generationProgress("done", 100));
    addDebugEvent("generation-timing", "generation", {
      ...timing,
      totalMs: Math.round(performance.now() - startedAt),
      clipCount: clips.length,
      outputBytes: blob.size,
      audioFilters: ["dynaudnorm", "alimiter"],
    });
    addDebugEvent("vlog-generated", "generation", {
      vlogId: vlog.id,
      size: blob.size,
      clipCount: clips.length,
    });
    return vlog;
  } catch (cause) {
    if (cause instanceof AppError) {
      throw reportError(cause);
    }

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
  const seconds = Math.round((clipCount * (twoSecondRecordMs + recorderSettleMs)) / 1000);
  return `A quiet ${seconds}-second diary from today.`;
}
