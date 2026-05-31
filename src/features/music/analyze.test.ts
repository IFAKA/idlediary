import { describe, expect, it } from "vitest";
import { descriptionFromCaptions } from "./analyze";

describe("descriptionFromCaptions", () => {
  it("returns strict mood fields from local captions", () => {
    expect(descriptionFromCaptions("clip-1", ["a rainy night street through a window"])).toEqual({
      clipId: "clip-1",
      description: "a rainy night street through a window",
      tags: ["rainy", "night", "street", "window"],
      mood: "rainy",
      energy: "low",
      brightness: "dim",
    });
  });
});
