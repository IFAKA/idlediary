import { describe, expect, it } from "vitest";
import { AppError, redactContext, toAppError } from "./app-error";

describe("AppError", () => {
  it("creates stable structured errors", () => {
    const error = new AppError({
      code: "generation-failed",
      area: "generation",
      message: "failed",
      userMessage: "Could not finish.",
      context: { step: "rendering" },
    });

    expect(error.code).toBe("generation-failed");
    expect(error.area).toBe("generation");
    expect(error.userMessage).toBe("Could not finish.");
    expect(error.correlationId).toEqual(expect.any(String));
    expect(error.timestamp).toEqual(expect.any(String));
  });

  it("wraps unknown errors with fallback metadata", () => {
    const error = toAppError(new Error("browser broke"), {
      code: "camera-unavailable",
      area: "capture",
      message: "fallback",
      userMessage: "Camera unavailable.",
    });

    expect(error.message).toBe("browser broke");
    expect(error.code).toBe("camera-unavailable");
  });

  it("redacts sensitive context", () => {
    expect(redactContext({ token: "abc", clipBlob: new Blob(["x"]) })).toEqual({
      token: "[redacted]",
      clipBlob: "[redacted]",
    });
  });
});
