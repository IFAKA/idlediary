import type { ClipMoodDescription, MusicPlan } from "./types";
import { musicSafeMood, musicSafeTags } from "./music-vocab";

export const musicProfileVersion = 9;

const keys = ["C", "D", "E", "F", "G", "A", "Bb"] as const;
const scales = ["minor pentatonic", "major pentatonic", "dorian"] as const;
const instrumentPalettes = [
  ["felt-piano", "soft-bass", "brush-kit"],
  ["electric-piano", "sub-bass", "brush-kit"],
  ["electric-piano", "warm-pad", "soft-kick"],
  ["felt-piano", "warm-pad", "brush-kit"],
  ["electric-piano", "soft-bass", "room-kit"],
] as const;
const textures = ["vinyl", "rain", "room"] as const;

export function buildMusicPlan(
  descriptions: ClipMoodDescription[],
  durationMs: number,
  seed: string,
): MusicPlan {
  const mood =
    mostCommon(
      descriptions.map((description) =>
        musicSafeMood(description.mood, description.tags),
      ),
    ) ?? "daily";
  const mediumEnergyCount = descriptions.filter((description) => description.energy === "medium").length;
  const energy = mediumEnergyCount > descriptions.length / 2 ? "medium" : "low";
  const profileSeed = [
    seed,
    mood,
    ...descriptions.flatMap((description) => musicSafeTags(description.tags)),
  ].join("|");
  const pick = picker(profileSeed);
  const baseBpm = energy === "medium" ? 76 + pick(11) : 70 + pick(9);

  return {
    seed,
    durationMs,
    mood,
    energy,
    bpm: baseBpm,
    key: keys[pick(keys.length)],
    scale: scales[pick(scales.length)],
    instruments: [...instrumentPalettes[pick(instrumentPalettes.length)]],
    texture: textures[pick(textures.length)],
  };
}

function mostCommon<T extends string>(values: T[]) {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];
}

function picker(seed: string) {
  let state = hash(seed);
  return (max: number) => {
    state = Math.imul(state ^ (state >>> 15), state | 1);
    state ^= state + Math.imul(state ^ (state >>> 7), state | 61);
    return Math.abs(state >>> 0) % max;
  };
}

function hash(seed: string) {
  let value = 2166136261;
  for (const char of seed) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value;
}
