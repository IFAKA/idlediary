import { describe, expect, it } from "vitest";
import { selectKeyframeTimes } from "./keyframes";

describe("selectKeyframeTimes", () => {
  it("selects capped 20, 50, and 80 percent clip frames", () => {
    expect(selectKeyframeTimes(10_000)).toEqual([2_000, 5_000, 8_000]);
    expect(selectKeyframeTimes(10_000, 2)).toEqual([2_000, 5_000]);
  });

  it("keeps frame times inside the clip duration", () => {
    expect(selectKeyframeTimes(100)).toEqual([20, 50, 80]);
    expect(selectKeyframeTimes(0)).toEqual([0, 0, 0]);
  });
});
