"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { reportError } from "@/features/errors/report-error";
import { analysisFromDescription } from "@/features/music/clip-analysis";
import { enqueueClipMoodAnalysis } from "@/features/music/clip-analysis-queue";
import {
  clearClipsForSession,
  deleteClip,
  getOrCreateSession,
  getOrCreateTodaySession,
  listClips,
  saveClip,
  saveClipThumbnail,
  saveClipOrder,
} from "./storage";
import { generateVideoThumbnail, thumbnailSizes } from "./thumbnail";
import {
  releaseAllClipObjectUrls,
  releaseClipObjectUrl,
  retainClipObjectUrls,
} from "./media-cache";
import type { ClipRecord, SessionSummary } from "./types";

type ClipState = {
  session: SessionSummary | null;
  clips: ClipRecord[];
  loading: boolean;
};

type ClipAction =
  | { type: "loaded"; session: SessionSummary; clips: ClipRecord[] }
  | { type: "session"; session: SessionSummary }
  | { type: "add"; clip: ClipRecord }
  | { type: "update"; clip: ClipRecord }
  | { type: "remove"; id: string }
  | { type: "reorder"; clipIds: string[] }
  | { type: "clear" }
  | { type: "loading-finished" };

const initialState: ClipState = {
  session: null,
  clips: [],
  loading: true,
};

function scheduleIdleTask(task: () => void) {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    window.requestIdleCallback(task, { timeout: 1000 });
    return;
  }

  setTimeout(task, 150);
}

function clipReducer(state: ClipState, action: ClipAction): ClipState {
  if (action.type === "loaded") {
    return {
      session: action.session,
      clips: action.clips,
      loading: false,
    };
  }

  if (action.type === "session") {
    return {
      ...state,
      session: action.session,
    };
  }

  if (action.type === "add") {
    return {
      ...state,
      clips: [...state.clips, action.clip],
    };
  }

  if (action.type === "update") {
    return {
      ...state,
      clips: state.clips.map((clip) => (clip.id === action.clip.id ? action.clip : clip)),
    };
  }

  if (action.type === "remove") {
    return {
      ...state,
      clips: state.clips.filter((clip) => clip.id !== action.id),
    };
  }

  if (action.type === "reorder") {
    const clipsById = new Map(state.clips.map((clip) => [clip.id, clip]));
    const ordered = action.clipIds.reduce<ClipRecord[]>((nextClips, id, index) => {
      const clip = clipsById.get(id);
      if (clip) nextClips.push({ ...clip, order: index });
      return nextClips;
    }, []);
    const knownIds = new Set(ordered.map((clip) => clip.id));
    const remaining = state.clips.filter((clip) => !knownIds.has(clip.id));

    return {
      ...state,
      clips: [...ordered, ...remaining],
    };
  }

  if (action.type === "clear") {
    return {
      ...state,
      clips: [],
    };
  }

  if (action.type === "loading-finished") {
    return {
      ...state,
      loading: false,
    };
  }

  return state;
}

