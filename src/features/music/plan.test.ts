import { describe, expect, it } from "vitest";
import { buildMusicPlan } from "./plan";
import type { ClipMoodDescription } from "./types";

const cozyDescription: ClipMoodDescription = {
  clipId: "clip-1",
  description: "coffee on a table at home",
  tags: ["coffee", "home"],
  mood: "coffee",
  energy: "low",
  brightness: "normal",
};

describe("buildMusicPlan", () => {
  it("is deterministic for descriptions and seed", () => {
    const first = buildMusicPlan([cozyDescription], 6_000, "seed-1");
    const second = buildMusicPlan([cozyDescription], 6_000, "seed-1");

    expect(first).toEqual(second);
    expect(first).toEqual(
      expect.objectContaining({
        seed: "seed-1",
        durationMs: 6_000,
        mood: "coffee",
        energy: "low",
      }),
    );
    expect(first.key).toEqual(expect.any(String));
    expect(first.scale).toEqual(expect.any(String));
    expect(first.instruments.length).toBeGreaterThan(0);
    expect(first.bpm).toBeGreaterThanOrEqual(62);
    expect(first.bpm).toBeLessThanOrEqual(83);
    expect(["minor pentatonic", "major pentatonic", "dorian"]).toContain(first.scale);
    expect(first.texture).not.toBe("none");
    expect(first.instruments).not.toContain("pluck");
    expect(first.instruments).not.toContain("mallet");
  });

  it("lets seed and AI caption words change the generated profile", () => {
    const rainy: ClipMoodDescription = {
      ...cozyDescription,
      clipId: "clip-2",
      mood: "rainy",
      energy: "medium",
      brightness: "dim",
    };

    expect(buildMusicPlan([cozyDescription], 6_000, "seed-1")).not.toEqual(
      buildMusicPlan([rainy, rainy], 6_000, "seed-2"),
    );
  });
});
