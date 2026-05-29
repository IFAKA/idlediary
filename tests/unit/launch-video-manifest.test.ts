import { describe, expect, test } from "vitest";
import sources from "../../scripts/launch-video/stock-sources.json";

describe("launch video stock manifest", () => {
  test("contains complete native portrait three-second sources", () => {
    expect(sources).toHaveLength(5);

    for (const source of sources) {
      expect(source.id).toMatch(/^[a-z-]+$/);
      expect(source.label).toBeTruthy();
      expect(source.pageUrl).toMatch(/^https:\/\/mixkit\.co\//);
      expect(source.downloadUrl).toMatch(/^https:\/\/assets\.mixkit\.co\/.+\.mp4$/);
      expect(source.license).toBe("Mixkit Stock Video Free License");
      expect(source.durationMs).toBe(3000);
      expect(source.expectedWidth).toBeGreaterThan(0);
      expect(source.expectedHeight).toBeGreaterThan(source.expectedWidth);
      expect(source.startMs).toBeGreaterThanOrEqual(0);
    }
  });
});
