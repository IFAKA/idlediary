import { describe, expect, it } from "vitest";
import type { ClipRecord } from "@/features/clips/types";
import { buildVisualMusicProfile, visualMusicProfileVersion } from "./profile";

function clip(overrides: Partial<ClipRecord> = {}): ClipRecord {
  return {
    id: "clip-1",
    sessionId: "session-1",
    blob: new Blob(["clip"], { type: "video/mp4" }),
    mimeType: "video/mp4",
    durationMs: 3_000,
    createdAt: "2026-05-27T10:00:00.000Z",
    size: 480_000,
    ...overrides,
  };
}

describe("visual music profile", () => {
  it("derives a deterministic profile from measurable clip data", async () => {
    const first = await buildVisualMusicProfile([
      clip({ id: "clip-1", size: 420_000, durationMs: 3_000 }),
      clip({ id: "clip-2", size: 520_000, durationMs: 3_000 }),
    ]);
    const second = await buildVisualMusicProfile([
      clip({ id: "clip-1", size: 420_000, durationMs: 3_000 }),
      clip({ id: "clip-2", size: 520_000, durationMs: 3_000 }),
    ]);

    expect(first).toEqual(second);
    expect(first).toEqual(
      expect.objectContaining({
        version: visualMusicProfileVersion,
        brightness: expect.any(Number),
        saturation: expect.any(Number),
        contrast: expect.any(Number),
        warmth: expect.any(Number),
        pacing: expect.any(Number),
        originalAudioActivity: expect.any(Number),
      }),
    );
  });

  it("uses visual brightness fallback without semantic labels", async () => {
    const profile = await buildVisualMusicProfile([
      clip({
        analysis: {
          version: "mobilevit-small-q8-v1",
          description: "oxygen mask / shower curtain",
          mood: "oxygen",
          energy: "low",
          brightness: "dim",
          analyzedAt: "2026-05-27T10:00:00.000Z",
        },
      }),
    ]);

    expect(profile.brightness).toBeLessThan(0.4);
    expect(profile.saturation).toBeLessThan(0.4);
  });
});
