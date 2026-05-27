import { expect, test, type Page } from "@playwright/test";
import { mockDeniedCamera, mockMediaCapture } from "./media-mocks";

test.beforeEach(async ({ page }) => {
  await page.request.post("/__nextjs_disable_dev_indicator");
});

async function expectMobileDrawer(page: Page, name: string) {
  const dialog = page.getByRole("dialog", { name });
  await expect(dialog).toBeVisible();

  await expect
    .poll(async () => {
      const box = await dialog.boundingBox();
      const viewport = page.viewportSize();
      if (!box || !viewport) return Number.POSITIVE_INFINITY;
      return Math.abs((box.y + box.height) - viewport.height);
    })
    .toBeLessThanOrEqual(4);
}

async function holdDrag(page: Page, source: ReturnType<Page["getByRole"]>, target: { x: number; y: number }) {
  const sourceBox = await source.boundingBox();
  expect(sourceBox).not.toBeNull();
  const start = {
    x: sourceBox!.x + sourceBox!.width / 2,
    y: sourceBox!.y + sourceBox!.height / 2,
  };

  await source.dispatchEvent("mousedown", {
    bubbles: true,
    button: 0,
    buttons: 1,
    clientX: start.x,
    clientY: start.y,
  });
  await page.locator("body").dispatchEvent("mousemove", {
    bubbles: true,
    button: 0,
    buttons: 1,
    clientX: start.x + 18,
    clientY: start.y + 18,
  });
  await page.locator("body").dispatchEvent("mousemove", {
    bubbles: true,
    button: 0,
    buttons: 1,
    clientX: target.x,
    clientY: target.y,
  });
  await page.waitForTimeout(50);
  await page.locator("body").dispatchEvent("mouseup", {
    bubbles: true,
    button: 0,
    buttons: 0,
    clientX: target.x,
    clientY: target.y,
  });
}

async function holdDragClipToClip(page: Page, fromIndex: number, toIndex: number) {
  const source = page.getByRole("button", { name: `Preview clip ${fromIndex}` });
  const target = page.getByRole("button", { name: `Preview clip ${toIndex}` });
  const targetBox = await target.boundingBox();
  expect(targetBox).not.toBeNull();

  await holdDrag(page, source, {
    x: targetBox!.x + targetBox!.width / 2,
    y: targetBox!.y + targetBox!.height / 2,
  });
}

async function holdDragClipToDeleteZone(page: Page, index: number) {
  const source = page.getByRole("button", { name: `Preview clip ${index}` });
  const sourceBox = await source.boundingBox();
  expect(sourceBox).not.toBeNull();
  const start = {
    x: sourceBox!.x + sourceBox!.width / 2,
    y: sourceBox!.y + sourceBox!.height / 2,
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await source.dispatchEvent("mousedown", {
      bubbles: true,
      button: 0,
      buttons: 1,
      clientX: start.x,
      clientY: start.y,
    });
    await page.locator("body").dispatchEvent("mousemove", {
      bubbles: true,
      button: 0,
      buttons: 1,
      clientX: start.x + 18,
      clientY: start.y + 18,
    });

    try {
      await expect(page.getByText("Drop to delete")).toBeVisible({ timeout: 1_000 });
      break;
    } catch (error) {
      await page.locator("body").dispatchEvent("mouseup", {
        bubbles: true,
        button: 0,
        buttons: 0,
        clientX: start.x + 18,
        clientY: start.y + 18,
      });
      if (attempt === 1) throw error;
    }
  }

  const deleteZone = page.getByTestId("review-action-bar");
  const deleteBox = await deleteZone.boundingBox();
  expect(deleteBox).not.toBeNull();
  await page.locator("body").dispatchEvent("mousemove", {
    bubbles: true,
    button: 0,
    buttons: 1,
    clientX: deleteBox!.x + deleteBox!.width / 2,
    clientY: deleteBox!.y + deleteBox!.height / 2,
  });
  await page.waitForTimeout(50);
  await page.locator("body").dispatchEvent("mouseup", {
    bubbles: true,
    button: 0,
    buttons: 0,
    clientX: deleteBox!.x + deleteBox!.width / 2,
    clientY: deleteBox!.y + deleteBox!.height / 2,
  });
}

async function recordOneClipAndOpenReview(page: Page) {
  await mockMediaCapture(page);
  await page.goto("/capture");
  await page.getByRole("button", { name: "Record two second clip" }).click();
  await expect(page.getByText("Saved")).toBeVisible({ timeout: 4_000 });
  await page.getByRole("button", { name: "Review draft clips" }).click();
}

