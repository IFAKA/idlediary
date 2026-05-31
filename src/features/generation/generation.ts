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
import { buildMusicPlan, musicProfileVersion } from "@/features/music/plan";
import { buildVisualMusicProfile } from "@/features/music/profile";
import {
  localMusicEngine,
  renderLocalMusicWav,
  musicDurationSecondsForVideo,
} from "@/features/music/local-music";
export { exportProfile } from "@/features/video/export-profile";

export type GenerationProgress = {
  step: "idle" | "loading" | "writing" | "rendering" | "saving" | "done" | "error";
  value: number;
  label: string;
  detail: string;
  technical: string;
  logs: string[];
  rawLogs: string[];
};

const maxLogLines = 8;
const maxRawLogLines = 120;
const musicVolume = 1.05;
const clipAudioVolume = 0.45;
export const renderPipelineVersion = 4;
const silentVlogColorGradeFilters = [
  "eq=contrast=0.985:saturation=1.14:brightness=0.018:gamma=1.025",
  "colorbalance=rs=0.035:gs=0.012:bs=-0.024:rm=0.026:gm=0.012:bm=-0.018:rh=0.014:gh=0.006:bh=-0.01",
  "curves=r='0/0.035 0.22/0.25 0.78/0.82 1/0.965':g='0/0.032 0.22/0.25 0.80/0.84 1/0.975':b='0/0.045 0.24/0.265 0.82/0.845 1/0.99'",
];
const technicalSummary = `local concat | original music mix | silent-vlog color grade | ${exportProfile.width}x${exportProfile.height} ${exportProfile.fps}fps H.264/AAC`;

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
    label: "Finding the mood",
    detail: "Reading your clips",
    technical: `${technicalSummary} | local keyframes, local music synthesis`,
  },
  rendering: {
    label: "Polishing the video",
    detail: "Balancing sound and color",
    technical: technicalSummary,
  },
  saving: {
    label: "Saving your vlog",
    detail: "Getting it ready to share",
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
let recentRawLogs: string[] = [];
let activeRenderValue = 24;
let activeFfmpegProgressBucket = -1;

export function buildFfmpegArgs(durationMs = twoSecondRecordMs + recorderSettleMs) {
  const durationSeconds = Math.max(0.1, durationMs / 1000);
  const fadeOutStart = Math.max(0, durationSeconds - 2.4).toFixed(3);
  const videoFilter = [
    `scale=${exportProfile.width}:${exportProfile.height}:force_original_aspect_ratio=increase`,
    `crop=${exportProfile.width}:${exportProfile.height}`,
    `fps=${exportProfile.fps}`,
    ...silentVlogColorGradeFilters,
    "unsharp=5:5:0.35:3:3:0.12",
    "format=yuv420p",
  ].join(",");
  const filterComplex = [
    `[0:v:0]${videoFilter}[vout]`,
    `[0:a:0]aformat=sample_rates=48000:channel_layouts=stereo,loudnorm=I=-18:TP=-1.5:LRA=11,dynaudnorm=f=150:g=7,volume=${clipAudioVolume},asplit=2[clipmix][clipduck]`,
    `[1:a:0]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:${durationSeconds.toFixed(3)},afade=t=in:st=0:d=1.2,afade=t=out:st=${fadeOutStart}:d=2.4,volume=${musicVolume}[musicbase]`,
    "[musicbase][clipduck]sidechaincompress=threshold=0.18:ratio=1.35:attack=24:release=220:makeup=1.2[duckedmusic]",
    "[clipmix][duckedmusic]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.84[aout]",
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
    "[vout]",
    "-map",
    "[aout]",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
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
    renderPipelineVersion,
  });
}

export function recentGenerationLogs(logs: string[], nextLog: string) {
  return [...logs, nextLog].slice(-maxLogLines);
}

export function recentRawGenerationLogs(logs: string[], nextLog: string) {
  return [...logs, nextLog].slice(-maxRawLogLines);
}

export function generationProgress(
  step: GenerationProgress["step"],
  value: number,
  overrides: Partial<
    Pick<GenerationProgress, "label" | "detail" | "technical" | "logs" | "rawLogs">
  > = {},
): GenerationProgress {
  return {
    step,
    value,
    logs: [],
    rawLogs: [],
    ...progressCopy[step],
    ...overrides,
  };
}

export function resetGenerationForTests() {
  ffmpegPromise = null;
  activeProgressSink = null;
  recentFfmpegLogs = [];
  recentRawLogs = [];
  activeRenderValue = 24;
  activeFfmpegProgressBucket = -1;
}

