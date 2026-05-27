import { expect, test, type Page } from "@playwright/test";
import { mockDeniedCamera, mockMediaCapture } from "./media-mocks";

test.beforeEach(async ({ page }) => {
  await page.request.post("/__nextjs_disable_dev_indicator");
});

async function openRecord(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("idlediary:intro-seen", "true");
  });
  await page.goto("/");
}

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

async function expectControlNotTopHitTarget(
  page: Page,
  control: ReturnType<Page["getByLabel"]>,
  label: string,
) {
  await expect(control).toBeVisible();
  const box = await control.boundingBox();
  expect(box).not.toBeNull();

  const topHitLabel = await page.evaluate(
    ({ x, y }) => {
      const element = document.elementFromPoint(x, y);
      return element?.closest("button,a")?.getAttribute("aria-label") ?? null;
    },
    {
      x: box!.x + box!.width / 2,
      y: box!.y + box!.height / 2,
    },
  );

  expect(topHitLabel).not.toBe(label);
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

async function expectClipRecorded(page: Page, clipCount: number) {
  await expect(page.getByRole("button", { name: "Review draft clips" })).toHaveAttribute(
    "aria-disabled",
    "false",
    { timeout: 8_000 },
  );
  await expect(
    page.getByRole("button", { name: "Review draft clips" }).getByText(`+${clipCount}`),
  ).toBeVisible();
}

async function recordOneClipAndOpenReview(page: Page) {
  await mockMediaCapture(page);
  await openRecord(page);
  await page.getByRole("button", { name: "Record three second clip" }).click();
  await expectClipRecorded(page, 1);
  await page.getByRole("button", { name: "Review draft clips" }).click();
}

async function generateOneVideo(page: Page) {
  await recordOneClipAndOpenReview(page);
  await page.getByRole("button", { name: "Make video" }).click();
  await expect(page.getByRole("heading", { name: "Two Seconds Today" })).toBeVisible({
    timeout: 8_000,
  });
}

test("first launch shows intro screen", async ({ page }) => {
  await mockMediaCapture(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { name: "IdleDiary" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Capture 3 seconds" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Keep it local" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Generate the diary" })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __idleDiaryStartedStreams?: number })
            .__idleDiaryStartedStreams ?? 0,
      ),
    )
    .toBe(0);

  const start = page.getByRole("button", { name: "Start recording" });
  await expect(start).toBeVisible();

  const box = await start.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);

  await start.click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "No pressure" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Record three second clip" })).toBeVisible();
});

test("videos route shows generated videos entry point", async ({ page }) => {
  await page.goto("/videos");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { exact: true, name: "Saved entries" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No diary entries yet" })).toBeVisible();
  const start = page.getByRole("link", { name: "Back to recording" });
  await expect(start).toBeVisible();

  const box = await start.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);

  await start.click();
  await expect(page).toHaveURL("/");
});