test("first launch shows intro screen", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { name: "IdleDiary" })).toBeVisible();
  const start = page.getByRole("button", { name: "Start recording" });
  await expect(start).toBeVisible();

  const box = await start.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
});

test("home shows generated videos entry point after intro", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("idlediary:intro-seen", "true");
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { exact: true, name: "Generated videos" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No generated videos yet" })).toBeVisible();
  const start = page.getByText("Start recording");
  await expect(start).toBeVisible();

  const box = await start.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
});

test("capture route opens the recording screen", async ({ page }) => {
  await mockMediaCapture(page);
  await page.goto("/capture");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { name: "No pressure" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Record two second clip" })).toBeVisible();
});

test("permission denial gives recovery copy and retry action", async ({ page }) => {
  await mockDeniedCamera(page);
  await page.goto("/capture");


  await expect(
    page
      .getByRole("main")
      .getByText("Camera access is blocked. Allow camera and microphone in browser settings, then retry."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry camera" })).toBeVisible();
});

test("mocked capture saves a two-second clip and enables draft review", async ({ page }) => {
  await mockMediaCapture(page);
  await page.goto("/capture");

  await expect(page.getByRole("heading", { name: "No pressure" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review draft clips" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );

  await page.getByRole("button", { name: "Record two second clip" }).click();
  await expect(page.getByText("Saved")).toBeVisible({ timeout: 4_000 });

  await expect(page.getByText("1", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review draft clips" })).toHaveAttribute(
    "aria-disabled",
    "false",
  );
  await expect(page).toHaveURL("/capture");
});

test("draft review opens before generation and make video stops the camera", async ({ page }) => {
  await mockMediaCapture(page, { generationDelayMs: 5_000 });
  await page.goto("/capture");

  await page.getByRole("button", { name: "Record two second clip" }).click();
  await expect(page.getByText("Saved")).toBeVisible({ timeout: 4_000 });

  await page.getByRole("button", { name: "Review draft clips" }).click();
  await expect(page).toHaveURL("/review");
  await expect(page.getByRole("heading", { name: "Draft clips" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview clip 1" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Make video" })).toBeVisible();
  await expect(
    page
      .getByRole("heading", { name: /Preparing|Loading local editor|Collecting clips|Making the vlog|Saving result|Done/ }),
  ).not.toBeVisible();
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as typeof window & { __idleDiaryStoppedTracks?: number })
              .__idleDiaryStoppedTracks ?? 0,
        ),
    )
    .toBe(0);

  await page.getByRole("button", { name: "Make video" }).click();

  await expect(page.getByRole("heading", { name: /Preparing|Loading local editor|Collecting clips|Making the vlog|Saving result|Done/ })).toBeVisible();
  await expect(page).toHaveURL("/review");
  await expect(page.getByRole("heading", { name: "No pressure" })).not.toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as typeof window & { __idleDiaryStoppedTracks?: number }).__idleDiaryStoppedTracks ?? 0))
    .toBeGreaterThan(0);
});

test("delete actions require confirmation and cancel preserves clips", async ({ page }) => {
  await mockMediaCapture(page);
  await page.goto("/capture");

  await page.getByRole("button", { name: "Record two second clip" }).click();
  await expect(page.getByText("Saved")).toBeVisible({ timeout: 4_000 });

  await page.getByRole("button", { name: "Review draft clips" }).click();
  await holdDragClipToDeleteZone(page, 1);
  await expectMobileDrawer(page, "Delete this clip?");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Preview clip 1" })).toBeVisible();

  await page.getByRole("button", { name: "Clear draft" }).click();
  await expectMobileDrawer(page, "Clear this draft?");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Preview clip 1" })).toBeVisible();
});

test("preview opens a fullscreen media player", async ({ page }) => {
  await mockMediaCapture(page);
  await page.goto("/capture");

  await page.getByRole("button", { name: "Record two second clip" }).click();
  await expect(page.getByText("Saved")).toBeVisible({ timeout: 4_000 });

  await page.getByRole("button", { name: "Review draft clips" }).click();
  await page.getByRole("button", { name: "Preview clip 1" }).click();
  await expect(page.getByRole("heading", { name: "Clip player" })).toBeVisible();
  await expect(page.getByLabel("Fullscreen clip preview")).toBeVisible();
  await page.getByRole("button", { name: "Close preview" }).click();
  await expect(page.getByRole("heading", { name: "Clip player" })).not.toBeVisible();
});

test("generated video preview opens fullscreen and result screen does not scroll", async ({ page }) => {
  await mockMediaCapture(page);
  await page.goto("/capture");

  await page.getByRole("button", { name: "Record two second clip" }).click();
  await expect(page.getByText("Saved")).toBeVisible({ timeout: 4_000 });

  await page.getByRole("button", { name: "Review draft clips" }).click();
  await page.getByRole("button", { name: "Make video" }).click();
  await expect(page.getByRole("heading", { name: "Two Seconds Today" })).toBeVisible({
    timeout: 8_000,
  });

  await expect
    .poll(() =>
      page.evaluate(() => {
        const root = document.scrollingElement;
        if (!root) return 0;
        return root.scrollHeight - root.clientHeight;
      }),
    )
    .toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "Open generated video fullscreen" }).click();
  await expect(page.getByLabel("Fullscreen generated video preview")).toBeVisible();
  await expect(page.getByRole("button", { name: "Close generated video preview" })).toBeVisible();
});

