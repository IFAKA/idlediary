import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

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

  test("one-shot flow records, edits, generates, and reaches Videos list", async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto("/demo/launch?scene=intro");

    await page.getByRole("button", { name: "Start recording" }).click();
    await page.getByRole("button", { name: "Record three second clip" }).click();
    await expect(
      page.getByRole("button", { name: "Review draft clips" }).getByText("+5"),
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Review draft clips" }).click();
    await expect(page.getByRole("button", { name: /^Preview clip / })).toHaveCount(5);

    await dragLocatorToLocator(
      page,
      page.locator("[data-clip-id] button").nth(1),
      page.locator("[data-clip-id] button").nth(3),
    );
    await dragLocatorToLocator(
      page,
      page.locator("[data-clip-id] button").nth(1),
      page.getByTestId("review-action-bar"),
    );
    await page.getByRole("button", { name: "Delete clip" }).click();
    await expect(page.getByRole("button", { name: /^Preview clip / })).toHaveCount(4);

    await page.getByRole("button", { name: "Preview clip 1" }).click();
    await expect(page.getByRole("button", { name: "Close fullscreen preview" })).toBeVisible();
    await page.getByRole("button", { name: "Close fullscreen preview" }).click();
    await expect(page.getByRole("button", { name: "Close fullscreen preview" })).toHaveCount(0);

    await page.getByRole("button", { name: "Make video" }).click({ force: true });
    await expect(page.getByRole("button", { name: "Done" })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Done" }).click();
    await page.getByRole("link", { name: "Videos" }).click();

    await expect(page.getByRole("heading", { name: "4 Tiny Moments" })).toBeVisible();
    await expect(page.getByText("4 clips")).toBeVisible();
    await expect(page.getByText("13s")).toBeVisible();
  });
});

async function dragLocatorToLocator(page: Page, source: Locator, target: Locator) {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error("Drag targets are not visible");
  const start = {
    x: sourceBox.x + sourceBox.width / 2,
    y: sourceBox.y + sourceBox.height / 2,
  };
  const end = {
    x: targetBox.x + targetBox.width / 2,
    y: targetBox.y + targetBox.height / 2,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.waitForTimeout(260);
  await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2, { steps: 8 });
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.waitForTimeout(120);
  await page.mouse.up();
}