async function createGeneratedMusicWav(
  clips: ClipRecord[],
  durationMs: number,
  seed: string,
  onRawLog?: (message: string) => void,
) {
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

  const musicDurationSeconds = musicDurationSecondsForVideo(durationMs);
  const visualProfile = await buildVisualMusicProfile(clips);
  const musicPlan = buildMusicPlan(visualProfile, musicDurationSeconds * 1000, seed);
  const generatedMusic = await renderLocalMusicWav({
    plan: musicPlan,
    descriptions: [],
    durationSeconds: musicDurationSeconds,
    onRawLog,
  });
  return {
    musicWav: generatedMusic.musicWav,
    debug: {
      ...generatedMusic.debug,
      mocked: false,
      musicEngine: localMusicEngine,
      musicSeed: seed,
      musicProfileVersion,
      musicMood: musicPlan.mood,
      visualMusicProfile: visualProfile,
    },
  };
}

function renderingLabelFor(value: number) {
  if (value >= 78) return "Saving your vlog";
  return "Polishing the video";
}

function emitProgress(progress: GenerationProgress) {
  activeProgressSink?.({
    ...progress,
    logs: progress.logs.length > 0 ? progress.logs : recentFfmpegLogs,
    rawLogs: progress.rawLogs.length > 0 ? progress.rawLogs : recentRawLogs,
  });
}

function appendGenerationLog(message: string, progress: GenerationProgress) {
  recentFfmpegLogs = recentGenerationLogs(recentFfmpegLogs, message);
  emitProgress({
    ...progress,
    logs: recentFfmpegLogs,
  });
}

function appendRawGenerationLog(message: string, progress: GenerationProgress) {
  recentRawLogs = recentRawGenerationLogs(recentRawLogs, message);
  emitProgress({
    ...progress,
    rawLogs: recentRawLogs,
  });
}

function shellQuote(value: string) {
  if (/^[A-Za-z0-9_./:=+,-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
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
      recentRawLogs = recentRawGenerationLogs(recentRawLogs, message);
      recentFfmpegLogs = recentGenerationLogs(recentFfmpegLogs, `ffmpeg: ${message}`);
      addDebugEvent("ffmpeg-log", "generation", { message });
      emitProgress(
        generationProgress("rendering", activeRenderValue, {
          label: renderingLabelFor(activeRenderValue),
          logs: recentFfmpegLogs,
          rawLogs: recentRawLogs,
        }),
      );
    });
    ffmpeg.on("progress", ({ progress }) => {
      activeRenderValue = Math.max(24, Math.round(progress * 88));
      const progressPercent = Math.min(100, Math.max(0, Math.round(progress * 100)));
      const progressBucket = Math.floor(progressPercent / 10) * 10;
      const renderProgress = generationProgress("rendering", activeRenderValue, {
        label: renderingLabelFor(activeRenderValue),
      });
      if (progressBucket > activeFfmpegProgressBucket || progressPercent === 100) {
        activeFfmpegProgressBucket = progressBucket;
        appendRawGenerationLog(`progress=${progressPercent}%`, renderProgress);
        appendGenerationLog(`ffmpeg: mux/audio progress ${progressPercent}%`, renderProgress);
        return;
      }

      emitProgress(renderProgress);
    });

    appendGenerationLog("Loading FFmpeg core", generationProgress("loading", 8));
    appendRawGenerationLog("$ ffmpeg.wasm load", generationProgress("loading", 8));
    if (MockFFmpeg) {
      await ffmpeg.load();
      appendRawGenerationLog("ffmpeg.wasm load complete", generationProgress("loading", 10));
      appendGenerationLog("FFmpeg core ready", generationProgress("loading", 10));
      addDebugEvent("ffmpeg-loaded", "generation", { mocked: true });
      return ffmpeg;
    }

    const baseURL =
      typeof window === "undefined"
        ? "/ffmpeg"
        : new URL("/ffmpeg", window.location.href).href;
    appendRawGenerationLog(
      `$ ffmpeg.wasm load coreURL=${baseURL}/ffmpeg-core.js wasmURL=${baseURL}/ffmpeg-core.wasm`,
      generationProgress("loading", 8),
    );
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });
    appendRawGenerationLog("ffmpeg.wasm load complete", generationProgress("loading", 10));
    appendGenerationLog("FFmpeg core ready", generationProgress("loading", 10));
    addDebugEvent("ffmpeg-loaded", "generation");
    return ffmpeg;
  })();

  return ffmpegPromise;
}