export function useClips({ sessionId }: { sessionId?: string } = {}) {
  const [state, dispatch] = useReducer(clipReducer, initialState);
  const stateRef = useRef(state);
  const requestVersionRef = useRef(0);
  const thumbnailBackfillsRef = useRef(new Set<string>());

  useEffect(() => {
    stateRef.current = state;
    retainClipObjectUrls(state.clips.map((clip) => clip.id));
  }, [state]);

  useEffect(() => {
    for (const clip of state.clips) {
      if (clip.thumbnailBlob || thumbnailBackfillsRef.current.has(clip.id)) continue;

      thumbnailBackfillsRef.current.add(clip.id);
      void generateVideoThumbnail(clip.blob, thumbnailSizes.clip)
        .then((thumbnail) => saveClipThumbnail(clip.id, thumbnail))
        .then((updatedClip) => {
          if (!updatedClip) return;
          dispatch({ type: "update", clip: updatedClip });
        })
        .catch((error) => reportError(error))
        .finally(() => {
          thumbnailBackfillsRef.current.delete(clip.id);
        });
    }
  }, [state.clips]);

  const refresh = useCallback(async (targetSessionId = sessionId) => {
    const requestVersion = ++requestVersionRef.current;
    const activeSession = targetSessionId
      ? stateRef.current.session?.id === targetSessionId
        ? stateRef.current.session
        : await getOrCreateSession(targetSessionId)
      : await getOrCreateTodaySession();
    const loaded = await listClips(activeSession.id);

    if (requestVersion !== requestVersionRef.current) return;
    const currentSessionId = stateRef.current.session?.id;
    if (currentSessionId && currentSessionId !== activeSession.id) return;

    dispatch({ type: "loaded", session: activeSession, clips: loaded });
  }, [sessionId]);

  useEffect(() => {
    let mounted = true;
    const requestVersion = ++requestVersionRef.current;

    const createSession = sessionId
      ? getOrCreateSession(sessionId)
      : getOrCreateTodaySession();

    createSession
      .then(async (created) => {
        const loaded = await listClips(created.id);
        if (!mounted || requestVersion !== requestVersionRef.current) return;
        dispatch({ type: "loaded", session: created, clips: loaded });
      })
      .catch((error) => reportError(error))
      .finally(() => {
        if (mounted && requestVersion === requestVersionRef.current) {
          dispatch({ type: "loading-finished" });
        }
      });

    return () => {
      mounted = false;
    };
  }, [sessionId]);

  const addClip = useCallback(async (blob: Blob, durationMs: number) => {
    const activeSession =
      stateRef.current.session ??
      (sessionId ? await getOrCreateSession(sessionId) : await getOrCreateTodaySession());
    dispatch({ type: "session", session: activeSession });
    const currentClips = stateRef.current.clips;
    const clip: ClipRecord = {
      id: crypto.randomUUID(),
      sessionId: activeSession.id,
      blob,
      mimeType: blob.type || "video/webm",
      durationMs,
      order: currentClips.length,
      createdAt: new Date().toISOString(),
      size: blob.size,
    };

    await saveClip(clip);
    ++requestVersionRef.current;
    dispatch({ type: "add", clip });
    scheduleIdleTask(() => {
      void enqueueClipMoodAnalysis(clip)
        .then((description) => {
          dispatch({
            type: "update",
            clip: {
              ...clip,
              analysis: analysisFromDescription(description),
            },
          });
        })
        .catch((error) => reportError(error));
    });
    return clip;
  }, [sessionId]);

  const reorderClips = useCallback(async (clipIds: string[]) => {
    const activeSession =
      stateRef.current.session ??
      (sessionId ? await getOrCreateSession(sessionId) : await getOrCreateTodaySession());
    dispatch({ type: "session", session: activeSession });

    await saveClipOrder(activeSession.id, clipIds);
    ++requestVersionRef.current;
    dispatch({ type: "reorder", clipIds });
  }, [sessionId]);

  const removeClip = useCallback(async (id: string) => {
    await deleteClip(id);
    ++requestVersionRef.current;
    releaseClipObjectUrl(id);
    dispatch({ type: "remove", id });
  }, []);

  const clearClips = useCallback(async () => {
    const activeSession =
      stateRef.current.session ??
      (sessionId ? await getOrCreateSession(sessionId) : await getOrCreateTodaySession());
    await clearClipsForSession(activeSession.id);
    ++requestVersionRef.current;
    releaseAllClipObjectUrls();
    dispatch({ type: "clear" });
  }, [sessionId]);

  const clearLocalClips = useCallback(() => {
    ++requestVersionRef.current;
    releaseAllClipObjectUrls();
    dispatch({ type: "clear" });
  }, []);

  return useMemo(
    () => ({
      session: state.session,
      clips: state.clips,
      loading: state.loading,
      addClip,
      clearClips,
      clearLocalClips,
      reorderClips,
      removeClip,
      refresh,
    }),
    [
      addClip,
      clearClips,
      clearLocalClips,
      refresh,
      removeClip,
      reorderClips,
      state.clips,
      state.loading,
      state.session,
    ],
  );
}
