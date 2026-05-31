export type ClipMoodDescription = {
  clipId: string;
  description: string;
  tags: string[];
  mood: string;
  energy: "low" | "medium";
  brightness: "dim" | "normal" | "bright";
};

export type MusicPlan = {
  seed: string;
  durationMs: number;
  mood: string;
  energy: "low" | "medium";
  activity?: "low" | "medium" | "high";
  bpm: number;
  key: string;
  scale: string;
  instruments: string[];
  texture: "vinyl" | "rain" | "room" | "none";
};

export type VisualMusicProfile = {
  version: number;
  brightness: number;
  saturation: number;
  contrast: number;
  warmth: number;
  pacing: number;
  originalAudioActivity: number;
};

export type ClipKeyframe = {
  clipId: string;
  timeMs: number;
  dataUrl: string;
};
