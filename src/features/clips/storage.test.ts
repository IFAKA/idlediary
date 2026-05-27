import { describe, expect, it } from "vitest";
import type { VlogRecord } from "./types";
import { sortVlogsNewestFirst } from "./storage";

function vlog(id: string, createdAt: string): VlogRecord {
  return {
    id,
    sessionId: createdAt.slice(0, 10),
    blob: new Blob(["video"], { type: "video/mp4" }),
    mimeType: "video/mp4",
    clipCount: 1,
    title: id,
    caption: "",
    createdAt,
  };
}

describe("sortVlogsNewestFirst", () => {
  it("sorts saved videos from most recent to oldest without mutating input", () => {
    const oldest = vlog("oldest", "2026-05-25T08:00:00.000Z");
    const newest = vlog("newest", "2026-05-27T08:00:00.000Z");
    const middle = vlog("middle", "2026-05-26T08:00:00.000Z");
    const vlogs = [oldest, newest, middle];

    expect(sortVlogsNewestFirst(vlogs).map((item) => item.id)).toEqual([
      "newest",
      "middle",
      "oldest",
    ]);
    expect(vlogs.map((item) => item.id)).toEqual(["oldest", "newest", "middle"]);
  });

  it("uses id as a stable tie-breaker for videos created at the same time", () => {
    const createdAt = "2026-05-27T08:00:00.000Z";

    expect(
      sortVlogsNewestFirst([vlog("video-a", createdAt), vlog("video-b", createdAt)]).map(
        (item) => item.id,
      ),
    ).toEqual(["video-b", "video-a"]);
  });

  it("sorts videos regardless of optional thumbnail fields", () => {
    const withThumbnail = {
      ...vlog("with-thumbnail", "2026-05-27T08:00:00.000Z"),
      thumbnailBlob: new Blob(["thumb"], { type: "image/webp" }),
      thumbnailMimeType: "image/webp",
      thumbnailWidth: 360,
      thumbnailHeight: 640,
    };
    const withoutThumbnail = vlog("without-thumbnail", "2026-05-26T08:00:00.000Z");

    expect(sortVlogsNewestFirst([withoutThumbnail, withThumbnail]).map((item) => item.id)).toEqual([
      "with-thumbnail",
      "without-thumbnail",
    ]);
  });
});
