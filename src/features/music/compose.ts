import { Midi, Note, Scale } from "tonal";
import type { MusicPlan } from "./types";

export type MusicComposition = {
  plan: MusicPlan;
  sampleRate: number;
  samples: Float32Array;
};

const sampleRate = 48_000;
const twoPi = Math.PI * 2;

export async function composeGeneratedMusic(plan: MusicPlan): Promise<MusicComposition> {
  await import("tone");

  const durationSeconds = Math.max(1, plan.durationMs / 1000);
  const totalSamples = Math.ceil(durationSeconds * sampleRate);
  const samples = new Float32Array(totalSamples);
  const random = seededRandom(plan.seed);
  const scaleNotes = scaleMidiNotes(plan.key, plan.scale);
  const beatSeconds = 60 / plan.bpm;
  const barSeconds = beatSeconds * 4;
  const chordDegrees = plan.mood === "night" || plan.mood === "rainy" ? [0, 3, 4, 2] : [0, 4, 3, 5];

  for (let barStart = 0; barStart < durationSeconds; barStart += barSeconds) {
    const barIndex = Math.floor(barStart / barSeconds);
    const root = scaleNotes[chordDegrees[barIndex % chordDegrees.length] % scaleNotes.length];
    renderChord(samples, root, barStart, barSeconds * 0.92, plan.energy === "medium" ? 0.08 : 0.07);
    renderBass(samples, root - 24, barStart, beatSeconds, plan.energy === "medium" ? 0.11 : 0.09);

    for (let beat = 0; beat < 4; beat += 1) {
      renderKick(samples, barStart + beat * beatSeconds, plan.energy === "medium" ? 0.12 : 0.08);
      if (beat === 1 || beat === 3) renderBrush(samples, barStart + beat * beatSeconds, 0.04, random);
      renderHat(samples, barStart + (beat + 0.5) * beatSeconds, 0.025, random);
    }

    const melodyDegree = Math.floor(random() * scaleNotes.length);
    renderTone(
      samples,
      scaleNotes[melodyDegree] + 12,
      barStart + beatSeconds * (1 + random()),
      beatSeconds * (0.75 + random() * 0.55),
      0.045,
      "sine",
    );
  }

  renderTexture(samples, plan.texture, random);
  applyFade(samples, 1.2, Math.min(2.4, durationSeconds / 4));
  softLimit(samples);

  return { plan, sampleRate, samples };
}

function scaleMidiNotes(key: string, scale: string) {
  const notes = Scale.get(`${key} ${scale}`).notes;
  const names = notes.length > 0 ? notes : Scale.get(`${key} major pentatonic`).notes;
  return names.map((name) => Midi.toMidi(Note.simplify(`${name}4`))).filter((midi): midi is number => midi !== null);
}

function renderChord(samples: Float32Array, rootMidi: number, start: number, duration: number, gain: number) {
  for (const interval of [0, 4, 7, 12]) {
    renderTone(samples, rootMidi + interval, start, duration, gain / 4, "triangle");
  }
}

function renderBass(samples: Float32Array, midi: number, barStart: number, beatSeconds: number, gain: number) {
  renderTone(samples, midi, barStart, beatSeconds * 1.65, gain, "sine");
  renderTone(samples, midi + 7, barStart + beatSeconds * 2, beatSeconds * 1.3, gain * 0.72, "sine");
}

function renderTone(
  samples: Float32Array,
  midi: number,
  startSeconds: number,
  durationSeconds: number,
  gain: number,
  wave: "sine" | "triangle",
) {
  const start = Math.max(0, Math.floor(startSeconds * sampleRate));
  const length = Math.min(samples.length - start, Math.floor(durationSeconds * sampleRate));
  if (length <= 0) return;

  const frequency = Midi.midiToFreq(midi);
  for (let index = 0; index < length; index += 1) {
    const time = index / sampleRate;
    const phase = frequency * time;
    const raw = wave === "triangle" ? 2 * Math.abs(2 * (phase - Math.floor(phase + 0.5))) - 1 : Math.sin(twoPi * phase);
    const envelope = Math.min(1, index / (sampleRate * 0.04)) * Math.max(0, 1 - index / length);
    samples[start + index] += raw * gain * envelope;
  }
}

function renderKick(samples: Float32Array, startSeconds: number, gain: number) {
  const start = Math.floor(startSeconds * sampleRate);
  const length = Math.min(samples.length - start, Math.floor(sampleRate * 0.16));
  for (let index = 0; index < length; index += 1) {
    const t = index / sampleRate;
    samples[start + index] += Math.sin(twoPi * (90 - t * 260) * t) * gain * Math.exp(-t * 22);
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
  const start = Math.floor(startSeconds * sampleRate);
  const length = Math.min(samples.length - start, Math.floor(durationSeconds * sampleRate));
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

function softLimit(samples: Float32Array) {
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.tanh(samples[index] * 1.25) * 0.75;
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
