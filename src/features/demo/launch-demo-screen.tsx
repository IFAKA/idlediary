"use client";

import { useEffect, useMemo, useState } from "react";
import { AppViewportShell } from "@/components/app-viewport-shell";
import { CaptureScreen } from "@/features/capture/capture-screen";
import {
  clearClipsForSession,
  clearGeneratedVlogForSession,
  getOrCreateSession,
  saveClip,
  saveVlog,
} from "@/features/clips/storage";
import type { ClipRecord, VlogRecord } from "@/features/clips/types";
import { FirstLaunchIntro } from "@/features/home/first-launch-intro";
import { DemoTapOverlay } from "./demo-tap-overlay";

type LaunchScene = "intro" | "record" | "draft" | "generate" | "result";

type DemoClipManifestItem = {
  id: string;
  label: string;
  src: string;
  durationMs: number;
  width: number;
  height: number;
  mimeType: string;
};

const demoSessionId = "launch-demo-session";
const demoVlogId = "launch-demo-vlog";

function normalizeScene(scene: string | undefined): LaunchScene {
  if (
    scene === "intro" ||
    scene === "record" ||
    scene === "draft" ||
    scene === "generate" ||
    scene === "result"
  ) {
    return scene;
  }

  return "intro";
}

async function loadManifest() {
  const response = await fetch("/demo-clips/manifest.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Demo clip manifest is missing. Run npm run launch-video first.");
  }

  return (await response.json()) as DemoClipManifestItem[];
}

async function blobFromPublicPath(path: string) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Demo asset could not be loaded: ${path}`);
  }

  return response.blob();
}

async function makeDemoClip(item: DemoClipManifestItem, order: number): Promise<ClipRecord> {
  const blob = await blobFromPublicPath(item.src);
  return {
    id: `launch-demo-${item.id}`,
    sessionId: demoSessionId,
    blob,
    mimeType: item.mimeType || blob.type || "video/mp4",
    durationMs: item.durationMs,
    order,
    createdAt: new Date(Date.UTC(2026, 0, 1, 9, order, 0)).toISOString(),
    size: blob.size,
  };
}

async function makeDemoVlog(clipCount: number): Promise<VlogRecord> {
  const blob = await blobFromPublicPath("/demo-clips/result.mp4");
  return {
    id: demoVlogId,
    sessionId: demoSessionId,
    blob,
    mimeType: "video/mp4",
    clipCount,
    title: "5 Tiny Moments",
    caption: "A quiet 15-second diary from today.",
    createdAt: new Date(Date.UTC(2026, 0, 1, 10, 0, 0)).toISOString(),
    needsAction: false,
    size: blob.size,
    generationFingerprint: "launch-demo-result",
  };
}

async function resetDemoStorage() {
  await getOrCreateSession(demoSessionId);
  await clearClipsForSession(demoSessionId);
  await clearGeneratedVlogForSession(demoSessionId);
}

async function seedDemoClips() {
  const manifest = await loadManifest();
  const clips = await Promise.all(manifest.map((item, index) => makeDemoClip(item, index)));
  for (const clip of clips) {
    await saveClip(clip);
  }

  return clips;
}

export function LaunchDemoScreen({ scene: rawScene }: { scene?: string }) {
  const scene = normalizeScene(rawScene);
  const [ready, setReady] = useState(scene === "intro");
  const [introStarted, setIntroStarted] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function prepare() {
      setReady(scene === "intro");
      await resetDemoStorage();
      if (scene === "intro") {
        if (!cancelled) setReady(true);
        return;
      }

      if (scene === "draft" || scene === "generate" || scene === "result") {
        const seededClips = await seedDemoClips();
        if (scene === "result") {
          await saveVlog(await makeDemoVlog(seededClips.length));
        }
      }
      if (!cancelled) setReady(true);
    }

    void prepare().catch((error) => {
      console.error(error);
    });

    return () => {
      cancelled = true;
    };
  }, [scene]);

  const demoConfig = useMemo(
    () => ({
      captureClipSrc: "/demo-clips/coffee.mp4",
      previewSrc: "/demo-clips/coffee.mp4",
      resultSrc: "/demo-clips/result.mp4",
      scene: scene === "intro" ? "record" : scene,
      sessionId: demoSessionId,
    }),
    [scene],
  );

  if (scene === "intro" && !introStarted) {
    return (
      <>
        <AppViewportShell>
          <FirstLaunchIntro onStart={() => setIntroStarted(true)} />
        </AppViewportShell>
        <DemoTapOverlay />
      </>
    );
  }

  if (!ready) {
    return (
      <AppViewportShell>
        <div className="grid h-[100svh] place-items-center text-sm font-semibold text-muted-foreground">
          Loading demo
        </div>
      </AppViewportShell>
    );
  }

  return (
    <>
      <CaptureScreen demo={demoConfig} />
      <DemoTapOverlay />
    </>
  );
}