test("deleting the final clip returns to capture", async ({ page }) => {
  await mockMediaCapture(page);
  await page.goto("/capture");

  await page.getByRole("button", { name: "Record two second clip" }).click();
  await expect(page.getByText("Saved")).toBeVisible({ timeout: 4_000 });

  await page.getByRole("button", { name: "Review draft clips" }).click();
  await holdDragClipToDeleteZone(page, 1);
  await page.getByRole("button", { name: "Delete clip" }).click();
  await expect(page.getByRole("heading", { name: "No pressure" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review draft clips" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
});

test("clearing the draft returns to capture", async ({ page }) => {
  await mockMediaCapture(page);
  await page.goto("/capture");

  await page.getByRole("button", { name: "Record two second clip" }).click();
  await expect(page.getByText("Saved")).toBeVisible({ timeout: 4_000 });

  await page.getByRole("button", { name: "Review draft clips" }).click();
  await page.getByRole("button", { name: "Clear draft" }).click();
  await page
    .getByRole("dialog", { name: "Clear this draft?" })
    .getByRole("button", { name: "Clear draft" })
    .click();
  await expect(page.getByRole("heading", { name: "No pressure" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review draft clips" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
});

test("new recording after generation clears the old draft", async ({ page }) => {
  await mockMediaCapture(page);
  await page.goto("/capture");

  await page.getByRole("button", { name: "Record two second clip" }).click();
  await expect(page.getByText("Saved")).toBeVisible({ timeout: 4_000 });

  await page.getByRole("button", { name: "Review draft clips" }).click();
  await page.getByRole("button", { name: "Make video" }).click();
  await expect(page.getByRole("heading", { name: "Two Seconds Today" })).toBeVisible({
    timeout: 8_000,
  });

  await page.getByRole("button", { name: "New recording" }).click();
  await expectMobileDrawer(page, "Start a new recording?");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { name: "Two Seconds Today" })).toBeVisible();

  await page.getByRole("button", { name: "New recording" }).click();
  await page
    .getByRole("dialog", { name: "Start a new recording?" })
    .getByRole("button", { name: "New recording" })
    .click();

  await expect(page.getByRole("heading", { name: "No pressure" })).toBeVisible();
  await expect(page.getByRole("main").getByText("0", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review draft clips" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
});

test("recording a clip opens review, reloads on review, and keeps a named button", async ({ page }) => {
  await recordOneClipAndOpenReview(page);

  await expect(page).toHaveURL("/review");
  await expect(page.getByRole("heading", { name: "Draft clips" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview clip 1" })).toBeVisible();
  await expect(page).toHaveTitle("Review Draft Clips | IdleDiary");

  await page.reload();

  await expect(page).toHaveURL("/review");
  await expect(page.getByRole("heading", { name: "Draft clips" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview clip 1" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to camera" })).toBeVisible();
});

test("review URL without clips falls back to capture", async ({ page }) => {
  await mockMediaCapture(page);
  await page.goto("/review");

  await expect(page).toHaveURL("/capture");
  await expect(page.getByRole("heading", { name: "No pressure" })).toBeVisible();
  await expect(page).toHaveTitle("IdleDiary");
});

test("generated result restores after reload", async ({ page }) => {
  await recordOneClipAndOpenReview(page);
  await page.getByRole("button", { name: "Make video" }).click();
  await expect(page.getByRole("heading", { name: "Two Seconds Today" })).toBeVisible({
    timeout: 8_000,
  });
  await expect(page).toHaveURL("/result");
  await expect(page).toHaveTitle("Generated Video | IdleDiary");

  await page.reload();

  await expect(page).toHaveURL("/result");
  await expect(page.getByRole("heading", { name: "Two Seconds Today" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open generated video fullscreen" })).toBeVisible();
});

test("reloading during generation returns to review with clips preserved", async ({ page }) => {
  await mockMediaCapture(page, { generationDelayMs: 10_000 });
  await page.goto("/capture");
  await page.getByRole("button", { name: "Record two second clip" }).click();
  await expect(page.getByText("Saved")).toBeVisible({ timeout: 4_000 });
  await page.getByRole("button", { name: "Review draft clips" }).click();

  await page.getByRole("button", { name: "Make video" }).click();
  await expect(page.getByRole("heading", { name: /Preparing|Loading local editor|Collecting clips|Making the vlog|Saving result|Done/ })).toBeVisible();
  await expect(page).toHaveURL("/review");

  await page.reload();

  await expect(page).toHaveURL("/review");
  await expect(page.getByRole("heading", { name: "Draft clips" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview clip 1" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Preparing|Loading local editor|Collecting clips|Making the vlog|Saving result|Done/ }),
  ).not.toBeVisible();
});

test("back and forward navigate between capture and review", async ({ page }) => {
  await recordOneClipAndOpenReview(page);

  await expect(page).toHaveURL("/review");
  await page.goBack();

  await expect(page).toHaveURL("/capture");
  await expect(page.getByRole("heading", { name: "No pressure" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review draft clips" })).toHaveAttribute(
    "aria-disabled",
    "false",
  );

  await page.goForward();

  await expect(page).toHaveURL("/review");
  await expect(page.getByRole("heading", { name: "Draft clips" })).toBeVisible();
});

test("gallery reorders clips and generation receives UI order", async ({ page }) => {
  await mockMediaCapture(page);
  await page.goto("/capture");

  await page.getByRole("button", { name: "Record two second clip" }).click();
  await expect(page.getByText("Saved")).toBeVisible({ timeout: 4_000 });
  await page.getByRole("button", { name: "Record two second clip" }).click();
  await expect(page.getByText("2", { exact: true })).toBeVisible({ timeout: 4_000 });

  await page.getByRole("button", { name: "Review draft clips" }).click();
  const rows = page.locator("[data-clip-id]");
  await expect(rows).toHaveCount(2);
  const originalFirstId = await rows.nth(0).getAttribute("data-clip-id");
  const originalSecondId = await rows.nth(1).getAttribute("data-clip-id");

  await expect(page.getByRole("button", { name: "Delete clip 1" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Deselect clip 1" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Move clip/ })).toHaveCount(0);

  await holdDragClipToClip(page, 2, 1);
  await expect(rows.nth(0)).toHaveAttribute("data-clip-id", originalSecondId ?? "");
  await expect(rows.nth(1)).toHaveAttribute("data-clip-id", originalFirstId ?? "");

  await page.getByRole("button", { name: "Back to camera" }).click();
  await page.getByRole("button", { name: "Review draft clips" }).click();
  await expect(rows.nth(0)).toHaveAttribute("data-clip-id", originalSecondId ?? "");

  await page.getByRole("button", { name: "Make video" }).click();
  await expect(page.getByRole("heading", { name: /Preparing|Loading local editor|Collecting clips|Making the vlog|Saving result|Done/ })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __idleDiaryGenerationClipIds?: string[] })
            .__idleDiaryGenerationClipIds ?? [],
      ),
    )
    .toEqual([originalSecondId, originalFirstId]);
});

test("capture controls stay touch-sized and do not overlap on mobile", async ({ page }) => {
  await mockMediaCapture(page);
  await page.goto("/capture");

  const controls = [
    page.getByRole("button", { name: "Record two second clip" }),
    page.getByRole("button", { name: "Review draft clips" }),
  ];

  const boxes = [];
  for (const control of controls) {
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
    boxes.push(box);
  }

  for (let index = 0; index < boxes.length; index += 1) {
    for (let next = index + 1; next < boxes.length; next += 1) {
      const a = boxes[index]!;
      const b = boxes[next]!;
      const overlaps =
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y;
      expect(overlaps).toBe(false);
    }
  }
});

test("debug report opens in a mobile drawer with copy available", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Open debug report" }).click();
  await expectMobileDrawer(page, "Debug timeline");
  await expect(page.getByRole("button", { name: "Copy JSON" })).toBeVisible();
  await expect(page.getByText('"events"')).toBeVisible();
});
