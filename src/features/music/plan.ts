import { profileSignature, visualMusicProfileVersion } from "./profile";
import type { MusicPlan, VisualMusicProfile } from "./types";

export const musicProfileVersion = visualMusicProfileVersion;

const keys = ["C", "D", "E", "F", "G", "A", "Bb"] as const;
const darkScales = ["minor pentatonic", "dorian", "minor pentatonic", "dorian"] as const;
const brightScales = ["major pentatonic", "major pentatonic", "dorian"] as const;
const balancedScales = ["minor pentatonic", "major pentatonic", "dorian"] as const;
const darkInstrumentPalettes = [
  ["felt-piano", "warm-pad", "brush-kit"],
  ["electric-piano", "warm-pad", "soft-kick"],
  ["felt-piano", "soft-bass", "brush-kit"],
] as const;
const brightInstrumentPalettes = [
  ["felt-piano", "soft-bass", "brush-kit"],
  ["electric-piano", "sub-bass", "brush-kit"],
  ["electric-piano", "soft-bass", "room-kit"],
] as const;
const balancedInstrumentPalettes = [
  ["electric-piano", "warm-pad", "soft-kick"],
  ["felt-piano", "warm-pad", "brush-kit"],
  ["electric-piano", "soft-bass", "room-kit"],
] as const;
const textures = ["vinyl", "rain", "room"] as const;

export function buildMusicPlan(
  profile: VisualMusicProfile,
  durationMs: number,
  seed: string,
): MusicPlan {
  const visualBrightness = profile.brightness * 0.62 + profile.saturation * 0.28 + profile.warmth * 0.1;
  const isDarkMuted = visualBrightness < 0.42 || (profile.brightness < 0.46 && profile.saturation < 0.38);
  const isBrightColorful = visualBrightness > 0.58 && profile.saturation > 0.42;
  const activityScore = clamp(
    profile.pacing * 0.5 + profile.contrast * 0.18 + profile.originalAudioActivity * 0.32,
    0,
    1,
  );
  const activity = activityScore > 0.66 ? "high" : activityScore > 0.38 ? "medium" : "low";
  const energy = activity === "high" ? "medium" : "low";
  const mood = isDarkMuted ? "dim-visual" : isBrightColorful ? "bright-visual" : "balanced-visual";
  const profileSeed = [seed, profileSignature(profile)].join("|");
  const pick = picker(profileSeed);
  const bpmFloor = isDarkMuted ? 66 : isBrightColorful ? 74 : 70;
  const bpmRange = isDarkMuted ? 9 : isBrightColorful ? 12 : 10;
  const activityLift = activity === "high" ? 6 : activity === "medium" ? 3 : 0;
  const scaleSet = isDarkMuted ? darkScales : isBrightColorful ? brightScales : balancedScales;
  const paletteSet = isDarkMuted
    ? darkInstrumentPalettes
    : isBrightColorful
      ? brightInstrumentPalettes
      : balancedInstrumentPalettes;

  return {
    seed,
    durationMs,
    mood,
    energy,
    activity,
    bpm: bpmFloor + activityLift + pick(bpmRange),
    key: keys[pick(keys.length)],
    scale: scaleSet[pick(scaleSet.length)],
    instruments: [...paletteSet[pick(paletteSet.length)]],
    texture: isDarkMuted && pick(4) === 0 ? "none" : textures[pick(textures.length)],
  };
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
