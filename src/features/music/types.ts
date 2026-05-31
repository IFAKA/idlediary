export type ClipMoodDescription = {
  clipId: string;
  description: string;
  tags: string[];
  mood: "cozy" | "rainy" | "night" | "bright" | "travel" | "neutral";
  energy: "low" | "medium";
  brightness: "dim" | "normal" | "bright";
};

export type MusicPlan = {
  seed: string;
  durationMs: number;
  mood: ClipMoodDescription["mood"];
  energy: "low" | "medium";
  bpm: number;
  key: string;
  scale: string;
  instruments: string[];
  texture: "vinyl" | "rain" | "room" | "none";
};

export type ClipKeyframe = {
  clipId: string;
  timeMs: number;
  dataUrl: string;
};
