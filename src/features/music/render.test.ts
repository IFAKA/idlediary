import { describe, expect, it } from "vitest";
import { composeGeneratedMusic } from "./compose";
import { renderCompositionToWav } from "./render";
import type { MusicPlan } from "./types";

const plan: MusicPlan = {
  seed: "seed-1",
  durationMs: 1_000,
  mood: "cozy",
  energy: "low",
  bpm: 74,
  key: "C",
  scale: "major pentatonic",
  instruments: ["felt-piano"],
  texture: "room",
};

describe("generated music rendering", () => {
  it("generates the requested PCM duration and encodes WAV", async () => {
    const composition = await composeGeneratedMusic(plan);
    const wav = renderCompositionToWav(composition);

    expect(composition.sampleRate).toBe(48_000);
    expect(composition.samples).toHaveLength(48_000);
    expect(peak(composition.samples)).toBeCloseTo(0.82);
    expect(wav.slice(0, 4)).toEqual(new Uint8Array([82, 73, 70, 70]));
    expect(wav.length).toBe(44 + 48_000 * 2);
  });

  it("keeps seeded procedural lofi deterministic, finite, and audible", async () => {
    const first = await composeGeneratedMusic(plan);
    const second = await composeGeneratedMusic(plan);
    const differentSeed = await composeGeneratedMusic({ ...plan, seed: "seed-2" });

    expect(first.samples).toEqual(second.samples);
    expect(first.samples).not.toEqual(differentSeed.samples);
    expect(peak(first.samples)).toBeCloseTo(0.82);
    expect(rms(first.samples)).toBeGreaterThan(0.01);

    for (const sample of first.samples) {
      expect(Number.isFinite(sample)).toBe(true);
      expect(Math.abs(sample)).toBeLessThanOrEqual(0.821);
    }
  });
});

function peak(samples: Float32Array) {
  let currentPeak = 0;
  for (const sample of samples) {
    currentPeak = Math.max(currentPeak, Math.abs(sample));
  }
  return currentPeak;
}

function rms(samples: Float32Array) {
  let sum = 0;
  for (const sample of samples) {
    sum += sample * sample;
  }
  return Math.sqrt(sum / samples.length);
}
