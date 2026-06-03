import { describe, expect, it } from "vitest";
import {
  buildMidiTrackPlan,
  buildPlanMidi,
  localMusicEngine,
  musicDurationSecondsForVideo,
  renderLocalMusicWav,
} from "./local-music";
import type { ClipMoodDescription, MusicPlan } from "./types";

const plan: MusicPlan = {
  seed: "seed-1",
  durationMs: 1_000,
  mood: "cozy",
  energy: "low",
  bpm: 74,
  key: "C",
  scale: "major pentatonic",
  instruments: ["electric-piano", "soft-bass", "brush-kit"],
  texture: "room",
};

const descriptions: ClipMoodDescription[] = [
  {
    clipId: "clip-1",
    description: "coffee on a table at home",
    moodCues: ["coffee", "home"],
    mood: "cozy",
    energy: "low",
    brightness: "normal",
  },
];

describe("local generative music", () => {
  it("creates deterministic Scribbletune MIDI bytes for the same seed", () => {
    const first = buildPlanMidi({ ...plan, durationMs: 1_000 });
    const second = buildPlanMidi({ ...plan, durationMs: 1_000 });

    expect(first).toEqual(second);
    expect(first.slice(0, 4)).toEqual(new Uint8Array([77, 84, 104, 100]));
    expect(localMusicEngine).toBe("scribbletune-spessasynth");
  });

  it("changes MIDI output for different seeds", () => {
    const first = buildPlanMidi({ ...plan, durationMs: 1_000 });
    const second = buildPlanMidi({ ...plan, seed: "seed-2", durationMs: 1_000 });

    expect(first).not.toEqual(second);
  });

  it("maps the plan into separate chords, bass, drums, motif, and texture tracks", () => {
    const tracks = buildMidiTrackPlan({ ...plan, durationMs: 8_000, energy: "medium" });

    expect(tracks.map((track) => track.name)).toEqual([
      "warm chords",
      "upright bass",
      "brush drums",
      "vibes motif",
      "room texture",
    ]);
    expect(tracks.every((track) => track.notes.length > 0)).toBe(true);
    expect(buildPlanMidi(plan).byteLength).toBeGreaterThan(120);
  });

  it("does not fall back when SpessaSynth browser rendering is unavailable", async () => {
    await expect(renderLocalMusicWav({ plan, descriptions, durationSeconds: 1 })).rejects.toThrow(
      "Local generative music could not render",
    );
  });

  it("extends short videos enough for fades without making long tracks", () => {
    expect(musicDurationSecondsForVideo(3_000)).toBe(8);
    expect(musicDurationSecondsForVideo(40_000)).toBe(30);
  });
});
