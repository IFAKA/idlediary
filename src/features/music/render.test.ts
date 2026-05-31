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
    expect(Math.max(...composition.samples.map((sample) => Math.abs(sample)))).toBeCloseTo(0.82);
    expect(wav.slice(0, 4)).toEqual(new Uint8Array([82, 73, 70, 70]));
    expect(wav.length).toBe(44 + 48_000 * 2);
  });
});
