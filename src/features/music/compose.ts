import { Midi, Note, Scale } from "tonal";
import type { MusicPlan } from "./types";

export type MusicComposition = {
  plan: MusicPlan;
  sampleRate: number;
  samples: Float32Array;
};

const sampleRate = 48_000;
const twoPi = Math.PI * 2;
const targetPeak = 0.82;
const humanizeSeconds = 0.032;

type ToneWave = "sine" | "triangle" | "warm";

type ToneOptions = {
  wave: ToneWave;
  attackSeconds?: number;
  releaseSeconds?: number;
  detuneCents?: number;
  phaseOffset?: number;
};

export async function composeGeneratedMusic(plan: MusicPlan): Promise<MusicComposition> {
  await import("tone");

  const durationSeconds = Math.max(1, plan.durationMs / 1000);
  const totalSamples = Math.ceil(durationSeconds * sampleRate);
  const samples = new Float32Array(totalSamples);
  const random = seededRandom(plan.seed);
  const scaleNotes = scaleMidiNotes(plan.key, plan.scale);
  const beatSeconds = 60 / plan.bpm;
  const barSeconds = beatSeconds * 4;
  const chordDegrees = plan.scale.includes("minor") ? [0, 3, 4, 2] : [0, 4, 3, 5];

  for (let barStart = 0; barStart < durationSeconds; barStart += barSeconds) {
    const barIndex = Math.floor(barStart / barSeconds);
    const root = scaleNotes[chordDegrees[barIndex % chordDegrees.length] % scaleNotes.length];
    if (barIndex % 2 === 0) {
      renderChord(samples, root, barStart, barSeconds * 2.12, plan.energy === "medium" ? 0.062 : 0.052, random);
    }
    renderBass(samples, root - 24, barStart, beatSeconds, plan.energy === "medium" ? 0.074 : 0.062, random);

    for (let beat = 0; beat < 4; beat += 1) {
      const beatStart = barStart + beat * beatSeconds;
      if (beat === 0 || (plan.energy === "medium" && beat === 2 && random() > 0.34)) {
        renderKick(samples, beatStart + humanize(random, 0.01), plan.energy === "medium" ? 0.068 : 0.046);
      }
      if (beat === 2) {
        renderBrush(samples, beatStart + humanize(random, 0.024), 0.018 + random() * 0.006, random);
      }
      if (random() > 0.3) {
        renderHat(
          samples,
          barStart + (beat + 0.5) * beatSeconds + humanize(random, 0.024),
          0.006 + random() * 0.004,
          random,
        );
      }
    }

    if (barIndex % 2 === 1 && random() > 0.28) {
      renderMotif(samples, scaleNotes, barStart, beatSeconds, random);
    }
  }

  renderTexture(samples, plan.texture, random);
  applyFade(samples, 1.2, Math.min(2.4, durationSeconds / 4));
  applyLofiMaster(samples, random);
  normalizePeak(samples, targetPeak);

  return { plan, sampleRate, samples };
}

function scaleMidiNotes(key: string, scale: string) {
  const notes = Scale.get(`${key} ${scale}`).notes;
  const names = notes.length > 0 ? notes : Scale.get(`${key} major pentatonic`).notes;
  return names.map((name) => Midi.toMidi(Note.simplify(`${name}4`))).filter((midi): midi is number => midi !== null);
}

function humanize(random: () => number, amountSeconds: number) {
  return (random() * 2 - 1) * amountSeconds;
}

function renderChord(
  samples: Float32Array,
  rootMidi: number,
  start: number,
  duration: number,
  gain: number,
  random: () => number,
) {
  for (const interval of [0, 7, 14]) {
    const noteStart = start + humanize(random, 0.04);
    const noteGain = (gain / 3) * (0.82 + random() * 0.18);
    renderTone(samples, rootMidi + interval, noteStart, duration + humanize(random, 0.08), noteGain, {
      wave: "warm",
      attackSeconds: 0.32 + random() * 0.18,
      releaseSeconds: 0.92 + random() * 0.42,
      detuneCents: (random() - 0.5) * 5,
      phaseOffset: random() * twoPi,
    });
  }
}

function renderBass(
  samples: Float32Array,
  midi: number,
  barStart: number,
  beatSeconds: number,
  gain: number,
  random: () => number,
) {
  renderTone(samples, midi, barStart + humanize(random, 0.012), beatSeconds * 1.8, gain, {
    wave: "warm",
    attackSeconds: 0.1,
    releaseSeconds: 0.42,
    detuneCents: -3,
  });
  if (random() > 0.52) {
    renderTone(
      samples,
      midi + 7,
      barStart + beatSeconds * 2 + humanize(random, 0.018),
      beatSeconds * 1.34,
      gain * 0.42,
      {
        wave: "warm",
        attackSeconds: 0.12,
        releaseSeconds: 0.38,
        detuneCents: 2,
        phaseOffset: 0.4,
      },
    );
  }
}

