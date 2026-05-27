import { openDB, type DBSchema } from "idb";
import { AppError } from "@/features/errors/app-error";
import { addDebugEvent } from "@/features/errors/debug-store";
import { reportError } from "@/features/errors/report-error";
import type { ClipRecord, SessionSummary, VlogRecord } from "./types";

interface IdleDiaryDb extends DBSchema {
  clips: {
    key: string;
    value: ClipRecord;
    indexes: { "by-session": string; "by-created": string };
  };
  sessions: {
    key: string;
    value: SessionSummary;
  };
  vlogs: {
    key: string;
    value: VlogRecord;
    indexes: { "by-created": string };
  };
}

let dbPromise: Promise<import("idb").IDBPDatabase<IdleDiaryDb>> | null = null;

function getDb() {
  if (typeof indexedDB === "undefined") {
    throw new AppError({
      code: "storage-read-failed",
      area: "storage",
      message: "IndexedDB is unavailable",
      userMessage: "Local clip storage is not available in this browser.",
    });
  }

  dbPromise ??= openDB<IdleDiaryDb>("idlediary", 1, {
    upgrade(db) {
      const clips = db.createObjectStore("clips", { keyPath: "id" });
      clips.createIndex("by-session", "sessionId");
      clips.createIndex("by-created", "createdAt");
      db.createObjectStore("sessions", { keyPath: "id" });
      const vlogs = db.createObjectStore("vlogs", { keyPath: "id" });
      vlogs.createIndex("by-created", "createdAt");
    },
  });

  return dbPromise;
}

