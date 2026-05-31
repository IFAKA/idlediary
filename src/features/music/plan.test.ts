import { describe, expect, it } from "vitest";
import { buildMusicPlan, musicProfileVersion } from "./plan";
import { profileSignature, visualMusicProfileVersion } from "./profile";
import type { VisualMusicProfile } from "./types";

const balancedProfile: VisualMusicProfile = {
  version: visualMusicProfileVersion,
  brightness: 0.5,
  saturation: 0.42,
  contrast: 0.35,
  warmth: 0.5,
  pacing: 0.24,
  originalAudioActivity: 0.2,
};

const darkProfile: VisualMusicProfile = {
  ...balancedProfile,
  brightness: 0.24,
  saturation: 0.24,
  contrast: 0.28,
  warmth: 0.4,
  pacing: 0.12,
  originalAudioActivity: 0.08,
};

const brightProfile: VisualMusicProfile = {
  ...balancedProfile,
  brightness: 0.78,
  saturation: 0.72,
  contrast: 0.42,
  warmth: 0.62,
  pacing: 0.28,
  originalAudioActivity: 0.14,
};

describe("buildMusicPlan", () => {
  it("is deterministic for a visual profile and seed", () => {
    const first = buildMusicPlan(balancedProfile, 6_000, "seed-1");
    const second = buildMusicPlan(balancedProfile, 6_000, "seed-1");

    expect(first).toEqual(second);
    expect(first).toEqual(
      expect.objectContaining({
        seed: "seed-1",
        durationMs: 6_000,
        mood: "balanced-visual",
        energy: expect.any(String),
      }),
    );
    expect(first.key).toEqual(expect.any(String));
    expect(first.scale).toEqual(expect.any(String));
    expect(first.instruments.length).toBeGreaterThan(0);
    expect(first.bpm).toBeGreaterThanOrEqual(70);
    expect(first.bpm).toBeLessThanOrEqual(82);
    expect(first.texture).not.toBe("none");
    expect(first.instruments).not.toContain("pluck");
    expect(first.instruments).not.toContain("mallet");
  });

  it("uses the visual profile version in cache-sensitive signatures", () => {
    expect(musicProfileVersion).toBe(visualMusicProfileVersion);
    expect(profileSignature(balancedProfile)).not.toBe(
      profileSignature({ ...balancedProfile, version: balancedProfile.version + 1 }),
    );
  });

  it("maps dark muted profiles to slower, softer, minor-leaning choices", () => {
    const plan = buildMusicPlan(darkProfile, 6_000, "seed-1");

    expect(plan.mood).toBe("dim-visual");
    expect(plan.energy).toBe("low");
    expect(plan.activity).toBe("low");
    expect(plan.bpm).toBeGreaterThanOrEqual(66);
    expect(plan.bpm).toBeLessThanOrEqual(74);
    expect(["minor pentatonic", "dorian"]).toContain(plan.scale);
    expect(plan.instruments.some((instrument) => instrument.includes("pad") || instrument.includes("felt"))).toBe(true);
  });

  it("maps bright colorful profiles to brighter, faster, lighter choices", () => {
    const plan = buildMusicPlan(brightProfile, 6_000, "seed-1");

    expect(plan.mood).toBe("bright-visual");
    expect(plan.bpm).toBeGreaterThanOrEqual(74);
    expect(plan.bpm).toBeLessThanOrEqual(88);
    expect(["major pentatonic", "dorian"]).toContain(plan.scale);
    expect(plan.instruments).toEqual(expect.arrayContaining(["brush-kit"]));
  });

  it("uses pacing and original audio activity to increase arrangement activity", () => {
    const calm = buildMusicPlan({ ...balancedProfile, pacing: 0.1, originalAudioActivity: 0.05 }, 6_000, "seed-1");
    const busy = buildMusicPlan({ ...balancedProfile, pacing: 0.96, originalAudioActivity: 0.88 }, 6_000, "seed-1");

    expect(calm.activity).toBe("low");
    expect(busy.activity).toBe("high");
    expect(busy.energy).toBe("medium");
    expect(busy.bpm).toBeGreaterThan(calm.bpm);
  });

  it("lets seed and palette measurements change the generated plan", () => {
    expect(buildMusicPlan(balancedProfile, 6_000, "seed-1")).not.toEqual(
      buildMusicPlan(brightProfile, 6_000, "seed-2"),
    );
  });
});
