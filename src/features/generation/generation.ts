import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { AppError } from "@/features/errors/app-error";
import { addDebugEvent } from "@/features/errors/debug-store";
import { reportError } from "@/features/errors/report-error";
import type { ClipRecord, VlogRecord } from "@/features/clips/types";
import { generateVideoThumbnail, thumbnailSizes } from "@/features/clips/thumbnail";
import { getVlogByGenerationFingerprint } from "@/features/clips/storage";
import { recorderSettleMs, twoSecondRecordMs } from "@/lib/motion";
import { exportProfile } from "@/features/video/export-profile";
import { analyzeClipMoodDescriptions } from "@/features/music/analyze";
import { composeGeneratedMusic } from "@/features/music/compose";
import { extractClipKeyframes } from "@/features/music/keyframes";
import { buildMusicPlan, musicProfileVersion } from "@/features/music/plan";
import { renderCompositionToWav } from "@/features/music/render";
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
const technicalSummary = `MP4 concat demuxer | generated music mix | ${exportProfile.width}x${exportProfile.height} ${exportProfile.fps}fps H.264/AAC, faststart`;

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

  const keyframes = await extractClipKeyframes(clips);
  const descriptions = await analyzeClipMoodDescriptions(keyframes);
  const musicPlan = buildMusicPlan(descriptions, durationMs, seed);
  const composition = await composeGeneratedMusic(musicPlan);
  return {
    musicWav: renderCompositionToWav(composition),
    debug: {
      mocked: false,
      musicSeed: seed,
      musicProfileVersion,
      musicMood: musicPlan.mood,
    },
  };
}

function renderingLabelFor(value: number) {
  if (value >= 78) return "Making playback ready";
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
    emitProgress(
      generationProgress("writing", 14, {
        label: "Composing music",
        detail: "Looking at keyframes and making a quiet backing track",
      }),
    );

    const totalDurationMs = clips.reduce((total, clip) => total + clip.durationMs, 0);
    const { musicWav, debug: musicDebug } = await createGeneratedMusicWav(
      clips,
      totalDurationMs,
      musicSeed,
    );
    await ffmpeg.writeFile("music.wav", musicWav);

    const listLines: string[] = [];
    for (const [index, clip] of clips.entries()) {
      const input = `clip-${index}.mp4`;
      await ffmpeg.writeFile(input, await fetchFile(clip.blob));
      listLines.push(`file '${input}'`);
    }
    await ffmpeg.writeFile("inputs.txt", listLines.join("\n"));
    addDebugEvent("ffmpeg-inputs-written", "generation", {
      clipCount: clips.length,
      bytes: clips.reduce((total, clip) => total + clip.size, 0),
      ...musicDebug,
    });

    emitProgress(generationProgress("rendering", 24));
    await ffmpeg.exec(buildFfmpegArgs(totalDurationMs));

    emitProgress(generationProgress("saving", 92));
    const data = await ffmpeg.readFile(exportProfile.output);
    const bytes =
      typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
    const output = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const blob = new Blob([output], { type: "video/mp4" });
    let thumbnailFields: Pick<
      VlogRecord,
      "thumbnailBlob" | "thumbnailMimeType" | "thumbnailWidth" | "thumbnailHeight"
    > | null = null;

    try {
      thumbnailFields = await generateVideoThumbnail(blob, thumbnailSizes.vlog);
    } catch (error) {
      if (!(error instanceof AppError)) reportError(error);
    }

    const vlog: VlogRecord = {
      id: crypto.randomUUID(),
      sessionId,
      blob,
      mimeType: "video/mp4",
      ...(thumbnailFields ?? {}),
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
