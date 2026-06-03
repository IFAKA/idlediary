const blockedVisionWords = new Set([
  "apron",
  "beaker",
  "beer",
  "buckle",
  "curtain",
  "gas",
  "gasmask",
  "groom",
  "helmet",
  "iron",
  "mask",
  "oxygen",
  "pin",
  "respirator",
  "safety",
  "seat",
  "shower",
  "smoothing",
  "sunglass",
  "shade",
  "windowshade",
]);

const lofiMoodWords = new Set([
  "beach",
  "bright",
  "calm",
  "city",
  "coffee",
  "cozy",
  "daily",
  "desk",
  "dim",
  "home",
  "indoor",
  "lamp",
  "light",
  "night",
  "rain",
  "rainy",
  "room",
  "street",
  "table",
  "window",
]);

export function musicSafeMoodCues(cues: string[]) {
  const safeCues = cues
    .map((cue) => cue.toLowerCase().trim())
    .filter((cue) => cue.length > 0)
    .filter((cue) => !cue.split(/[\s-]+/).some((word) => blockedVisionWords.has(word)))
    .filter((cue) => lofiMoodWords.has(cue));

  return [...new Set(safeCues)].slice(0, 8);
}

export function musicSafeMood(mood: string | undefined, cues: string[]) {
  const [cueMood] = musicSafeMoodCues([mood ?? "", ...cues]);
  return cueMood ?? "daily";
}