function renderMotif(
  samples: Float32Array,
  scaleNotes: number[],
  barStart: number,
  beatSeconds: number,
  random: () => number,
) {
  const noteCount = random() > 0.56 ? 2 : 1;
  const motifStart = barStart + beatSeconds * (1.2 + random() * 1.6);
  for (let note = 0; note < noteCount; note += 1) {
    const melodyDegree = Math.floor(random() * scaleNotes.length);
    renderTone(
      samples,
      scaleNotes[melodyDegree] + 12,
      motifStart + note * beatSeconds * 0.72 + humanize(random, humanizeSeconds),
      beatSeconds * (0.46 + random() * 0.28),
      0.014 + random() * 0.008,
      {
        wave: "warm",
        attackSeconds: 0.11,
        releaseSeconds: 0.36,
        detuneCents: (random() - 0.5) * 4,
        phaseOffset: random() * twoPi,
      },
    );
  }
}

function renderTone(
  samples: Float32Array,
  midi: number,
  startSeconds: number,
  durationSeconds: number,
  gain: number,
  options: ToneOptions,
) {
  const start = Math.max(0, Math.floor(startSeconds * sampleRate));
  const length = Math.min(samples.length - start, Math.floor(durationSeconds * sampleRate));
  if (length <= 0) return;

  const frequency = Midi.midiToFreq(midi) * 2 ** ((options.detuneCents ?? 0) / 1200);
  const attackSamples = Math.max(1, Math.floor((options.attackSeconds ?? 0.06) * sampleRate));
  const releaseSamples = Math.max(1, Math.floor((options.releaseSeconds ?? 0.22) * sampleRate));
  const phaseOffset = options.phaseOffset ?? 0;
  for (let index = 0; index < length; index += 1) {
    const time = index / sampleRate;
    const phase = frequency * time + phaseOffset / twoPi;
    const raw = renderWave(phase, options.wave);
    const attack = Math.min(1, index / attackSamples);
    const release = Math.min(1, (length - index) / releaseSamples);
    const sustainDrift = 0.94 + 0.06 * Math.sin(twoPi * 0.19 * time + phaseOffset);
    const envelope = easeInOut(attack) * easeInOut(release) * sustainDrift;
    samples[start + index] += raw * gain * envelope;
  }
}

function renderWave(phase: number, wave: ToneWave) {
  const sine = Math.sin(twoPi * phase);
  if (wave === "sine") return sine;

  const triangle = 2 * Math.abs(2 * (phase - Math.floor(phase + 0.5))) - 1;
  if (wave === "triangle") return triangle;

  const second = Math.sin(twoPi * phase * 2 + 0.35);
  const sub = Math.sin(twoPi * phase * 0.5 - 0.2);
  return Math.tanh(sine * 0.62 + triangle * 0.26 + second * 0.09 + sub * 0.12);
}

