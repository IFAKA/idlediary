"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { AppViewportShell } from "@/components/app-viewport-shell";
import { useAppHeader } from "@/components/app-header-shell";
import { ClipReviewPanel } from "@/features/capture/clip-review-panel";
import { GenerationPanel } from "@/features/capture/generation-panel";
import { RecordButton } from "@/features/capture/record-button";
import { ResultPanel } from "@/features/capture/result-panel";
import {
  generationProgress,
  type GenerationProgress,
} from "@/features/generation/generation";
import {
  clearClipsForSession,
  clearGeneratedVlogForSession,
  listClips,
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
const defaultScene: LaunchScene = "intro";
const progressSteps: GenerationProgress[] = [
  generationProgress("loading", 12),
  generationProgress("writing", 28),
  generationProgress("rendering", 52),
  generationProgress("rendering", 82, { label: "Making playback ready" }),
  generationProgress("saving", 94),
  generationProgress("done", 100),
];

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

  return defaultScene;
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

async function clearDemoStorage() {
  await clearClipsForSession(demoSessionId);
  await clearGeneratedVlogForSession(demoSessionId);
}

async function seedDemoClips(limit?: number) {
  const manifest = await loadManifest();
  const selected = manifest.slice(0, limit ?? manifest.length);
  const clips = await Promise.all(selected.map((item, index) => makeDemoClip(item, index)));
  for (const clip of clips) {
    await saveClip(clip);
  }

  return clips;
}

export function LaunchDemoScreen({ scene: rawScene }: { scene?: string }) {
  const scene = normalizeScene(rawScene);
  const [clips, setClips] = useState<ClipRecord[]>([]);
  const [vlog, setVlog] = useState<VlogRecord | null>(null);
  const [recordState, setRecordState] = useState<"idle" | "recording" | "saving" | "success">("idle");
  const [recordProgress, setRecordProgress] = useState(0);
  const [isGenerating, setIsGenerating] = useState(scene === "result");
  const [progress, setProgress] = useState<GenerationProgress>(generationProgress("idle", 0));
  const recordTimerRef = useRef<number | null>(null);

  useAppHeader(
    useMemo(() => {
      if (scene === "intro") {
        return { eyebrow: "Today", title: "IdleDiary" };
      }
      if (scene === "record") {
        return { eyebrow: "Today", title: "No pressure" };
      }
      if (scene === "draft" || (scene === "generate" && !isGenerating)) {
        return { eyebrow: "Review", title: "Draft clips" };
      }
      if (scene === "generate") {
        return { eyebrow: "Finish", title: "Making video" };
      }
      return { eyebrow: "Ready", title: "5 Tiny Moments" };
    }, [isGenerating, scene]),
  );

  useEffect(() => {
    let cancelled = false;

    async function prepare() {
      setVlog(null);
      setClips([]);
      setProgress(generationProgress("idle", 0));
      setRecordState("idle");
      setRecordProgress(0);
      setIsGenerating(scene === "result");
      await clearDemoStorage();

      if (scene === "draft" || scene === "generate" || scene === "result") {
        const seededClips = await seedDemoClips();
        if (!cancelled) setClips(seededClips);

        if (scene === "result") {
          const seededVlog = await makeDemoVlog(seededClips.length);
          await saveVlog(seededVlog);
          if (!cancelled) {
            setVlog(seededVlog);
            setIsGenerating(false);
          }
        }
      }
    }

    void prepare().catch((error) => {
      console.error(error);
    });

    return () => {
      cancelled = true;
      if (recordTimerRef.current !== null) {
        window.clearInterval(recordTimerRef.current);
      }
    };
  }, [scene]);

  const seedRecordedCoffee = useCallback(async () => {
    const [clip] = await seedDemoClips(1);
    setClips(await listClips(demoSessionId));
    return clip;
  }, []);

  const record = useCallback(() => {
    if (recordState === "recording") return;

    setRecordState("recording");
    setRecordProgress(0);
    const startedAt = performance.now();
    recordTimerRef.current = window.setInterval(() => {
      const elapsed = performance.now() - startedAt;
      setRecordProgress(Math.min(100, Math.round((elapsed / 3000) * 100)));
    }, 80);

    window.setTimeout(() => {
      if (recordTimerRef.current !== null) {
        window.clearInterval(recordTimerRef.current);
      }
      setRecordState("saving");
      setRecordProgress(100);
      void seedRecordedCoffee().then(() => {
        setRecordState("success");
        window.setTimeout(() => setRecordState("idle"), 620);
      });
    }, 3000);
  }, [recordState, seedRecordedCoffee]);

  const startGeneration = useCallback(() => {
    setIsGenerating(true);
    progressSteps.forEach((step, index) => {
      window.setTimeout(() => setProgress(step), index * 760);
    });
  }, []);

  const resultPanel = vlog ? (
    <ResultPanel vlog={vlog} onDone={() => undefined} onExport={() => undefined} />
  ) : (
    <GenerationPanel progress={generationProgress("loading", 8)} />
  );

  return (
    <AppViewportShell>
      {scene === "intro" ? (
        <FirstLaunchIntro onStart={() => undefined} />
      ) : scene === "record" ? (
        <DemoRecordScene
          clips={clips}
          progress={recordProgress}
          state={recordState}
          onRecord={record}
        />
      ) : scene === "result" ? (
        resultPanel
      ) : scene === "generate" && isGenerating ? (
        <GenerationPanel progress={progress} />
      ) : (
        <ClipReviewPanel
          clips={clips}
          isFinishing={false}
          onBack={() => undefined}
          onClearDraft={async () => true}
          onDeleteClip={async () => true}
          onMakeVideo={startGeneration}
          onReorderClips={async () => true}
        />
      )}
      <DemoTapOverlay />
    </AppViewportShell>
  );
}

function DemoRecordScene({
  clips,
  progress,
  state,
  onRecord,
}: {
  clips: ClipRecord[];
  progress: number;
  state: "idle" | "recording" | "saving" | "success";
  onRecord: () => void;
}) {
  return (
    <div className="relative z-10 flex h-[100svh] flex-col overflow-hidden top-level-screen">
      <video
        aria-label="Demo camera preview"
        autoPlay
        className="absolute inset-0 h-full w-full object-cover"
        data-testid="demo-camera-preview"
        loop
        muted
        playsInline
        src="/demo-clips/coffee.mp4"
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.45),transparent_28%,transparent_58%,rgba(0,0,0,0.74))]" />
      <div className="relative z-10 mt-auto">
        <div className="mb-5 flex items-center justify-center gap-10">
          <div
            aria-hidden="true"
            className="size-14 rounded-lg border border-white/20 bg-black/40"
          />
          <RecordButton
            progress={progress}
            state={state}
            onClick={onRecord}
          />
          <div className="grid size-14 place-items-center rounded-lg border border-white/30 bg-black/52 text-lg font-bold">
            {clips.length > 0 ? "+1" : ""}
          </div>
        </div>
      </div>
      {state === "recording" ? (
        <motion.div
          aria-hidden="true"
          className="absolute left-1/2 top-[19%] z-20 -translate-x-1/2 rounded-full border border-red-300/50 bg-red-500/22 px-3 py-1 text-xs font-semibold text-white shadow-lg"
          animate={{ opacity: [0.74, 1, 0.74] }}
          transition={{ duration: 0.9, repeat: Infinity }}
        >
          REC
        </motion.div>
      ) : null}
    </div>
  );
}
