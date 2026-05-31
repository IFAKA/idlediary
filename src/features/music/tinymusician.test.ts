import { afterEach, describe, expect, it } from "vitest";
import {
  buildTinyMusicianPrompt,
  generateTinyMusicianWav,
  musicDurationSecondsForVideo,
  resetTinyMusicianForTests,
} from "./tinymusician";
import type { ClipMoodDescription, MusicPlan } from "./types";

const plan: MusicPlan = {
  seed: "seed-1",
  durationMs: 8_000,
  mood: "coffee",
  energy: "low",
  bpm: 74,
  key: "C",
  scale: "major pentatonic",
  instruments: ["electric-piano", "soft-bass", "brush-kit"],
  texture: "vinyl",
};

const description: ClipMoodDescription = {
  clipId: "clip-1",
  description: "coffee on a table at home",
  tags: ["coffee", "home"],
  mood: "coffee",
  energy: "low",
  brightness: "normal",
};

describe("TinyMusician generation", () => {
  afterEach(() => {
    resetTinyMusicianForTests();
    delete (window as typeof window & { __idleDiaryMockTinyMusician?: unknown }).__idleDiaryMockTinyMusician;
  });

  it("builds an instrumental lo-fi prompt from plan and video analysis", () => {
    expect(buildTinyMusicianPrompt(plan, [description])).toBe(
      "Instrumental classic lo-fi hip-hop loop, 74 BPM, warm Rhodes jazz chords, dusty swung drums, mellow bass, vinyl crackle, coffee home mood, key C major pentatonic, texture vinyl, no vocals, seamless background loop.",
    );
  });

  it("bounds music duration around the final video length", () => {
    expect(musicDurationSecondsForVideo(1_000)).toBe(8);
    expect(musicDurationSecondsForVideo(12_000)).toBe(14.4);
    expect(musicDurationSecondsForVideo(45_000)).toBe(30);
  });

  it("encodes mocked generated samples into a valid 48 kHz WAV", async () => {
    (window as typeof window & {
      __idleDiaryMockTinyMusician?: () => {
        audio: Float32Array;
        sampling_rate: number;
      };
    }).__idleDiaryMockTinyMusician = () => ({
      audio: new Float32Array([0, 0.5, -0.5, 0.25]),
      sampling_rate: 24_000,
    });

    const result = await generateTinyMusicianWav({
      plan,
      descriptions: [description],
      durationSeconds: 8,
    });

    expect(result.musicWav.slice(0, 4)).toEqual(new Uint8Array([82, 73, 70, 70]));
    expect(result.musicWav.length).toBe(44 + 48_000 * 8 * 2);
    expect(result.musicPrompt).toContain("74 BPM");
    expect(result.musicDurationSeconds).toBe(8);
  });

  it("throws a clear local-model error when TinyMusician cannot load", async () => {
    await expect(
      generateTinyMusicianWav({
        plan,
        descriptions: [description],
        durationSeconds: 8,
      }),
    ).rejects.toMatchObject({
      code: "generation-unavailable",
      context: expect.objectContaining({
        musicEngine: "tinymusician",
        installCommand: "npm run music:model:install",
      }),
    });
  });
});