export async function warmGenerationPipeline(): Promise<void> {
  const results = await Promise.allSettled([loadFfmpeg()]);
  const rejected = results.filter((result) => result.status === "rejected");
  addDebugEvent("generation-warmup", "generation", {
    ffmpeg: results[0]?.status ?? "unknown",
    musicEngine: localMusicEngine,
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
      message: "Generation requires MP4/H.264/AAC clips for local concat",
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
    activeFfmpegProgressBucket = -1;
    const startedAt = performance.now();
    const timing: Record<string, number> = {};
    const markTiming = (name: string, since: number) => {
      timing[name] = Math.round(performance.now() - since);
    };
    const musicSeed = options.musicSeed ?? crypto.randomUUID();
    appendGenerationLog(
      `Starting local generation for ${clips.length} clip${clips.length === 1 ? "" : "s"}`,
      generationProgress("loading", 8),
    );
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
      appendGenerationLog("Reusing cached generated video", generationProgress("done", 100));
      addDebugEvent("vlog-generation-reused", "generation", {
        vlogId: cachedVlog.id,
        size: cachedVlog.size,
        clipCount: clips.length,
      });
      return cachedVlog;
    }

    const totalDurationMs = clips.reduce((total, clip) => total + clip.durationMs, 0);
    const ffmpegLoadStartedAt = performance.now();
    appendGenerationLog("Preparing FFmpeg workspace", generationProgress("loading", 8));
    const ffmpegPromise = loadFfmpeg().then((ffmpeg) => {
      markTiming("ffmpegLoadMs", ffmpegLoadStartedAt);
      return ffmpeg;
    });
    appendGenerationLog(
      "Creating original lo-fi music",
      generationProgress("writing", 18, {
        label: "Making the soundtrack",
        detail: "Creating original lo-fi music",
      }),
    );

    const musicStartedAt = performance.now();
    const generatedMusicPromise = createGeneratedMusicWav(
      clips,
      totalDurationMs,
      musicSeed,
      (message) => appendRawGenerationLog(message, generationProgress("writing", 18)),
    ).then((generatedMusic) => {
      markTiming("musicGenerationMs", musicStartedAt);
      return generatedMusic;
    });
    const clipFilesPromise = Promise.all(
      clips.map(async (clip, index) => ({
        clip,
        input: `clip-${index}.mp4`,
        data: await fetchFile(clip.blob),
      })),
    );
    const [ffmpeg, { musicWav, debug: musicDebug }, clipFiles] = await Promise.all([
      ffmpegPromise,
      generatedMusicPromise,
      clipFilesPromise,
    ]);
    appendGenerationLog(
      `Soundtrack ready (${musicWav.byteLength.toLocaleString()} bytes)`,
      generationProgress("writing", 20, {
        label: "Making the soundtrack",
        detail: "Creating original lo-fi music",
      }),
    );
    const writeStartedAt = performance.now();
    appendGenerationLog("Writing music.wav into FFmpeg", generationProgress("writing", 20));
    await ffmpeg.writeFile("music.wav", musicWav);

    const listLines: string[] = [];
    for (const { clip, input, data } of clipFiles) {
      appendGenerationLog(
        `Writing ${input} (${(clip.size / 1024).toFixed(1)} KB)`,
        generationProgress("writing", 20),
      );
      await ffmpeg.writeFile(input, data);
      listLines.push(`file '${input}'`);
    }
    await ffmpeg.writeFile("inputs.txt", listLines.join("\n"));
    markTiming("ffmpegWriteFilesMs", writeStartedAt);
    appendGenerationLog("Wrote concat manifest inputs.txt", generationProgress("writing", 22));
    addDebugEvent("ffmpeg-inputs-written", "generation", {
      clipCount: clips.length,
      bytes: clips.reduce((total, clip) => total + clip.size, 0),
      ...musicDebug,
    });

    appendGenerationLog(
      "Balancing sound and color",
      generationProgress("rendering", 24),
    );
    appendRawGenerationLog(
      `$ ffmpeg ${buildFfmpegArgs(totalDurationMs).map(shellQuote).join(" ")}`,
      generationProgress("rendering", 24),
    );
    const muxStartedAt = performance.now();
    await ffmpeg.exec(buildFfmpegArgs(totalDurationMs));
    markTiming("ffmpegMuxMixExecMs", muxStartedAt);
    appendGenerationLog(
      "Video polish complete",
      generationProgress("rendering", Math.max(activeRenderValue, 88), {
        label: "Saving your vlog",
      }),
    );
    const thumbnailStartedAt = performance.now();
    appendGenerationLog(
      "Selecting saved-video thumbnail",
      generationProgress("rendering", Math.max(activeRenderValue, 88), {
        label: "Saving your vlog",
      }),
    );
    const thumbnailFields = await selectVlogThumbnail(clips, thumbnailSizes.vlog);
    markTiming("thumbnailSelectionMs", thumbnailStartedAt);

    appendGenerationLog("Reading vlog.mp4 output", generationProgress("saving", 92));
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
    appendGenerationLog(
      `Generated video ready (${blob.size.toLocaleString()} bytes)`,
      generationProgress("done", 100),
    );
    addDebugEvent("generation-timing", "generation", {
      ...timing,
      totalMs: Math.round(performance.now() - startedAt),
      clipCount: clips.length,
      outputBytes: blob.size,
      audioFilters: ["loudnorm", "dynaudnorm", "afade", "sidechaincompress", "amix", "alimiter"],
      videoFilters: ["scale", "crop", "fps", "eq", "colorbalance", "curves", "unsharp", "format"],
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
