import { createWriteStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import { chromium } from "@playwright/test";

const root = process.cwd();
const distDir = resolve(root, "dist/launch-video");
const cacheDir = resolve(distDir, "cache/source");
const takesDir = resolve(distDir, "takes");
const publicClipsDir = resolve(root, "public/demo-clips");
const manifestPath = resolve(root, "scripts/launch-video/stock-sources.json");
const finalPath = resolve(distDir, "idlediary-launch-4x5.mp4");
const finalDraftSourceIds = ["coffee", "sunset", "laptop", "gym"];
const coffeePreviewDurationMs = 6500;

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
      ...options,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
      if (options.echo) process.stdout.write(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
      if (options.echo) process.stderr.write(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with ${code}\n${stderr || stdout}`));
    });
  });
}

async function commandExists(command) {
  try {
    await run(command, ["-version"]);
  } catch {
    throw new Error(`${command} is required for npm run launch-video`);
  }
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function download(url, target) {
  if (await pathExists(target)) return;

  await mkdir(dirname(target), { recursive: true });
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed for ${url}: ${response.status}`);
  }

  const file = createWriteStream(target);
  for await (const chunk of response.body) {
    file.write(chunk);
  }
  file.end();
  await once(file, "finish");
}

async function probe(path) {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "stream=index,codec_type,width,height:format=duration",
    "-of",
    "json",
    path,
  ]);
  return JSON.parse(stdout);
}

function videoStream(probeResult, path) {
  const stream = probeResult.streams.find((candidate) => candidate.codec_type === "video");
  if (!stream) throw new Error(`No video stream found in ${path}`);
  return stream;
}

function hasAudio(probeResult) {
  return probeResult.streams.some((stream) => stream.codec_type === "audio");
}

async function normalizeClip(source, sourcePath, outputPath) {
  const sourceProbe = await probe(sourcePath);
  const video = videoStream(sourceProbe, sourcePath);
  if (video.width !== source.expectedWidth || video.height !== source.expectedHeight) {
    throw new Error(
      `${source.id} expected ${source.expectedWidth}x${source.expectedHeight}, got ${video.width}x${video.height}`,
    );
  }
  if (video.width >= video.height) {
    throw new Error(`${source.id} is not portrait`);
  }

  await mkdir(dirname(outputPath), { recursive: true });
  const startSeconds = String(source.startMs / 1000);
  const durationSeconds = String(source.durationMs / 1000);
  const commonVideo = [
    "-vf",
    "scale=1080:1920,fps=30,format=yuv420p",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    "-y",
    outputPath,
  ];

  if (hasAudio(sourceProbe)) {
    await run("ffmpeg", [
      "-ss",
      startSeconds,
      "-i",
      sourcePath,
      "-t",
      durationSeconds,
      "-af",
      "loudnorm=I=-20:LRA=11:TP=-2",
      ...commonVideo,
    ]);
  } else {
    await run("ffmpeg", [
      "-ss",
      startSeconds,
      "-i",
      sourcePath,
      "-f",
      "lavfi",
      "-t",
      durationSeconds,
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=48000",
      "-t",
      durationSeconds,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      ...commonVideo,
    ]);
  }

  const normalizedProbe = await probe(outputPath);
  const normalizedVideo = videoStream(normalizedProbe, outputPath);
  const duration = Number(normalizedProbe.format.duration);
  if (normalizedVideo.width !== 1080 || normalizedVideo.height !== 1920) {
    throw new Error(`${source.id} normalized to ${normalizedVideo.width}x${normalizedVideo.height}, expected 1080x1920`);
  }
  if (duration < 2.95) {
    throw new Error(`${source.id} normalized clip is shorter than 3s`);
  }
}

async function buildResultVideo(sources) {
  const listPath = resolve(distDir, "result-inputs.txt");
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const finalSources = finalDraftSourceIds.map((id) => {
    const source = sourceById.get(id);
    if (!source) throw new Error(`Missing final draft source: ${id}`);
    return source;
  });
  const lines = finalSources.map((source) => `file '${resolve(publicClipsDir, `${source.id}.mp4`).replaceAll("'", "'\\''")}'`);
  await writeFile(listPath, `${lines.join("\n")}\n`);
  await run("ffmpeg", [
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    "-y",
    resolve(publicClipsDir, "result.mp4"),
  ]);
}

async function waitForServer(url) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 45_000) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Wait for Next.js to boot.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error(`Server did not start at ${url}`);
}

async function getPort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  server.close();
  await once(server, "close");
  return typeof address === "object" && address ? address.port : 3000;
}

