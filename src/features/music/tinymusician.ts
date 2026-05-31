import { AppError } from "@/features/errors/app-error";
import { encodeMonoWav } from "./render";
import type { ClipMoodDescription, MusicPlan } from "./types";

type RawAudioLike = {
  audio?: Float32Array | Float32Array[];
  sampling_rate?: number;
  samplingRate?: number;
};

type TensorLike = {
  data: Iterable<number> | Float32Array;
};

type TinyMusicianGenerator = (
  prompt: string,
  options?: {
    max_new_tokens?: number;
    guidance_scale?: number;
    temperature?: number;
    do_sample?: boolean;
  },
) => Promise<RawAudioLike | RawAudioLike[]>;

const tinyMusicianModel = "itsmax/TinyMusician";
const modelPath = "/models/";
const wasmPath = "/transformers/";
const installCommand = "npm run music:model:install";
const fadeOutSeconds = 2.4;
const targetSampleRate = 48_000;
const requiredTinyMusicianFiles = [
  "config.json",
  "tokenizer.json",
  "generation_config.json",
  "onnx/text_encoder.onnx",
  "onnx/decoder_model_merged.onnx",
  "onnx/encodec_decode.onnx",
];

let tinyMusicianGeneratorPromise: Promise<TinyMusicianGenerator> | null = null;

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
  tinyMusicianGeneratorPromise = null;
}

export async function verifyTinyMusicianReadiness(
  fetcher: typeof fetch = fetch,
): Promise<void> {
  try {
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      throw new Error("TinyMusician requires browser execution");
    }
    if (!("gpu" in navigator)) {
      throw new Error("TinyMusician requires WebGPU support");
    }

    await Promise.all(
      requiredTinyMusicianFiles.map(async (file) => {
        const response = await fetcher(tinyMusicianAssetUrl(file), {
          cache: "force-cache",
          method: "HEAD",
        });
        if (!response.ok) {
          throw new Error(`TinyMusician file missing: ${file} (${response.status})`);
        }
      }),
    );
  } catch (cause) {
    throw tinyMusicianUnavailable(cause);
  }
}

export async function warmTinyMusician(): Promise<void> {
  await verifyTinyMusicianReadiness();
  if (tinyMusicianMock()) return;
  await loadTinyMusicianGenerator();
}

async function generateWithLocalTinyMusician(prompt: string, durationSeconds: number) {
  try {
    const generate = await loadTinyMusicianGenerator();
    const maxNewTokens = Math.max(64, Math.round(durationSeconds * 50));
    return await generate(prompt, {
      max_new_tokens: maxNewTokens,
      do_sample: true,
      guidance_scale: 3,
      temperature: 0.9,
    });
  } catch (cause) {
    throw tinyMusicianUnavailable(cause);
  }
}

async function loadTinyMusicianGenerator() {
  if (tinyMusicianGeneratorPromise) return tinyMusicianGeneratorPromise;

  tinyMusicianGeneratorPromise = (async () => {
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

    const [tokenizer, model] = await Promise.all([
      transformers.AutoTokenizer.from_pretrained(tinyMusicianModel, {
        local_files_only: true,
      }),
      transformers.MusicgenForConditionalGeneration.from_pretrained(tinyMusicianModel, {
        device: "webgpu",
        dtype: "fp32",
        local_files_only: true,
      }),
    ]);
    const samplingRate = (model as { config?: { audio_encoder?: { sampling_rate?: number } } })
      .config?.audio_encoder?.sampling_rate;

    return async (prompt, options = {}) => {
      const inputs = tokenizer(prompt, {
        padding: true,
        truncation: true,
      });
      const audioValues = (await model.generate({
        ...inputs,
        ...options,
      })) as TensorLike;

      return {
        audio: tensorDataToFloat32Array(audioValues),
        sampling_rate: samplingRate,
      };
    };
  })();

  return tinyMusicianGeneratorPromise;
}

function tensorDataToFloat32Array(tensor: TensorLike) {
  return tensor.data instanceof Float32Array
    ? tensor.data
    : new Float32Array([...tensor.data]);
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

function tinyMusicianAssetUrl(relativePath: string) {
  const path = `${modelPath}${tinyMusicianModel}/${relativePath}`;
  return typeof window === "undefined" ? path : new URL(path, window.location.href).href;
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
