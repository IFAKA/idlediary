import type { ClipAnalysisRecord, ClipRecord } from "@/features/clips/types";
import { saveClipAnalysis } from "@/features/clips/storage";
import { addDebugEvent } from "@/features/errors/debug-store";
import type { ClipMoodDescription } from "./types";
import { analyzeClipMoodDescriptions } from "./analyze";
import { extractClipKeyframes } from "./keyframes";

export const clipAnalysisVersion = "mobilevit-small-q8-v1";

const completedDescriptions = new Map<string, ClipMoodDescription>();

export function resetClipAnalysisCacheForTests() {
  completedDescriptions.clear();
}

export function clipMoodDescriptionFromAnalysis(
  clip: Pick<ClipRecord, "id" | "analysis">,
): ClipMoodDescription | null {
  if (!clip.analysis || clip.analysis.version !== clipAnalysisVersion) return null;

  return {
    clipId: clip.id,
    description: clip.analysis.description,
    tags: clip.analysis.tags,
    mood: clip.analysis.mood,
    energy: clip.analysis.energy,
    brightness: clip.analysis.brightness,
  };
}

export function getCompletedClipMoodDescription(clipId: string) {
  return completedDescriptions.get(clipId) ?? null;
}

export function analysisFromDescription(description: ClipMoodDescription): ClipAnalysisRecord {
  return {
    version: clipAnalysisVersion,
    description: description.description,
    tags: description.tags,
    mood: description.mood,
    energy: description.energy,
    brightness: description.brightness,
    analyzedAt: new Date().toISOString(),
  };
}

export async function analyzeAndPersistClipMoodDescription(clip: ClipRecord) {
  const cached = clipMoodDescriptionFromAnalysis(clip);
  if (cached) {
    completedDescriptions.set(clip.id, cached);
    return cached;
  }

  const keyframes = await extractClipKeyframes([clip]);
  const [description] = await analyzeClipMoodDescriptions(keyframes);
  if (!description) {
    throw new Error(`No clip analysis generated for ${clip.id}`);
  }

  completedDescriptions.set(clip.id, description);
  await saveClipAnalysis(clip.id, analysisFromDescription(description));
  addDebugEvent("clip-analysis-completed", "generation", {
    clipId: clip.id,
    analysisVersion: clipAnalysisVersion,
    tags: description.tags,
  });
  return description;
}

export async function getClipMoodDescriptions(clips: ClipRecord[]) {
  return Promise.all(
    clips.map(async (clip) => {
      const cached = clipMoodDescriptionFromAnalysis(clip);
      if (cached) return cached;

      const completed = getCompletedClipMoodDescription(clip.id);
      if (completed) return completed;

      return analyzeAndPersistClipMoodDescription(clip);
    }),
  );
}
