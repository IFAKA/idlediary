import type { ClipMoodDescription, MusicPlan } from "./types";

export const musicProfileVersion = 2;

const keys = ["C", "D", "E", "F", "G", "A", "Bb"] as const;
const scales = ["major pentatonic", "minor pentatonic", "major", "minor", "dorian"] as const;
const instrumentPalettes = [
  ["felt-piano", "soft-bass", "brush-kit"],
  ["electric-piano", "sub-bass", "brush-kit"],
  ["electric-piano", "warm-pad", "soft-kick"],
  ["mallet", "felt-piano", "soft-kit"],
  ["pluck", "soft-bass", "soft-kit"],
] as const;
const textures = ["vinyl", "rain", "room", "none"] as const;

export function buildMusicPlan(
  descriptions: ClipMoodDescription[],
  durationMs: number,
  seed: string,
): MusicPlan {
  const mood = mostCommon(descriptions.map((description) => description.mood)) ?? "daily";
  const mediumEnergyCount = descriptions.filter((description) => description.energy === "medium").length;
  const energy = mediumEnergyCount > descriptions.length / 2 ? "medium" : "low";
  const profileSeed = [seed, mood, ...descriptions.flatMap((description) => description.tags)].join("|");
  const pick = picker(profileSeed);
  const baseBpm = 66 + pick(23);

  return {
    seed,
    durationMs,
    mood,
    energy,
    bpm: baseBpm + (energy === "medium" ? 8 : 0),
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
