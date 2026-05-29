import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const generatedAssetsReady = existsSync(resolve(process.cwd(), "public/demo-clips/manifest.json"));

declare global {
  interface Window {
    __idleDiaryDemoTap?: (x: number, y: number) => void;
    __idleDiaryStartedStreams?: number;
  }
}

test.beforeEach(async ({ page }) => {
  await page.request.post("/__nextjs_disable_dev_indicator");
});

test("normal app route does not expose demo tap trigger", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("idlediary:intro-seen", "true");
  });

  await page.goto("/");

  await expect(page.getByTestId("demo-tap-overlay")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => typeof window.__idleDiaryDemoTap))
    .toBe("undefined");
});

test.describe("launch demo route", () => {
  test.skip(!generatedAssetsReady, "Run npm run launch-video to generate demo assets first.");

  test("record scene loads without requesting camera and can create a demo clip", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("idlediary:intro-seen", "true");
      window.__idleDiaryStartedStreams = 0;
      const originalGetUserMedia = navigator.mediaDevices?.getUserMedia;
      if (navigator.mediaDevices) {
        navigator.mediaDevices.getUserMedia = async (...args) => {
          window.__idleDiaryStartedStreams = (window.__idleDiaryStartedStreams ?? 0) + 1;
          return originalGetUserMedia?.apply(navigator.mediaDevices, args) ?? Promise.reject(new Error("blocked"));
        };
      }
    });

    await page.goto("/demo/launch?scene=record");
    await expect(page.getByTestId("camera-preview-frame")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.__idleDiaryStartedStreams ?? 0))
      .toBe(0);

    await page.getByRole("button", { name: "Record three second clip" }).click();
    await expect(page.getByText("+1")).toBeVisible({ timeout: 5_000 });
  });

  test("draft and result scenes show seeded demo media", async ({ page }) => {
    await page.goto("/demo/launch?scene=draft");
    await expect(page.getByRole("button", { name: /^Preview clip / })).toHaveCount(5);
    await expect(page.getByRole("button", { name: "Make video" })).toBeVisible();

    await page.goto("/demo/launch?scene=result");
    await expect(page.getByRole("button", { name: "Open generated video fullscreen" })).toBeVisible({
      timeout: 8_000,
    });
  });

  test("tap overlay exposes a demo trigger and removes ripples", async ({ page }) => {
    await page.goto("/demo/launch?scene=record");

    await expect
      .poll(() => page.evaluate(() => typeof window.__idleDiaryDemoTap))
      .toBe("function");
    await page.evaluate(() => window.__idleDiaryDemoTap?.(120, 240));
    await expect(page.getByTestId("demo-tap-ripple")).toBeVisible();
    await expect(page.getByTestId("demo-tap-ripple")).toHaveCount(0, { timeout: 1_000 });
  });
});
