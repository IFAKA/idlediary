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
    tags: ["coffee", "home"],
    mood: "cozy",
    energy: "low",
    brightness: "normal",
  },
];

describe("local generative music", () => {
  it("creates deterministic MIDI and WAV bytes for the same seed", async () => {
    const first = await renderLocalMusicWav({ plan, descriptions, durationSeconds: 1 });
    const second = await renderLocalMusicWav({ plan, descriptions, durationSeconds: 1 });

    expect(first.musicWav).toEqual(second.musicWav);
    expect(first.musicMidi).toEqual(second.musicMidi);
    expect(first.musicWav.slice(0, 4)).toEqual(new Uint8Array([82, 73, 70, 70]));
    expect(first.musicMidi.slice(0, 4)).toEqual(new Uint8Array([77, 84, 104, 100]));
    expect(first.debug).toEqual(expect.objectContaining({ musicEngine: localMusicEngine }));
  });

  it("changes MIDI and music output for different seeds", async () => {
    const first = await renderLocalMusicWav({ plan, descriptions, durationSeconds: 1 });
    const second = await renderLocalMusicWav({
      plan: { ...plan, seed: "seed-2" },
      descriptions,
      durationSeconds: 1,
    });

    expect(first.musicMidi).not.toEqual(second.musicMidi);
    expect(first.musicWav).not.toEqual(second.musicWav);
  });

  it("maps the plan into separate chords, bass, drums, motif, and texture tracks", () => {
    const tracks = buildMidiTrackPlan({ ...plan, durationMs: 8_000, energy: "medium" });

    expect(tracks.map((track) => track.name)).toEqual([
      "warm chords",
      "round bass",
      "soft drums",
      "sparse motif",
      "room texture",
    ]);
    expect(tracks.every((track) => track.notes.length > 0)).toBe(true);
    expect(buildPlanMidi(plan).byteLength).toBeGreaterThan(120);
  });

  it("extends short videos enough for fades without making long tracks", () => {
    expect(musicDurationSecondsForVideo(3_000)).toBe(8);
    expect(musicDurationSecondsForVideo(40_000)).toBe(30);
  });
});
