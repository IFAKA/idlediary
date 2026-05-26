import { describe, expect, it, vi } from "vitest";
import { getCameraPermissionState } from "./permissions";

describe("getCameraPermissionState", () => {
  it("returns unsupported when media devices are missing", async () => {
    vi.stubGlobal("navigator", {});
    await expect(getCameraPermissionState()).resolves.toBe("unsupported");
    vi.unstubAllGlobals();
  });

  it("maps browser permission states", async () => {
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn() },
      permissions: { query: vi.fn().mockResolvedValue({ state: "denied" }) },
    });
    await expect(getCameraPermissionState()).resolves.toBe("denied");
    vi.unstubAllGlobals();
  });
});
