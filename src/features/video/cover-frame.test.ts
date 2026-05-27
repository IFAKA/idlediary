import { describe, expect, it } from "vitest";
import { exportProfile } from "./export-profile";
import { getCoverSourceRect } from "./cover-frame";

describe("getCoverSourceRect", () => {
  it("center-crops landscape sources into the vertical export canvas", () => {
    expect(
      getCoverSourceRect(1280, 720, exportProfile.width, exportProfile.height),
    ).toEqual({
      sx: 437.5,
      sy: 0,
      sw: 405,
      sh: 720,
    });
  });

  it("center-crops tall portrait sources into the vertical export canvas", () => {
    expect(
      getCoverSourceRect(720, 1600, exportProfile.width, exportProfile.height),
    ).toEqual({
      sx: 0,
      sy: 160,
      sw: 720,
      sh: 1280,
    });
  });
});
