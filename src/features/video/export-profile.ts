export const exportProfile = {
  output: "vlog.mp4",
  width: 720,
  height: 1280,
  fps: 30,
  aspectRatio: 9 / 16,
  videoCodec: "libx264",
  pixelFormat: "yuv420p",
  audioCodec: "aac",
  audioSampleRate: 48_000,
  audioChannels: 2,
  audioFilter: "loudnorm=I=-16:TP=-1.5:LRA=11",
} as const;
