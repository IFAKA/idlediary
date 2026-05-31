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

export function musicSafeTags(tags: string[]) {
  const safeTags = tags
    .map((tag) => tag.toLowerCase().trim())
    .filter((tag) => tag.length > 0)
    .filter((tag) => !tag.split(/[\s-]+/).some((word) => blockedVisionWords.has(word)))
    .filter((tag) => lofiMoodWords.has(tag));

  return [...new Set(safeTags)].slice(0, 8);
}

export function musicSafeMood(mood: string | undefined, tags: string[]) {
  const [tagMood] = musicSafeTags([mood ?? "", ...tags]);
  return tagMood ?? "daily";
}

