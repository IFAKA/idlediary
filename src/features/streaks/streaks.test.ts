import { describe, expect, it } from "vitest";
import type { VlogRecord } from "@/features/clips/types";
import { calculateStreak, generatedDaySet } from "./streaks";

function vlog(createdAt: string): VlogRecord {
  const blob = new Blob(["x"], { type: "video/mp4" });
  return {
    id: createdAt,
    sessionId: createdAt.slice(0, 10),
    blob,
    mimeType: "video/mp4",
    clipCount: 1,
    title: "Title",
    caption: "Caption",
    createdAt,
    size: blob.size,
  };
}

describe("streaks", () => {
  it("builds generated day sets", () => {
    const days = generatedDaySet([vlog("2026-05-25T10:00:00.000Z")]);
    expect(days.has("2026-05-25")).toBe(true);
  });

  it("calculates consecutive streak from today", () => {
    const streak = calculateStreak(
      [
        vlog("2026-05-26T10:00:00.000Z"),
        vlog("2026-05-25T10:00:00.000Z"),
        vlog("2026-05-23T10:00:00.000Z"),
      ],
      new Date("2026-05-26T12:00:00.000Z"),
    );

    expect(streak).toBe(2);
  });
});