function easeInOut(value: number) {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function renderKick(samples: Float32Array, startSeconds: number, gain: number) {
  const start = Math.max(0, Math.floor(startSeconds * sampleRate));
  const length = Math.min(samples.length - start, Math.floor(sampleRate * 0.16));
  if (length <= 0) return;
  for (let index = 0; index < length; index += 1) {
    const t = index / sampleRate;
    samples[start + index] += Math.sin(twoPi * (58 - t * 112) * t) * gain * Math.exp(-t * 16);
  }
}

function renderBrush(
  samples: Float32Array,
  startSeconds: number,
  gain: number,
  random: () => number,
) {
  renderNoiseBurst(samples, startSeconds, 0.12, gain, 12, random);
}

function renderHat(
  samples: Float32Array,
  startSeconds: number,
  gain: number,
  random: () => number,
) {
  renderNoiseBurst(samples, startSeconds, 0.035, gain, 52, random);
}

function renderNoiseBurst(
  samples: Float32Array,
  startSeconds: number,
  durationSeconds: number,
  gain: number,
  decay: number,
  random: () => number,
) {
  const start = Math.max(0, Math.floor(startSeconds * sampleRate));
  const length = Math.min(samples.length - start, Math.floor(durationSeconds * sampleRate));
  if (length <= 0) return;
  let noise = 0;
  for (let index = 0; index < length; index += 1) {
    noise = noise * 0.72 + (random() * 2 - 1) * 0.28;
    samples[start + index] += noise * gain * Math.exp(-(index / sampleRate) * decay);
  }
}

function renderTexture(samples: Float32Array, texture: MusicPlan["texture"], random: () => number) {
  if (texture === "none") return;
  const gain = texture === "rain" ? 0.018 : texture === "vinyl" ? 0.012 : 0.008;
  let filtered = 0;
  for (let index = 0; index < samples.length; index += 1) {
    filtered = filtered * 0.92 + (random() * 2 - 1) * 0.08;
    samples[index] += filtered * gain;
    if (texture === "vinyl" && random() > 0.9994) samples[index] += (random() * 2 - 1) * 0.08;
  }
}

function applyFade(samples: Float32Array, fadeInSeconds: number, fadeOutSeconds: number) {
  const fadeInSamples = Math.floor(fadeInSeconds * sampleRate);
  const fadeOutSamples = Math.floor(fadeOutSeconds * sampleRate);
  for (let index = 0; index < samples.length; index += 1) {
    const inGain = fadeInSamples > 0 ? Math.min(1, index / fadeInSamples) : 1;
    const outGain = fadeOutSamples > 0 ? Math.min(1, (samples.length - index) / fadeOutSamples) : 1;
    samples[index] *= Math.min(inGain, outGain);
  }
}

function applyLofiMaster(samples: Float32Array, random: () => number) {
  applyTapeDrift(samples, random);
  lowPass(samples, 3_400);
  addRoomTail(samples);
  saturate(samples);
  lowPass(samples, 5_600);
}

function applyTapeDrift(samples: Float32Array, random: () => number) {
  const source = new Float32Array(samples);
  const wowRate = 0.18 + random() * 0.07;
  const flutterRate = 4.8 + random() * 1.4;
  const wowDepthSamples = sampleRate * (0.0018 + random() * 0.0007);
  const flutterDepthSamples = sampleRate * (0.00022 + random() * 0.00014);
  const baseDelaySamples = sampleRate * 0.003;

  for (let index = 0; index < samples.length; index += 1) {
    const time = index / sampleRate;
    const delay =
      baseDelaySamples +
      Math.sin(twoPi * wowRate * time) * wowDepthSamples +
      Math.sin(twoPi * flutterRate * time + 0.7) * flutterDepthSamples;
    const drifted = interpolate(source, index - delay);
    const amplitude = 0.988 + Math.sin(twoPi * 0.31 * time + 1.1) * 0.012;
    samples[index] = (source[index] * 0.86 + drifted * 0.14) * amplitude;
  }
}

function interpolate(samples: Float32Array, position: number) {
  if (position <= 0) return samples[0] ?? 0;
  const left = Math.floor(position);
  const right = Math.min(samples.length - 1, left + 1);
  const blend = position - left;
  return samples[left] * (1 - blend) + samples[right] * blend;
}

function lowPass(samples: Float32Array, cutoffHz: number) {
  const rc = 1 / (twoPi * cutoffHz);
  const dt = 1 / sampleRate;
  const alpha = dt / (rc + dt);
  let filtered = samples[0] ?? 0;
  for (let index = 0; index < samples.length; index += 1) {
    filtered += alpha * (samples[index] - filtered);
    samples[index] = filtered;
  }
}

function addRoomTail(samples: Float32Array) {
  const delays = [0.043, 0.071, 0.113].map((seconds) => Math.floor(seconds * sampleRate));
  const feedback = [0.28, 0.2, 0.14];
  const wet = [0.13, 0.09, 0.06];

  for (let index = 0; index < samples.length; index += 1) {
    let tail = 0;
    for (let delayIndex = 0; delayIndex < delays.length; delayIndex += 1) {
      const delayedIndex = index - delays[delayIndex];
      if (delayedIndex < 0) continue;
      const delayed = samples[delayedIndex];
      tail += delayed * wet[delayIndex];
      samples[index] += delayed * feedback[delayIndex] * 0.08;
    }
    samples[index] += tail;
  }
}

function saturate(samples: Float32Array) {
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.tanh(samples[index] * 1.38) * 0.78;
  }
}

function normalizePeak(samples: Float32Array, peak: number) {
  let currentPeak = 0;
  for (const sample of samples) {
    currentPeak = Math.max(currentPeak, Math.abs(sample));
  }
  if (currentPeak <= 0) return;

  const gain = peak / currentPeak;
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] *= gain;
  }
}

function seededRandom(seed: string) {
  let state = 0x811c9dc5;
  for (const char of seed) {
    state ^= char.charCodeAt(0);
    state = Math.imul(state, 0x01000193);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