test("root route opens the recording screen", async ({ page }) => {
  await mockMediaCapture(page);
  await openRecord(page);
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { name: "No pressure" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Record three second clip" })).toBeVisible();
});

test("permission denial gives recovery copy and retry action", async ({ page }) => {
  await mockDeniedCamera(page);
  await openRecord(page);

  await expect(
    page
      .getByRole("main")
      .getByText("Camera access is blocked. Allow camera and microphone in browser settings, then retry."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry camera" })).toBeVisible();
});

test("mocked capture saves a three-second clip and enables draft review", async ({ page }) => {
  await mockMediaCapture(page);
  await openRecord(page);

  await expect(page.getByRole("heading", { name: "No pressure" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review draft clips" })).toHaveAttribute(
    "aria-disabled",
    "false",
  );
  await page.getByRole("button", { name: "Review draft clips" }).click();
  await expect(page).toHaveURL("/draft");
  await expect(page.getByRole("heading", { name: "No draft clips yet" })).toBeVisible();
  await page.getByRole("button", { name: "Back to recording" }).click();
  await expect(page).toHaveURL("/");

  await page.getByRole("button", { name: "Record three second clip" }).click();
  await expectClipRecorded(page, 1);

  await expect(page.getByRole("button", { name: "Review draft clips" })).toHaveAttribute(
    "aria-disabled",
    "false",
  );
  await expect(page.getByRole("button", { name: "Review draft clips" }).getByText("+1")).toBeVisible();
  await expect(page).toHaveURL("/");
});

test("record screen videos button navigates to videos", async ({ page }) => {
  await mockMediaCapture(page);
  await openRecord(page);

  await page.getByRole("link", { name: "Videos" }).click();
  await expect(page).toHaveURL("/videos");
  await expect(page.getByRole("heading", { exact: true, name: "Saved entries" })).toBeVisible();
});

test("draft review stops the camera before generation", async ({ page }) => {
  await mockMediaCapture(page, { generationDelayMs: 5_000 });
  await openRecord(page);

  await page.getByRole("button", { name: "Record three second clip" }).click();
  await expectClipRecorded(page, 1);

  await page.getByRole("button", { name: "Review draft clips" }).click();
  await expect(page).toHaveURL("/draft");
  await expect(page.getByRole("heading", { name: "Draft clips" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview clip 1" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Make video" })).toBeVisible();
  await expect(
    page
      .getByRole("heading", { name: /Preparing|Loading local editor|Collecting clips|Normalizing clips|Balancing audio|Encoding MP4|Saving result|Done/ }),
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
    .toBeGreaterThan(0);

  await page.getByRole("button", { name: "Make video" }).click();

  const generationHeading = page.getByRole("heading", {
    name: /Preparing|Loading local editor|Collecting clips|Normalizing clips|Balancing audio|Encoding MP4|Saving result|Done/,
  });
  await expect(generationHeading.first()).toBeVisible();
  await expect(generationHeading).toHaveCount(1);
  await expect(page.locator("header").getByText("Finish", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Draft clips" })).not.toBeVisible();
  await expect(page.getByRole("link", { name: "Back to camera" })).toHaveCount(0);
  await expect(page.locator("header").getByText(/^\d+ clips$/)).toHaveCount(0);
  await expect(page.getByText("Centering video, balancing audio, and encoding MP4")).toBeVisible();
  await expect(page.getByText("scale -> crop -> fps -> setsar -> format")).toBeVisible();
  await expect(page.getByText("movflags +faststart")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __idleDiaryFfmpegExecArgs?: string[] })
            .__idleDiaryFfmpegExecArgs ?? [],
      ),
    )
    .toEqual(
      expect.arrayContaining([
        "-fflags",
        "+genpts",
        "-vf",
        "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=30,setsar=1,format=yuv420p",
        "-af",
        "loudnorm=I=-16:TP=-1.5:LRA=11",
        "-movflags",
        "+faststart",
        "vlog.mp4",
      ]),
    );
  await expect(page).toHaveURL("/draft");
  await expect(page.getByRole("heading", { name: "No pressure" })).not.toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as typeof window & { __idleDiaryStoppedTracks?: number }).__idleDiaryStoppedTracks ?? 0))
    .toBeGreaterThan(0);
});

test("delete actions require confirmation and cancel preserves clips", async ({ page }) => {
  await mockMediaCapture(page);
  await openRecord(page);

  await page.getByRole("button", { name: "Record three second clip" }).click();
  await expectClipRecorded(page, 1);

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
  await openRecord(page);

  await page.getByRole("button", { name: "Record three second clip" }).click();
  await expectClipRecorded(page, 1);

  await page.getByRole("button", { name: "Review draft clips" }).click();
  await page.getByRole("button", { name: "Preview clip 1" }).click();
  await expect(page.getByLabel("Fullscreen clip preview")).toBeVisible();
  await expectControlNotTopHitTarget(page, page.getByLabel("Back to camera"), "Back to camera");
  await expect(page.getByRole("heading", { name: "Clip player" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Close preview" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Fullscreen clip preview")).not.toBeVisible();

  await page.getByRole("button", { name: "Preview clip 1" }).click();
  await expect(page.getByLabel("Fullscreen clip preview")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Clip player" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Close preview" })).toHaveCount(0);
  await page.goBack();
  await expect(page.getByLabel("Fullscreen clip preview")).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Draft clips" })).toBeVisible();
  await expect(page).toHaveURL(/\/draft$/);
});

test("generated video preview opens fullscreen and result screen does not scroll", async ({ page }) => {
  await mockMediaCapture(page);
  await openRecord(page);

  await page.getByRole("button", { name: "Record three second clip" }).click();
  await expectClipRecorded(page, 1);

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
  await expect(page.getByRole("button", { name: "Close generated video preview" })).toHaveCount(0);
  await expect(page.locator("header").getByText("Preview")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Fullscreen generated video preview")).not.toBeVisible();

  await page.getByRole("button", { name: "Open generated video fullscreen" }).click();
  await expect(page.getByLabel("Fullscreen generated video preview")).toBeVisible();
  await expect(page.getByRole("button", { name: "Close generated video preview" })).toHaveCount(0);
  await expect(page.locator("header").getByText("Preview")).toHaveCount(0);
  await page.goBack();
  await expect(page.getByLabel("Fullscreen generated video preview")).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Two Seconds Today" })).toBeVisible();
  await expect(page).toHaveURL(/\/result$/);
});

test("saved video detail opens from videos and returns to videos", async ({ page }) => {
  await generateOneVideo(page);

  await page.getByRole("button", { name: "Done" }).click();
  await expect(page).toHaveURL("/");
  await page.getByRole("link", { name: "Videos" }).click();
  await expect(page).toHaveURL("/videos");
  await page.getByRole("link", { name: "Open Two Seconds Today" }).click();
  await expect(page).toHaveURL(/\/videos\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "Two Seconds Today" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New recording" })).toHaveCount(0);

  await page.getByRole("link", { name: "Back to videos" }).click();
  await expect(page).toHaveURL("/videos");
  await expect(page.getByRole("heading", { exact: true, name: "Saved entries" })).toBeVisible();
});

test("saved video detail preview closes with escape and browser back", async ({ page }) => {
  await generateOneVideo(page);

  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("link", { name: "Videos" }).click();
  await page.getByRole("link", { name: "Open Two Seconds Today" }).click();
  await expect(page).toHaveURL(/\/videos\/[^/]+$/);

  await page.getByRole("button", { name: "Open saved video fullscreen" }).click();
  await expect(page.getByLabel("Fullscreen saved video preview")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Fullscreen saved video preview")).not.toBeVisible();
  await expect(page).toHaveURL(/\/videos\/[^/]+$/);

  await page.getByRole("button", { name: "Open saved video fullscreen" }).click();
  await expect(page.getByLabel("Fullscreen saved video preview")).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel("Fullscreen saved video preview")).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Two Seconds Today" })).toBeVisible();
  await expect(page).toHaveURL(/\/videos\/[^/]+$/);
});

test("missing saved video detail shows a not found state", async ({ page }) => {
  await page.goto("/videos/not-found-id");

  await expect(page.getByRole("heading", { name: "Video not found" })).toBeVisible();
  await page.getByRole("link", { name: "Back to saved videos" }).click();
  await expect(page).toHaveURL("/videos");
  await expect(page.getByRole("heading", { exact: true, name: "Saved entries" })).toBeVisible();
});

test("saved videos can be deleted from detail", async ({ page }) => {
  await generateOneVideo(page);

  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("link", { name: "Videos" }).click();
  await page.getByRole("link", { name: "Open Two Seconds Today" }).click();
  const deleteButton = page.getByRole("button", { exact: true, name: "Delete" });
  await expect(deleteButton).toBeVisible();
  await deleteButton.click();
  await expectMobileDrawer(page, "Delete this video?");
  await page
    .getByRole("dialog", { name: "Delete this video?" })
    .getByRole("button", { name: "Delete video" })
    .click();

  await expect(page).toHaveURL("/videos");
  await expect(page.getByRole("heading", { name: "No diary entries yet" })).toBeVisible();
});

test("deleting the final clip shows the draft empty state", async ({ page }) => {
  await mockMediaCapture(page);
  await openRecord(page);

  await page.getByRole("button", { name: "Record three second clip" }).click();
  await expectClipRecorded(page, 1);

  await page.getByRole("button", { name: "Review draft clips" }).click();
  await holdDragClipToDeleteZone(page, 1);
  await page.getByRole("button", { name: "Delete clip" }).click();
  await expect(page).toHaveURL("/draft");
  await expect(page.getByRole("heading", { name: "No draft clips yet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear draft" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Make video" })).toHaveCount(0);
});

test("clearing the draft shows the draft empty state", async ({ page }) => {
  await mockMediaCapture(page);
  await openRecord(page);

  await page.getByRole("button", { name: "Record three second clip" }).click();
  await expectClipRecorded(page, 1);

  await page.getByRole("button", { name: "Review draft clips" }).click();
  await page.getByRole("button", { name: "Clear draft" }).click();
  await page
    .getByRole("dialog", { name: "Clear this draft?" })
    .getByRole("button", { name: "Clear draft" })
    .click();
  await expect(page).toHaveURL("/draft");
  await expect(page.getByRole("heading", { name: "No draft clips yet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear draft" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Make video" })).toHaveCount(0);
});

test("done after generation returns home and clears the needs action badge", async ({ page }) => {
  await mockMediaCapture(page);
  await openRecord(page);

  await page.getByRole("button", { name: "Record three second clip" }).click();
  await expectClipRecorded(page, 1);

  await page.getByRole("button", { name: "Review draft clips" }).click();
  await page.getByRole("button", { name: "Make video" }).click();
  await expect(page.getByRole("heading", { name: "Two Seconds Today" })).toBeVisible({
    timeout: 8_000,
  });

  await page.getByRole("button", { name: "Done" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "No pressure" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review draft clips" })).toHaveAttribute(
    "aria-disabled",
    "false",
  );
  await expect(page.getByTestId("videos-needs-action-badge")).toHaveCount(0);

  await page.getByRole("link", { name: "Videos" }).click();
  await expect(page.getByRole("heading", { name: "Two Seconds Today" })).toBeVisible();
});

test("success page has no header close button", async ({ page }) => {
  await mockMediaCapture(page);
  await openRecord(page);

  await page.getByRole("button", { name: "Record three second clip" }).click();
  await expectClipRecorded(page, 1);

  await page.getByRole("button", { name: "Review draft clips" }).click();
  await page.getByRole("button", { name: "Make video" }).click();
  await expect(page.getByRole("heading", { name: "Two Seconds Today" })).toBeVisible({
    timeout: 8_000,
  });

  await expect(page.getByRole("button", { name: "Back to recording" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Export" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Done" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New recording" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "View saved videos" })).toHaveCount(0);
});

test("recording a clip opens review, reloads on review, and keeps a named button", async ({ page }) => {
  await recordOneClipAndOpenReview(page);

  await expect(page).toHaveURL("/draft");
  await expect(page.getByRole("heading", { name: "Draft clips" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview clip 1" })).toBeVisible();
  await expect(page).toHaveTitle("Review Draft Clips | IdleDiary");

  await page.reload();

  await expect(page).toHaveURL("/draft");
  await expect(page.getByRole("heading", { name: "Draft clips" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview clip 1" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to camera" })).toHaveCount(1);
  await expect(
    page.getByTestId("review-action-bar").getByRole("button", { name: "Back to camera" }),
  ).toHaveCount(0);
  await expect(
    page.getByTestId("review-action-bar").getByRole("link", { name: "Back to camera" }),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __idleDiaryStartedStreams?: number })
            .__idleDiaryStartedStreams ?? 0,
      ),
    )
    .toBe(0);
});

test("draft header back button returns to capture", async ({ page }) => {
  await recordOneClipAndOpenReview(page);

  await expect(page).toHaveURL("/draft");
  await expect(page.getByRole("heading", { name: "Draft clips" })).toBeVisible();

  await page.getByRole("link", { name: "Back to camera" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "No pressure" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Draft clips" })).not.toBeVisible();
});

test("draft URL without clips shows an empty draft state", async ({ page }) => {
  await mockMediaCapture(page);
  await page.goto("/draft");

  await expect(page).toHaveURL("/draft");
  await expect(page).toHaveTitle("Review Draft Clips | IdleDiary");
  await expect(page.getByRole("heading", { name: "No draft clips yet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear draft" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Make video" })).toHaveCount(0);

  await page.getByRole("button", { name: "Back to recording" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "No pressure" })).toBeVisible();
});

test("generated result reload returns home and leaves the saved video needing action", async ({ page }) => {
  await recordOneClipAndOpenReview(page);
  await page.getByRole("button", { name: "Make video" }).click();
  await expect(page.getByRole("heading", { name: "Two Seconds Today" })).toBeVisible({
    timeout: 8_000,
  });
  await expect(page).toHaveURL("/result");
  await expect(page).toHaveTitle("Generated Video | IdleDiary");

  await page.reload();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "No pressure" })).toBeVisible();
  await expect(page.getByTestId("videos-needs-action-badge")).toBeVisible();
  await page.getByRole("link", { name: "Videos" }).click();
  await expect(page).toHaveURL("/videos");
  await expect(page.getByRole("heading", { name: "Two Seconds Today" })).toBeVisible();
  await expect(page.getByText("Needs action")).toHaveCount(0);
});

test("export on result keeps the result open and clears the needs action badge", async ({ page }) => {
  await generateOneVideo(page);

  await page.getByRole("button", { name: "Export" }).click();

  await expect(page).toHaveURL("/result");
  await expect(page.getByRole("heading", { name: "Two Seconds Today" })).toBeVisible();

  await page.goto("/");
  await expect(page.getByTestId("videos-needs-action-badge")).toHaveCount(0);
  await page.getByRole("link", { name: "Videos" }).click();
  await expect(page.getByRole("heading", { name: "Two Seconds Today" })).toBeVisible();
});

test("opening a needs action saved video detail clears the videos button badge", async ({ page }) => {
  await generateOneVideo(page);
  await page.reload();
  await expect(page).toHaveURL("/");
  await expect(page.getByTestId("videos-needs-action-badge")).toBeVisible();

  await page.getByRole("link", { name: "Videos" }).click();
  await expect(page.getByText("Needs action")).toHaveCount(0);

  await page.getByRole("link", { name: "Open Two Seconds Today" }).click();
  await expect(page).toHaveURL(/\/videos\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "Two Seconds Today" })).toBeVisible();

  await page.getByRole("link", { name: "Back to videos" }).click();
  await expect(page).toHaveURL("/videos");
  await expect(page.getByText("Needs action")).toHaveCount(0);

  await page.goto("/");
  await expect(page.getByTestId("videos-needs-action-badge")).toHaveCount(0);
});

test("successful generation clears draft clips without starting a new recording", async ({ page }) => {
  await recordOneClipAndOpenReview(page);
  await page.getByRole("button", { name: "Make video" }).click();
  await expect(page.getByRole("heading", { name: "Two Seconds Today" })).toBeVisible({
    timeout: 8_000,
  });
  await expect(page).toHaveURL("/result");

  await page.goBack();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "No pressure" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review draft clips" })).toHaveAttribute(
    "aria-disabled",
    "false",
  );
  await expect(page.getByRole("button", { name: "Review draft clips" }).getByText("+1")).toHaveCount(0);
});

test("reloading during generation returns to review with clips preserved", async ({ page }) => {
  await mockMediaCapture(page, { generationDelayMs: 10_000 });
  await openRecord(page);
  await page.getByRole("button", { name: "Record three second clip" }).click();
  await expectClipRecorded(page, 1);
  await page.getByRole("button", { name: "Review draft clips" }).click();

  await page.getByRole("button", { name: "Make video" }).click();
  await expect(
    page
      .getByRole("heading", {
        name: /Preparing|Loading local editor|Collecting clips|Normalizing clips|Balancing audio|Encoding MP4|Saving result|Done/,
      })
      .first(),
  ).toBeVisible();
  await expect(page).toHaveURL("/draft");

  await page.reload();

  await expect(page).toHaveURL("/draft");
  await expect(page.getByRole("heading", { name: "Draft clips" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview clip 1" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Preparing|Loading local editor|Collecting clips|Normalizing clips|Balancing audio|Encoding MP4|Saving result|Done/ }),
  ).not.toBeVisible();
});

test("back and forward navigate between capture and review", async ({ page }) => {
  await recordOneClipAndOpenReview(page);

  await expect(page).toHaveURL("/draft");
  await page.goBack();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "No pressure" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review draft clips" })).toHaveAttribute(
    "aria-disabled",
    "false",
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __idleDiaryStartedStreams?: number })
            .__idleDiaryStartedStreams ?? 0,
      ),
    )
    .toBeGreaterThanOrEqual(2);

  await page.goForward();

  await expect(page).toHaveURL("/draft");
  await expect(page.getByRole("heading", { name: "Draft clips" })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __idleDiaryStoppedTracks?: number })
            .__idleDiaryStoppedTracks ?? 0,
      ),
    )
    .toBeGreaterThanOrEqual(2);
});

test("gallery reorders clips and generation receives UI order", async ({ page }) => {
  await mockMediaCapture(page);
  await openRecord(page);

  await page.getByRole("button", { name: "Record three second clip" }).click();
  await expectClipRecorded(page, 1);
  await page.getByRole("button", { name: "Record three second clip" }).click();
  await expectClipRecorded(page, 2);

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

  await page.getByRole("link", { name: "Back to camera" }).click();
  await page.getByRole("button", { name: "Review draft clips" }).click();
  await expect(rows.nth(0)).toHaveAttribute("data-clip-id", originalSecondId ?? "");

  await page.getByRole("button", { name: "Make video" }).click();
  await expect(
    page
      .getByRole("heading", {
        name: /Preparing|Loading local editor|Collecting clips|Normalizing clips|Balancing audio|Encoding MP4|Saving result|Done/,
      })
      .first(),
  ).toBeVisible();
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
  await openRecord(page);

  const controls = [
    page.getByRole("button", { name: "Record three second clip" }),
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
