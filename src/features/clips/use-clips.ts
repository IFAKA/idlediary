"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { reportError } from "@/features/errors/report-error";
import { deleteClip, getOrCreateTodaySession, listClips, saveClip, saveClipOrder } from "./storage";
import type { ClipRecord, SessionSummary } from "./types";

export function useClips() {
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [clips, setClips] = useState<ClipRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (sessionId?: string) => {
    const activeSession = sessionId ? { id: sessionId } : await getOrCreateTodaySession();
    const loaded = await listClips(activeSession.id);
    setClips(loaded);
  }, []);

  useEffect(() => {
    let mounted = true;
    getOrCreateTodaySession()
      .then(async (created) => {
        if (!mounted) return;
        setSession(created);
        setClips(await listClips(created.id));
      })
      .catch((error) => reportError(error))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  const addClip = useCallback(
    async (blob: Blob, durationMs: number) => {
      const activeSession = session ?? (await getOrCreateTodaySession());
      setSession(activeSession);
      const clip: ClipRecord = {
        id: crypto.randomUUID(),
        sessionId: activeSession.id,
        blob,
        mimeType: blob.type || "video/webm",
        durationMs,
        order: clips.length,
        createdAt: new Date().toISOString(),
        size: blob.size,
      };
      await saveClip(clip);
      await refresh(activeSession.id);
      return clip;
    },
    [clips.length, refresh, session],
  );

  const reorderClips = useCallback(
    async (clipIds: string[]) => {
      const activeSession = session ?? (await getOrCreateTodaySession());
      setSession(activeSession);
      await saveClipOrder(activeSession.id, clipIds);
      await refresh(activeSession.id);
    },
    [refresh, session],
  );

  const removeClip = useCallback(
    async (id: string) => {
      await deleteClip(id);
      await refresh(session?.id);
    },
    [refresh, session?.id],
  );

  return useMemo(
    () => ({
      session,
      clips,
      loading,
      addClip,
      reorderClips,
      removeClip,
      refresh,
    }),
    [addClip, clips, loading, refresh, removeClip, reorderClips, session],
  );
}
