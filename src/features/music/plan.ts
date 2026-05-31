import type { ClipMoodDescription, MusicPlan } from "./types";

export const musicProfileVersion = 1;

const moodSettings: Record<
  ClipMoodDescription["mood"],
  Pick<MusicPlan, "bpm" | "key" | "scale" | "instruments" | "texture">
> = {
  cozy: {
    bpm: 74,
    key: "C",
    scale: "major pentatonic",
    instruments: ["felt-piano", "soft-bass", "brush-kit"],
    texture: "room",
  },
  rainy: {
    bpm: 68,
    key: "D",
    scale: "minor pentatonic",
    instruments: ["electric-piano", "sub-bass", "brush-kit"],
    texture: "rain",
  },
  night: {
    bpm: 72,
    key: "A",
    scale: "minor",
    instruments: ["electric-piano", "warm-pad", "soft-kick"],
    texture: "vinyl",
  },
  bright: {
    bpm: 84,
    key: "G",
    scale: "major",
    instruments: ["mallet", "felt-piano", "soft-kit"],
    texture: "room",
  },
  travel: {
    bpm: 88,
    key: "E",
    scale: "dorian",
    instruments: ["pluck", "soft-bass", "soft-kit"],
    texture: "none",
  },
  neutral: {
    bpm: 76,
    key: "F",
    scale: "major pentatonic",
    instruments: ["felt-piano", "soft-bass", "brush-kit"],
    texture: "room",
  },
};

export function buildMusicPlan(
  descriptions: ClipMoodDescription[],
  durationMs: number,
  seed: string,
): MusicPlan {
  const mood = mostCommon(descriptions.map((description) => description.mood)) ?? "neutral";
  const mediumEnergyCount = descriptions.filter((description) => description.energy === "medium").length;
  const energy = mediumEnergyCount > descriptions.length / 2 ? "medium" : "low";
  const settings = moodSettings[mood];
  const seedOffset = seededInt(seed, -3, 3);

  return {
    seed,
    durationMs,
    mood,
    energy,
    bpm: settings.bpm + (energy === "medium" ? 4 : 0) + seedOffset,
    key: settings.key,
    scale: settings.scale,
    instruments: settings.instruments,
    texture: settings.texture,
  };
}

function mostCommon<T extends string>(values: T[]) {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];
}

function seededInt(seed: string, min: number, max: number) {
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return min + (Math.abs(hash) % (max - min + 1));
}
