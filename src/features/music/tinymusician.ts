import { AppError } from "@/features/errors/app-error";
import { encodeMonoWav } from "./render";
import type { ClipMoodDescription, MusicPlan } from "./types";

type RawAudioLike = {
  audio?: Float32Array | Float32Array[];
  sampling_rate?: number;
  samplingRate?: number;
};

type TextToAudioPipeline = (
  prompt: string,
  options?: {
    max_new_tokens?: number;
    guidance_scale?: number;
    temperature?: number;
  },
) => Promise<RawAudioLike | RawAudioLike[]>;

const tinyMusicianModel = "itsmax/TinyMusician";
const modelPath = "/models/";
const wasmPath = "/transformers/";
const installCommand = "npm run music:model:install";
const fadeOutSeconds = 2.4;
const targetSampleRate = 48_000;

let tinyMusicianPipelinePromise: Promise<TextToAudioPipeline> | null = null;

export type TinyMusicianGenerationInput = {
  plan: MusicPlan;
  descriptions: ClipMoodDescription[];
  durationSeconds?: number;
};

export type TinyMusicianGenerationResult = {
  musicWav: Uint8Array;
  musicPrompt: string;
  musicDurationSeconds: number;
};

export function musicDurationSecondsForVideo(videoDurationMs: number) {
  return clamp(videoDurationMs / 1000 + fadeOutSeconds, 8, 30);
}

export function buildTinyMusicianPrompt(
  plan: MusicPlan,
  descriptions: ClipMoodDescription[],
) {
  const tags = uniqueWords(descriptions.flatMap((description) => description.tags)).slice(0, 8);
  const moodWords = uniqueWords([plan.mood, ...tags]);
  const moodPhrase = moodWords.length > 0 ? `${moodWords.join(" ")} mood` : "daily mood";

  return [
    "Instrumental classic lo-fi hip-hop loop",
    `${plan.bpm} BPM`,
    "warm Rhodes jazz chords",
    "dusty swung drums",
    "mellow bass",
    "vinyl crackle",
    moodPhrase,
    `key ${plan.key} ${plan.scale}`,
    `texture ${plan.texture}`,
    "no vocals",
    "seamless background loop",
  ].join(", ") + ".";
}

export async function generateTinyMusicianWav({
  plan,
  descriptions,
  durationSeconds = musicDurationSecondsForVideo(plan.durationMs),
}: TinyMusicianGenerationInput): Promise<TinyMusicianGenerationResult> {
  const musicPrompt = buildTinyMusicianPrompt(plan, descriptions);
  const mock = tinyMusicianMock();
  const audio = mock
    ? await mock({ prompt: musicPrompt, durationSeconds, plan, descriptions })
    : await generateWithLocalTinyMusician(musicPrompt, durationSeconds);

  const samples = normalizeAudioSamples(audio);
  const samplingRate = audioSamplingRate(audio);
  const boundedSamples = fitSamplesToDuration(samples, samplingRate, durationSeconds);

  return {
    musicWav: encodeMonoWav(resampleLinear(boundedSamples, samplingRate, targetSampleRate), targetSampleRate),
    musicPrompt,
    musicDurationSeconds: durationSeconds,
  };
}

export function resetTinyMusicianForTests() {
  tinyMusicianPipelinePromise = null;
}

async function generateWithLocalTinyMusician(prompt: string, durationSeconds: number) {
  try {
    const pipeline = await loadTinyMusicianPipeline();
    const maxNewTokens = Math.max(64, Math.round(durationSeconds * 50));
    return await pipeline(prompt, {
      max_new_tokens: maxNewTokens,
      guidance_scale: 3,
      temperature: 0.9,
    });
  } catch (cause) {
    throw tinyMusicianUnavailable(cause);
  }
}