async function withServer(callback) {
  const port = await getPort();
  const baseURL = `http://127.0.0.1:${port}`;
  const child = spawn("npm", ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  try {
    await waitForServer(`${baseURL}/demo/launch?scene=intro`);
    return await callback(baseURL);
  } finally {
    child.kill("SIGTERM");
  }
}

async function tapLocator(page, locator, options = {}) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Tap target is not visible");
  const point = {
    x: box.x + box.width * (options.xRatio ?? 0.5),
    y: box.y + box.height * (options.yRatio ?? 0.5),
  };
  await page.evaluate(({ x, y }) => window.__idleDiaryDemoTap?.(x, y), point);
  await page.waitForTimeout(options.beforeClickMs ?? 140);
  await locator.click({ force: true });
  await page.waitForTimeout(options.afterClickMs ?? 620);
}

async function dragLocatorToLocator(page, source, target, {
  ripple = false,
  holdMs = 260,
  midSteps = 8,
  endSteps = 8,
  releaseWaitMs = 120,
} = {}) {
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
  if (ripple) {
    await page.evaluate(({ x, y }) => window.__idleDiaryDemoTap?.(x, y), start);
    await page.waitForTimeout(160);
  }
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.waitForTimeout(holdMs);
  await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2, { steps: midSteps });
  await page.mouse.move(end.x, end.y, { steps: endSteps });
  await page.waitForTimeout(releaseWaitMs);
  await page.mouse.up();
}

async function recordOneTake(baseURL) {
  const browser = await chromium.launch();
  let takePath;
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      recordVideo: { dir: takesDir, size: { width: 390, height: 844 } },
    });
    const page = await context.newPage();
    await page.goto(`${baseURL}/demo/launch?scene=intro`, { waitUntil: "networkidle" });

    const logoButton = page.getByRole("button", { name: "Nudge app icon" });
    await logoButton.waitFor({ state: "visible", timeout: 10_000 });
    await page.waitForTimeout(1850);
    await tapLocator(page, logoButton, { xRatio: 0.74, yRatio: 0.28 });

    const startButton = page.getByRole("button", { name: "Start recording" });
    await startButton.waitFor({ state: "visible", timeout: 10_000 });
    await tapLocator(page, startButton, { afterClickMs: 360 });

    const recordButton = page.getByRole("button", { name: "Record three second clip" });
    await recordButton.waitFor({ state: "visible", timeout: 10_000 });
    await page.waitForTimeout(320);
    await tapLocator(page, recordButton);
    await page.getByRole("button", { name: "Review draft clips" }).getByText("+5").waitFor({
      state: "visible",
      timeout: 10_000,
    });
    await page.waitForTimeout(450);

    const draftButton = page.getByRole("button", { name: "Review draft clips" });
    await tapLocator(page, draftButton);
    await expectClipButtons(page, 5);

    await dragLocatorToLocator(
      page,
      page.locator("[data-clip-id] button").nth(1),
      page.locator("[data-clip-id] button").nth(3),
      { ripple: true },
    );
    await page.waitForTimeout(650);

    await dragLocatorToLocator(
      page,
      page.locator("[data-clip-id] button").nth(1),
      page.getByTestId("review-action-bar"),
      { ripple: true, holdMs: 320, midSteps: 14, endSteps: 16, releaseWaitMs: 140 },
    );
    const deleteClip = page.getByRole("button", { name: "Delete clip" });
    await deleteClip.waitFor({ state: "visible", timeout: 5_000 });
    await page.waitForTimeout(700);
    await tapLocator(page, deleteClip);
    await expectClipButtons(page, 4);

    const firstClip = page.getByRole("button", { name: "Preview clip 1" });
    await tapLocator(page, firstClip);
    const close = page.getByRole("button", { name: "Close fullscreen preview" });
    await close.waitFor({ state: "visible", timeout: 5_000 });
    await page.waitForTimeout(900);
    await tapLocator(page, close);

    const makeVideo = page.getByRole("button", { name: "Make video" });
    await makeVideo.waitFor({ state: "visible", timeout: 10_000 });
    await tapLocator(page, makeVideo);
    await page
      .getByRole("button", { name: "Open generated video fullscreen" })
      .waitFor({ state: "visible", timeout: 12_000 });
    await page.waitForTimeout(5700);

    const done = page.getByRole("button", { name: "Done" });
    await tapLocator(page, done);
    const videos = page.getByRole("link", { name: "Videos" });
    await videos.waitFor({ state: "visible", timeout: 10_000 });
    await tapLocator(page, videos, { beforeClickMs: 360 });
    await page.getByRole("heading", { name: "4 Tiny Moments" }).waitFor({
      state: "visible",
      timeout: 10_000,
    });
    await page.waitForTimeout(1700);

    const video = page.video();
    await context.close();
    if (!video) throw new Error("No recorded video for one-shot launch take");
    const sourceTakePath = await video.path();
    takePath = resolve(takesDir, "one-shot.mp4");
    await run("ffmpeg", [
      "-i",
      sourceTakePath,
      "-vf",
      "scale=390:844,fps=30,format=yuv420p",
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      "-movflags",
      "+faststart",
      "-y",
      takePath,
    ]);
  } finally {
    await browser.close();
  }
  if (!takePath) throw new Error("One-shot take was not recorded");
  return takePath;
}