export async function getOrCreateTodaySession() {
  const id = new Date().toISOString().slice(0, 10);
  try {
    const db = await getDb();
    const existing = await db.get("sessions", id);
    if (existing) return existing;

    const session: SessionSummary = {
      id,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.put("sessions", session);
    addDebugEvent("session-created", "storage", { sessionId: id });
    return session;
  } catch (cause) {
    throw reportError(
      new AppError({
        code: "storage-read-failed",
        area: "storage",
        message: "Could not open or create today's session",
        userMessage: "Local storage is not available right now.",
        cause,
        context: { sessionId: id },
      }),
    );
  }
}

export async function listClips(sessionId: string) {
  try {
    const db = await getDb();
    return (await db.getAllFromIndex("clips", "by-session", sessionId)).sort(
      (a, b) => {
        if (typeof a.order === "number" && typeof b.order === "number") {
          return a.order - b.order;
        }
        return a.createdAt.localeCompare(b.createdAt);
      },
    );
  } catch (cause) {
    throw reportError(
      new AppError({
        code: "storage-read-failed",
        area: "storage",
        message: "Could not list clips",
        userMessage: "Your clips could not be loaded.",
        cause,
        context: { sessionId },
      }),
    );
  }
}

export async function saveClip(clip: ClipRecord) {
  try {
    const db = await getDb();
    const tx = db.transaction(["clips", "sessions"], "readwrite");
    await tx.objectStore("clips").put(clip);
    const session = await tx.objectStore("sessions").get(clip.sessionId);
    if (session) {
      await tx.objectStore("sessions").put({
        ...session,
        updatedAt: new Date().toISOString(),
      });
    }
    await tx.done;
    addDebugEvent("clip-saved", "storage", {
      sessionId: clip.sessionId,
      clipId: clip.id,
      size: clip.size,
      mimeType: clip.mimeType,
    });
  } catch (cause) {
    throw reportError(
      new AppError({
        code: "storage-write-failed",
        area: "storage",
        message: "Could not save clip",
        userMessage: "This clip could not be saved. Check local storage space.",
        cause,
        context: { sessionId: clip.sessionId, clipId: clip.id, size: clip.size },
      }),
    );
  }
}

export async function saveClipOrder(sessionId: string, clipIds: string[]) {
  try {
    const db = await getDb();
    const tx = db.transaction(["clips", "sessions"], "readwrite");
    const clipsStore = tx.objectStore("clips");

    await Promise.all(
      clipIds.map(async (id, index) => {
        const clip = await clipsStore.get(id);
        if (!clip || clip.sessionId !== sessionId) return;
        await clipsStore.put({ ...clip, order: index });
      }),
    );

    const session = await tx.objectStore("sessions").get(sessionId);
    if (session) {
      await tx.objectStore("sessions").put({
        ...session,
        updatedAt: new Date().toISOString(),
      });
    }

    await tx.done;
    addDebugEvent("clip-order-saved", "storage", { sessionId, clipCount: clipIds.length });
  } catch (cause) {
    throw reportError(
      new AppError({
        code: "storage-write-failed",
        area: "storage",
        message: "Could not save clip order",
        userMessage: "The clip order could not be saved.",
        cause,
        context: { sessionId, clipCount: clipIds.length },
      }),
    );
  }
}

export async function deleteClip(id: string) {
  try {
    const db = await getDb();
    await db.delete("clips", id);
    addDebugEvent("clip-deleted", "storage", { clipId: id });
  } catch (cause) {
    throw reportError(
      new AppError({
        code: "storage-delete-failed",
        area: "storage",
        message: "Could not delete clip",
        userMessage: "That clip could not be deleted.",
        cause,
        context: { clipId: id },
      }),
    );
  }
}

export async function deleteClips(ids: string[]) {
  if (ids.length === 0) return;

  try {
    const db = await getDb();
    const tx = db.transaction("clips", "readwrite");
    const clipsStore = tx.objectStore("clips");

    await Promise.all(ids.map((id) => clipsStore.delete(id)));
    await tx.done;
    addDebugEvent("clips-deleted", "storage", { clipCount: ids.length });
  } catch (cause) {
    throw reportError(
      new AppError({
        code: "storage-delete-failed",
        area: "storage",
        message: "Could not delete clips",
        userMessage: "Those clips could not be deleted.",
        cause,
        context: { clipCount: ids.length },
      }),
    );
  }
}

export async function clearClipsForSession(sessionId: string) {
  try {
    const db = await getDb();
    const tx = db.transaction(["clips", "sessions"], "readwrite");
    const clipsStore = tx.objectStore("clips");
    const clips = await clipsStore.index("by-session").getAll(sessionId);

    await Promise.all(clips.map((clip) => clipsStore.delete(clip.id)));

    const session = await tx.objectStore("sessions").get(sessionId);
    if (session) {
      await tx.objectStore("sessions").put({
        ...session,
        updatedAt: new Date().toISOString(),
      });
    }

    await tx.done;
    addDebugEvent("session-clips-cleared", "storage", { sessionId, clipCount: clips.length });
  } catch (cause) {
    throw reportError(
      new AppError({
        code: "storage-delete-failed",
        area: "storage",
        message: "Could not clear clips for session",
        userMessage: "The draft clips could not be cleared.",
        cause,
        context: { sessionId },
      }),
    );
  }
}

export async function saveVlog(vlog: VlogRecord) {
  try {
    const db = await getDb();
    const tx = db.transaction(["vlogs", "sessions"], "readwrite");
    await tx.objectStore("vlogs").put(vlog);
    const session = await tx.objectStore("sessions").get(vlog.sessionId);
    if (session) {
      await tx.objectStore("sessions").put({
        ...session,
        generatedVlogId: vlog.id,
        updatedAt: new Date().toISOString(),
      });
    }
    await tx.done;
    addDebugEvent("vlog-saved", "storage", { vlogId: vlog.id, clipCount: vlog.clipCount });
  } catch (cause) {
    throw reportError(
      new AppError({
        code: "storage-write-failed",
        area: "storage",
        message: "Could not save generated vlog",
        userMessage: "The vlog was created but could not be saved locally.",
        cause,
        context: { vlogId: vlog.id, sessionId: vlog.sessionId },
      }),
    );
  }
}

export async function getVlog(id: string) {
  try {
    const db = await getDb();
    return await db.get("vlogs", id);
  } catch (cause) {
    throw reportError(
      new AppError({
        code: "storage-read-failed",
        area: "storage",
        message: "Could not load generated vlog",
        userMessage: "The saved vlog could not be loaded.",
        cause,
        context: { vlogId: id },
      }),
    );
  }
}

export async function deleteVlog(id: string) {
  try {
    const db = await getDb();
    const tx = db.transaction(["vlogs", "sessions"], "readwrite");
    await tx.objectStore("vlogs").delete(id);

    const sessionsStore = tx.objectStore("sessions");
    const sessions = await sessionsStore.getAll();
    await Promise.all(
      sessions
        .filter((session) => session.generatedVlogId === id)
        .map((session) =>
          sessionsStore.put({
            id: session.id,
            startedAt: session.startedAt,
            updatedAt: new Date().toISOString(),
          }),
        ),
    );

    await tx.done;
    addDebugEvent("vlog-deleted", "storage", { vlogId: id });
  } catch (cause) {
    throw reportError(
      new AppError({
        code: "storage-delete-failed",
        area: "storage",
        message: "Could not delete generated vlog",
        userMessage: "The saved video could not be deleted.",
        cause,
        context: { vlogId: id },
      }),
    );
  }
}

export async function getLatestVlogForSession(sessionId: string) {
  try {
    const db = await getDb();
    const session = await db.get("sessions", sessionId);
    if (session?.generatedVlogId) {
      const vlog = await db.get("vlogs", session.generatedVlogId);
      if (vlog) return vlog;
    }

    const vlogs = await db.getAllFromIndex("vlogs", "by-created");
    return (
      vlogs
        .filter((vlog) => vlog.sessionId === sessionId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
    );
  } catch (cause) {
    throw reportError(
      new AppError({
        code: "storage-read-failed",
        area: "storage",
        message: "Could not load the session vlog",
        userMessage: "The saved vlog could not be loaded.",
        cause,
        context: { sessionId },
      }),
    );
  }
}

export async function clearGeneratedVlogForSession(sessionId: string) {
  try {
    const db = await getDb();
    const tx = db.transaction(["vlogs", "sessions"], "readwrite");
    const session = await tx.objectStore("sessions").get(sessionId);

    const vlogsStore = tx.objectStore("vlogs");
    const vlogs = await vlogsStore.index("by-created").getAll();
    await Promise.all(
      vlogs
        .filter((vlog) => vlog.sessionId === sessionId)
        .map((vlog) => vlogsStore.delete(vlog.id)),
    );

    if (session) {
      await tx.objectStore("sessions").put({
        id: session.id,
        startedAt: session.startedAt,
        updatedAt: new Date().toISOString(),
      });
    }

    await tx.done;
    addDebugEvent("vlog-cleared", "storage", { sessionId });
  } catch (cause) {
    throw reportError(
      new AppError({
        code: "storage-delete-failed",
        area: "storage",
        message: "Could not clear generated vlog",
        userMessage: "The saved vlog could not be cleared.",
        cause,
        context: { sessionId },
      }),
    );
  }
}

export async function listVlogs() {
  try {
    const db = await getDb();
    return (await db.getAllFromIndex("vlogs", "by-created")).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  } catch (cause) {
    throw reportError(
      new AppError({
        code: "storage-read-failed",
        area: "storage",
        message: "Could not list vlogs",
        userMessage: "History could not be loaded.",
        cause,
      }),
    );
  }
}