async function loadTinyMusicianPipeline() {
  if (tinyMusicianPipelinePromise) return tinyMusicianPipelinePromise;

  tinyMusicianPipelinePromise = (async () => {
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      throw new Error("TinyMusician requires browser execution");
    }
    if (!("gpu" in navigator)) {
      throw new Error("TinyMusician requires WebGPU support");
    }

    const transformers = await import("@huggingface/transformers");
    transformers.env.allowLocalModels = true;
    transformers.env.allowRemoteModels = false;
    transformers.env.localModelPath = modelPath;
    const onnxBackend = transformers.env.backends.onnx as {
      wasm?: { wasmPaths?: string };
    };
    onnxBackend.wasm ??= {};
    onnxBackend.wasm.wasmPaths = wasmPath;

    return (await transformers.pipeline("text-to-audio", tinyMusicianModel, {
      device: "webgpu",
      dtype: "fp32",
      local_files_only: true,
    })) as TextToAudioPipeline;
  })();

  return tinyMusicianPipelinePromise;
}

function tinyMusicianMock() {
  return typeof window !== "undefined"
    ? (
        window as typeof window & {
          __idleDiaryMockTinyMusician?: (input: {
            prompt: string;
            durationSeconds: number;
            plan: MusicPlan;
            descriptions: ClipMoodDescription[];
          }) => RawAudioLike | RawAudioLike[] | Promise<RawAudioLike | RawAudioLike[]>;
        }
      ).__idleDiaryMockTinyMusician
    : undefined;
}

function normalizeAudioSamples(audio: RawAudioLike | RawAudioLike[]) {
  const first = Array.isArray(audio) ? audio[0] : audio;
  const chunks = first?.audio;
  if (chunks instanceof Float32Array) return chunks;
  if (Array.isArray(chunks) && chunks.every((chunk) => chunk instanceof Float32Array)) {
    const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
    const samples = new Float32Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      samples.set(chunk, offset);
      offset += chunk.length;
    }
    return samples;
  }
  throw new Error("TinyMusician returned no Float32Array audio samples");
}

function audioSamplingRate(audio: RawAudioLike | RawAudioLike[]) {
  const first = Array.isArray(audio) ? audio[0] : audio;
  const samplingRate = first?.sampling_rate ?? first?.samplingRate;
  if (typeof samplingRate === "number" && Number.isFinite(samplingRate) && samplingRate > 0) {
    return samplingRate;
  }
  throw new Error("TinyMusician returned audio without a sampling rate");
}

function fitSamplesToDuration(samples: Float32Array, sampleRate: number, durationSeconds: number) {
  const targetLength = Math.max(1, Math.round(durationSeconds * sampleRate));
  if (samples.length === targetLength) return samples;
  if (samples.length > targetLength) return samples.slice(0, targetLength);
  if (samples.length === 0) throw new Error("TinyMusician returned empty audio");

  const repeated = new Float32Array(targetLength);
  for (let offset = 0; offset < targetLength; offset += samples.length) {
    repeated.set(samples.subarray(0, Math.min(samples.length, targetLength - offset)), offset);
  }
  return repeated;
}

function resampleLinear(samples: Float32Array, sourceRate: number, outputRate: number) {
  if (sourceRate === outputRate) return samples;
  const outputLength = Math.max(1, Math.round((samples.length / sourceRate) * outputRate));
  const output = new Float32Array(outputLength);
  const ratio = sourceRate / outputRate;
  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = index * ratio;
    const left = Math.floor(sourceIndex);
    const right = Math.min(samples.length - 1, left + 1);
    const amount = sourceIndex - left;
    output[index] = samples[left] * (1 - amount) + samples[right] * amount;
  }
  return output;
}

function uniqueWords(words: string[]) {
  return [
    ...new Set(
      words
        .map((word) => word.toLowerCase().replace(/[^a-z0-9 -]/g, " ").trim())
        .filter(Boolean),
    ),
  ];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function tinyMusicianUnavailable(cause: unknown) {
  return new AppError({
    code: "generation-unavailable",
    area: "generation",
    message: "Local TinyMusician model could not generate music",
    userMessage: "Generated music needs TinyMusician installed locally with WebGPU support.",
    cause,
    context: {
      musicEngine: "tinymusician",
      model: tinyMusicianModel,
      modelPath,
      wasmPath,
      installCommand,
      causeName: cause instanceof Error ? cause.name : typeof cause,
      causeMessage: cause instanceof Error ? cause.message : String(cause),
    },
  });
}
