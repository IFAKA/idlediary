import { defineDemo } from "@faka/demo-director";

export default defineDemo({
  name: "main",
  startUrl: "/demo/launch?scene=intro",
  output: "dist/demo/main.mp4",
  server: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3000",
    url: "http://127.0.0.1:3000",
    readyPath: "/demo/launch?scene=intro",
  },
  viewport: {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  format: {
    width: 1080,
    height: 1350,
    fps: 30,
    duration: { min: 28, max: 40 },
    crop: "social-4x5",
    cursor: "hidden",
    browserChrome: false,
  },
  steps: async ({ page, gesture, expect }) => {
    const logoButton = page.getByRole("button", { name: "Nudge app icon" });
    await logoButton.waitFor({ state: "visible", timeout: 10_000 });
    await gesture.wait(1850);
    await gesture.tap(logoButton, { xRatio: 0.74, yRatio: 0.28 });

    await gesture.tap(page.getByRole("button", { name: "Start recording" }), {
      afterMs: 360,
    });

    const recordButton = page.getByRole("button", { name: "Record three second clip" });
    await recordButton.waitFor({ state: "visible", timeout: 10_000 });
    await gesture.wait(320);
    await gesture.tap(recordButton);
    await page.getByRole("button", { name: "Review draft clips" }).getByText("+5").waitFor({
      state: "visible",
      timeout: 10_000,
    });
    await page.getByRole("status", { name: "Draft clips guide" }).waitFor({
      state: "visible",
      timeout: 5_000,
    });
    await gesture.wait(2600);

    await gesture.tap(page.getByRole("button", { name: "Review draft clips" }));
    await expect(page.getByRole("button", { name: /^Preview clip / })).toHaveCount(5);

    await gesture.drag({
      from: page.locator("[data-clip-id] button").nth(1),
      to: page.locator("[data-clip-id] button").nth(3),
      preset: "drag-to-delete",
      durationMs: 850,
    });
    await gesture.wait(650);

    await gesture.drag({
      from: page.locator("[data-clip-id] button").nth(1),
      to: page.getByTestId("review-action-bar"),
      preset: "drag-to-delete",
      holdMs: 320,
      durationMs: 950,
      releaseMs: 140,
    });

    const deleteClip = page.getByRole("button", { name: "Delete clip" });
    await deleteClip.waitFor({ state: "visible", timeout: 5_000 });
    await gesture.wait(700);
    await gesture.tap(deleteClip);
    await expect(page.getByRole("button", { name: /^Preview clip / })).toHaveCount(4);

    await gesture.tap(page.getByRole("button", { name: "Preview clip 1" }));
    const close = page.getByRole("button", { name: "Close fullscreen preview" });
    await close.waitFor({ state: "visible", timeout: 5_000 });
    await gesture.wait(900);
    await gesture.tap(close);

    await gesture.tap(page.getByRole("button", { name: "Make video" }));
    await page
      .getByRole("button", { name: "Open generated video fullscreen" })
      .waitFor({ state: "visible", timeout: 12_000 });
    await gesture.wait(5700);

    await gesture.tap(page.getByRole("button", { name: "Done" }));
    await page.getByRole("status", { name: "Saved video guide" }).waitFor({
      state: "visible",
      timeout: 5_000,
    });
    await gesture.wait(2600);
    await gesture.tap(page.getByRole("link", { name: "Videos" }), { beforeMs: 240 });
    await expect(page.getByRole("heading", { name: "4 Tiny Moments" })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("4 clips")).toBeVisible();
    await expect(page.getByText("13s")).toBeVisible();
    await gesture.wait(1700);
  },
});