async function expectClipButtons(page, count) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const actual = await page.getByRole("button", { name: /^Preview clip / }).count();
    if (actual === count) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`Expected ${count} draft clip buttons`);
}

async function buildAudioBed() {
  const audioPath = resolve(distDir, "timeline-audio.m4a");
  await run("ffmpeg", [
    "-f",
    "lavfi",
    "-t",
    "4",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-i",
    resolve(publicClipsDir, "coffee.mp4"),
    "-f",
    "lavfi",
    "-t",
    "7",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-f",
    "lavfi",
    "-t",
    "3",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-f",
    "lavfi",
    "-t",
    "4",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-stream_loop",
    "2",
    "-t",
    "32",
    "-i",
    resolve(publicClipsDir, "result.mp4"),
    "-filter_complex",
    "[0:a][1:a][2:a][3:a][4:a][5:a]concat=n=6:v=0:a=1[a]",
    "-map",
    "[a]",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-y",
    audioPath,
  ]);
  return audioPath;
}

async function composeFinal(timelinePath, audioPath) {
  await run("ffmpeg", [
    "-i",
    timelinePath,
    "-i",
    audioPath,
    "-filter_complex",
    "[0:v]scale=1080:1350:force_original_aspect_ratio=increase,crop=1080:1350,boxblur=28:1,eq=brightness=-0.24:saturation=0.86[bg];[0:v]scale=560:1212:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]",
    "-map",
    "[v]",
    "-map",
    "1:a:0",
    "-r",
    "30",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "18",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    "-shortest",
    "-y",
    finalPath,
  ]);
}

async function validateFinal() {
  const finalProbe = await probe(finalPath);
  const video = videoStream(finalProbe, finalPath);
  const duration = Number(finalProbe.format.duration);
  if (video.width !== 1080 || video.height !== 1350) {
    throw new Error(`Final video is ${video.width}x${video.height}, expected 1080x1350`);
  }
  if (duration < 28 || duration > 40) {
    throw new Error(`Final video duration is ${duration.toFixed(2)}s, expected 28-40s`);
  }
}

await commandExists("ffmpeg");
await commandExists("ffprobe");
await mkdir(cacheDir, { recursive: true });
await mkdir(takesDir, { recursive: true });
await mkdir(publicClipsDir, { recursive: true });

const sources = JSON.parse(await readFile(manifestPath, "utf8"));
for (const source of sources) {
  const sourcePath = resolve(cacheDir, `${source.id}-${basename(new URL(source.downloadUrl).pathname)}`);
  const outputPath = resolve(publicClipsDir, `${source.id}.mp4`);
  console.log(`Preparing ${source.id}`);
  await download(source.downloadUrl, sourcePath);
  await normalizeClip(source, sourcePath, outputPath);

  if (source.id === "coffee") {
    await normalizeClip(
      { ...source, durationMs: coffeePreviewDurationMs },
      sourcePath,
      resolve(publicClipsDir, "coffee-preview.mp4"),
    );
  }
}

await buildResultVideo(sources);
await writeFile(
  resolve(publicClipsDir, "manifest.json"),
  `${JSON.stringify(
    sources.map((source) => ({
      id: source.id,
      label: source.label,
      src: `/demo-clips/${source.id}.mp4`,
      pageUrl: source.pageUrl,
      license: source.license,
      durationMs: source.durationMs,
      width: 1080,
      height: 1920,
      mimeType: "video/mp4",
    })),
    null,
    2,
  )}\n`,
);

const timelinePath = await withServer(recordOneTake);
const audioPath = await buildAudioBed();
await composeFinal(timelinePath, audioPath);
await validateFinal();

console.log(finalPath);
