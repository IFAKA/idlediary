import type { ClipRecord } from "@/features/clips/types";
import { reportError } from "@/features/errors/report-error";
import type { ClipMoodDescription } from "./types";
import {
  analyzeAndPersistClipMoodDescription,
  clipMoodDescriptionFromAnalysis,
  getCompletedClipMoodDescription,
} from "./clip-analysis";

const pendingDescriptions = new Map<string, Promise<ClipMoodDescription>>();
let queueTail: Promise<void> = Promise.resolve();

export function resetClipAnalysisQueueForTests() {
  pendingDescriptions.clear();
  queueTail = Promise.resolve();
}

export function getPendingClipMoodDescription(clipId: string) {
  return pendingDescriptions.get(clipId) ?? null;
}

export function enqueueClipMoodAnalysis(clip: ClipRecord) {
  const cached = clipMoodDescriptionFromAnalysis(clip) ?? getCompletedClipMoodDescription(clip.id);
  if (cached) return Promise.resolve(cached);

  const pending = pendingDescriptions.get(clip.id);
  if (pending) return pending;

  const task = queueTail
    .catch(() => undefined)
    .then(() => analyzeAndPersistClipMoodDescription(clip));

  pendingDescriptions.set(clip.id, task);
  queueTail = task.then(
    () => undefined,
    () => undefined,
  );

  task.catch((error) => reportError(error)).finally(() => {
    if (pendingDescriptions.get(clip.id) === task) {
      pendingDescriptions.delete(clip.id);
    }
  });

  return task;
}

export function getQueuedClipMoodDescriptions(clips: ClipRecord[]) {
  return Promise.all(clips.map((clip) => enqueueClipMoodAnalysis(clip)));
}
