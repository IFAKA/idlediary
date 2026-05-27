import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction } from "idb";
import { AppError } from "@/features/errors/app-error";
import { addDebugEvent } from "@/features/errors/debug-store";
import { reportError } from "@/features/errors/report-error";
import type { ThumbnailResult } from "./thumbnail";
import type {
  ClipMetadataRecord,
  ClipRecord,
  SessionSummary,
  ThumbnailFields,
  ThumbnailMetadataFields,
  VlogMetadataRecord,
  VlogRecord,
  VlogSummary,
} from "./types";

const dbName = "idlediary";
const dbVersion = 2;

type ClipMetadataStoreRecord = ClipMetadataRecord;
type VlogMetadataStoreRecord = VlogMetadataRecord & { needsActionKey: "true" | "false" };

type ClipMediaRecord = {
  clipId: string;
  blob: Blob;
};

type VlogMediaRecord = {
  vlogId: string;
  blob: Blob;
};

type ClipThumbnailRecord = {
  clipId: string;
  blob: Blob;
  mimeType: string;
  width?: number;
  height?: number;
};

type VlogThumbnailRecord = {
  vlogId: string;
  blob: Blob;
  mimeType: string;
  width?: number;
  height?: number;
};

interface IdleDiaryDb extends DBSchema {
  clips: {
    key: string;
    value: ClipMetadataStoreRecord;
    indexes: { "by-session": string; "by-created": string };
  };
  "clip-media": {
    key: string;
    value: ClipMediaRecord;
  };
  "clip-thumbnails": {
    key: string;
    value: ClipThumbnailRecord;
  };
  sessions: {
    key: string;
    value: SessionSummary;
  };
  vlogs: {
    key: string;
    value: VlogMetadataStoreRecord;
    indexes: {
      "by-created": string;
      "by-needs-action": string;
      "by-session": string;
      "by-generation-fingerprint": string;
    };
  };
  "vlog-media": {
    key: string;
    value: VlogMediaRecord;
  };
  "vlog-thumbnails": {
    key: string;
    value: VlogThumbnailRecord;
  };
}

type IdleDiaryStores =
  | "clips"
  | "clip-media"
  | "clip-thumbnails"
  | "sessions"
  | "vlogs"
  | "vlog-media"
  | "vlog-thumbnails";
type IdleDiaryTransaction<Stores extends IdleDiaryStores> = IDBPTransaction<
  IdleDiaryDb,
  ArrayLike<Stores>,
  "readonly" | "readwrite"
>;

let dbPromise: Promise<IDBPDatabase<IdleDiaryDb>> | null = null;

export function sortVlogsNewestFirst<T extends Pick<VlogSummary, "createdAt" | "id">>(vlogs: T[]) {
  return [...vlogs].sort((a, b) => {
    const byCreatedAt = b.createdAt.localeCompare(a.createdAt);
    if (byCreatedAt !== 0) return byCreatedAt;

    return b.id.localeCompare(a.id);
  });
}

function createStores(
  db: IDBPDatabase<IdleDiaryDb>,
  tx: IDBPTransaction<IdleDiaryDb, ArrayLike<IdleDiaryStores>, "versionchange">,
) {
  if (!db.objectStoreNames.contains("clips")) {
    const clips = db.createObjectStore("clips", { keyPath: "id" });
    clips.createIndex("by-session", "sessionId");
    clips.createIndex("by-created", "createdAt");
  }

  if (!db.objectStoreNames.contains("clip-media")) {
    db.createObjectStore("clip-media", { keyPath: "clipId" });
  }

  if (!db.objectStoreNames.contains("clip-thumbnails")) {
    db.createObjectStore("clip-thumbnails", { keyPath: "clipId" });
  }

  if (!db.objectStoreNames.contains("sessions")) {
    db.createObjectStore("sessions", { keyPath: "id" });
  }

  if (!db.objectStoreNames.contains("vlogs")) {
    const vlogs = db.createObjectStore("vlogs", { keyPath: "id" });
    vlogs.createIndex("by-created", "createdAt");
    vlogs.createIndex("by-needs-action", "needsActionKey");
    vlogs.createIndex("by-session", "sessionId");
    vlogs.createIndex("by-generation-fingerprint", "generationFingerprint");
  } else {
    const vlogs = tx.objectStore("vlogs") as unknown as IDBObjectStore;
    if (!vlogs.indexNames.contains("by-needs-action")) {
      vlogs.createIndex("by-needs-action", "needsActionKey");
    }
    if (!vlogs.indexNames.contains("by-session")) {
      vlogs.createIndex("by-session", "sessionId");
    }
    if (!vlogs.indexNames.contains("by-generation-fingerprint")) {
      vlogs.createIndex("by-generation-fingerprint", "generationFingerprint");
    }
  }

  if (!db.objectStoreNames.contains("vlog-media")) {
    db.createObjectStore("vlog-media", { keyPath: "vlogId" });
  }

  if (!db.objectStoreNames.contains("vlog-thumbnails")) {
    db.createObjectStore("vlog-thumbnails", { keyPath: "vlogId" });
  }
}

function clipMetadata(clip: ClipRecord | ClipMetadataRecord): ClipMetadataStoreRecord {
  return {
    id: clip.id,
    sessionId: clip.sessionId,
    mimeType: clip.mimeType,
    durationMs: clip.durationMs,
    createdAt: clip.createdAt,
    size: clip.size,
    ...(typeof clip.order === "number" ? { order: clip.order } : {}),
    ...(clip.thumbnailMimeType ? { thumbnailMimeType: clip.thumbnailMimeType } : {}),
    ...(typeof clip.thumbnailWidth === "number" ? { thumbnailWidth: clip.thumbnailWidth } : {}),
    ...(typeof clip.thumbnailHeight === "number" ? { thumbnailHeight: clip.thumbnailHeight } : {}),
  };
}

function vlogMetadata(vlog: VlogRecord | VlogSummary): VlogMetadataStoreRecord {
  return {
    id: vlog.id,
    sessionId: vlog.sessionId,
    mimeType: vlog.mimeType,
    clipCount: vlog.clipCount,
    title: vlog.title,
    caption: vlog.caption,
    createdAt: vlog.createdAt,
    needsAction: vlog.needsAction ?? true,
    needsActionKey: vlog.needsAction === false ? "false" : "true",
    size: vlog.size,
    ...(vlog.generationFingerprint
      ? { generationFingerprint: vlog.generationFingerprint }
      : {}),
    ...(vlog.thumbnailMimeType ? { thumbnailMimeType: vlog.thumbnailMimeType } : {}),
    ...(typeof vlog.thumbnailWidth === "number" ? { thumbnailWidth: vlog.thumbnailWidth } : {}),
    ...(typeof vlog.thumbnailHeight === "number" ? { thumbnailHeight: vlog.thumbnailHeight } : {}),
  };
}

function thumbnailResultFromFields(fields: ThumbnailFields): ThumbnailResult | null {
  if (
    !fields.thumbnailBlob ||
    !fields.thumbnailMimeType ||
    typeof fields.thumbnailWidth !== "number" ||
    typeof fields.thumbnailHeight !== "number"
  ) {
    return null;
  }

  return {
    thumbnailBlob: fields.thumbnailBlob,
    thumbnailMimeType: fields.thumbnailMimeType,
    thumbnailWidth: fields.thumbnailWidth,
    thumbnailHeight: fields.thumbnailHeight,
  };
}

function clipThumbnail(id: string, thumbnail: ThumbnailResult): ClipThumbnailRecord {
  return {
    clipId: id,
    blob: thumbnail.thumbnailBlob,
    mimeType: thumbnail.thumbnailMimeType,
    ...(typeof thumbnail.thumbnailWidth === "number" ? { width: thumbnail.thumbnailWidth } : {}),
    ...(typeof thumbnail.thumbnailHeight === "number" ? { height: thumbnail.thumbnailHeight } : {}),
  };
}

function vlogThumbnail(id: string, thumbnail: ThumbnailResult): VlogThumbnailRecord {
  return {
    vlogId: id,
    blob: thumbnail.thumbnailBlob,
    mimeType: thumbnail.thumbnailMimeType,
    ...(typeof thumbnail.thumbnailWidth === "number" ? { width: thumbnail.thumbnailWidth } : {}),
    ...(typeof thumbnail.thumbnailHeight === "number" ? { height: thumbnail.thumbnailHeight } : {}),
  };
}

function thumbnailFields(
  thumbnail: ClipThumbnailRecord | VlogThumbnailRecord | undefined,
): ThumbnailFields {
  if (!thumbnail) return {};
  return {
    thumbnailBlob: thumbnail.blob,
    thumbnailMimeType: thumbnail.mimeType,
    ...(typeof thumbnail.width === "number" ? { thumbnailWidth: thumbnail.width } : {}),
    ...(typeof thumbnail.height === "number" ? { thumbnailHeight: thumbnail.height } : {}),
  };
}

function thumbnailMetadataFields(thumbnail: ThumbnailResult): ThumbnailMetadataFields {
  return {
    thumbnailMimeType: thumbnail.thumbnailMimeType,
    ...(typeof thumbnail.thumbnailWidth === "number"
      ? { thumbnailWidth: thumbnail.thumbnailWidth }
      : {}),
    ...(typeof thumbnail.thumbnailHeight === "number"
      ? { thumbnailHeight: thumbnail.thumbnailHeight }
      : {}),
  };
}

async function hydrateClip(
  tx: IdleDiaryTransaction<"clips" | "clip-media" | "clip-thumbnails">,
  metadata: ClipMetadataStoreRecord,
): Promise<ClipRecord | null> {
  const [media, thumbnail] = await Promise.all([
    tx.objectStore("clip-media").get(metadata.id),
    tx.objectStore("clip-thumbnails").get(metadata.id),
  ]);
  if (!media) return null;
  return { ...metadata, blob: media.blob, ...thumbnailFields(thumbnail) };
}

async function hydrateVlogSummary(
  tx: IdleDiaryTransaction<"vlogs" | "vlog-thumbnails">,
  metadata: VlogMetadataStoreRecord,
): Promise<VlogSummary> {
  const thumbnail = await tx.objectStore("vlog-thumbnails").get(metadata.id);
  return { ...metadata, ...thumbnailFields(thumbnail) };
}

async function hydrateVlog(
  tx: IdleDiaryTransaction<"vlogs" | "vlog-media" | "vlog-thumbnails">,
  metadata: VlogMetadataStoreRecord,
): Promise<VlogRecord | null> {
  const [media, thumbnail] = await Promise.all([
    tx.objectStore("vlog-media").get(metadata.id),
    tx.objectStore("vlog-thumbnails").get(metadata.id),
  ]);
  if (!media) return null;
  return { ...metadata, blob: media.blob, ...thumbnailFields(thumbnail) };
}

async function migrateV1Records(
  tx: IDBPTransaction<
    IdleDiaryDb,
    [
      "clips",
      "clip-media",
      "clip-thumbnails",
      "sessions",
      "vlogs",
      "vlog-media",
      "vlog-thumbnails",
    ],
    "versionchange"
  >,
) {
  const clipsStore = tx.objectStore("clips");
  const clipMediaStore = tx.objectStore("clip-media");
  const clipThumbnailsStore = tx.objectStore("clip-thumbnails");
  const vlogsStore = tx.objectStore("vlogs");
  const vlogMediaStore = tx.objectStore("vlog-media");
  const vlogThumbnailsStore = tx.objectStore("vlog-thumbnails");

  const legacyClips = (await clipsStore.getAll()) as unknown as ClipRecord[];
  await Promise.all(
    legacyClips.map(async (clip) => {
      if (clip.blob) {
        await clipMediaStore.put({ clipId: clip.id, blob: clip.blob });
      }
      if (clip.thumbnailBlob) {
        await clipThumbnailsStore.put({
          clipId: clip.id,
          blob: clip.thumbnailBlob,
          mimeType: clip.thumbnailMimeType ?? clip.thumbnailBlob.type,
          width: clip.thumbnailWidth,
          height: clip.thumbnailHeight,
        });
      }
      await clipsStore.put(clipMetadata(clip));
    }),
  );

  const legacyVlogs = (await vlogsStore.getAll()) as unknown as Array<
    Omit<VlogRecord, "size"> & { size?: number }
  >;
  await Promise.all(
    legacyVlogs.map(async (vlog) => {
      if (vlog.blob) {
        await vlogMediaStore.put({ vlogId: vlog.id, blob: vlog.blob });
      }
      if (vlog.thumbnailBlob) {
        await vlogThumbnailsStore.put({
          vlogId: vlog.id,
          blob: vlog.thumbnailBlob,
          mimeType: vlog.thumbnailMimeType ?? vlog.thumbnailBlob.type,
          width: vlog.thumbnailWidth,
          height: vlog.thumbnailHeight,
        });
      }
      await vlogsStore.put(
        vlogMetadata({
          ...vlog,
          size: vlog.size ?? vlog.blob?.size ?? 0,
        }),
      );
    }),
  );
}

function getDb() {
  if (typeof indexedDB === "undefined") {
    throw new AppError({
      code: "storage-read-failed",
      area: "storage",
      message: "IndexedDB is unavailable",
      userMessage: "Local clip storage is not available in this browser.",
    });
  }

  dbPromise ??= openDB<IdleDiaryDb>(dbName, dbVersion, {
    async upgrade(db, oldVersion, _newVersion, tx) {
      createStores(db, tx);
      if (oldVersion < 2) {
        await migrateV1Records(tx);
      }
    },
  });

  return dbPromise;
}

export function resetStorageForTests() {
  dbPromise = null;
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
    const tx = db.transaction(["clips", "clip-media", "clip-thumbnails"], "readonly");
    const metadata = await tx.objectStore("clips").index("by-session").getAll(sessionId);
    const clips = await Promise.all(metadata.map((clip) => hydrateClip(tx, clip)));
    await tx.done;

    return clips
      .filter((clip): clip is ClipRecord => Boolean(clip))
      .sort((a, b) => {
        if (typeof a.order === "number" && typeof b.order === "number") {
          return a.order - b.order;
        }
        return a.createdAt.localeCompare(b.createdAt);
      });
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
    const tx = db.transaction(["clips", "clip-media", "clip-thumbnails", "sessions"], "readwrite");
    await tx.objectStore("clips").put(clipMetadata(clip));
    await tx.objectStore("clip-media").put({ clipId: clip.id, blob: clip.blob });
    const thumbnail = thumbnailResultFromFields(clip);
    if (thumbnail) {
      await tx.objectStore("clip-thumbnails").put(clipThumbnail(clip.id, thumbnail));
    }

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

export async function saveClipThumbnail(id: string, thumbnail: ThumbnailResult) {
  try {
    const db = await getDb();
    const tx = db.transaction(["clips", "clip-media", "clip-thumbnails"], "readwrite");
    const clipsStore = tx.objectStore("clips");
    const clip = await clipsStore.get(id);
    if (!clip) {
      await tx.done;
      return null;
    }

    const updatedMetadata = { ...clip, ...thumbnailMetadataFields(thumbnail) };
    await clipsStore.put(updatedMetadata);
    await tx.objectStore("clip-thumbnails").put(clipThumbnail(id, thumbnail));
    const updated = await hydrateClip(tx, updatedMetadata);
    await tx.done;
    addDebugEvent("clip-thumbnail-saved", "storage", {
      clipId: id,
      thumbnailBytes: thumbnail.thumbnailBlob.size,
      thumbnailMimeType: thumbnail.thumbnailMimeType,
    });
    return updated;
  } catch (cause) {
    throw reportError(
      new AppError({
        code: "storage-write-failed",
        area: "storage",
        message: "Could not save clip thumbnail",
        userMessage: "This clip thumbnail could not be saved.",
        cause,
        context: { clipId: id },
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
    const tx = db.transaction(["clips", "clip-media", "clip-thumbnails"], "readwrite");
    await Promise.all([
      tx.objectStore("clips").delete(id),
      tx.objectStore("clip-media").delete(id),
      tx.objectStore("clip-thumbnails").delete(id),
    ]);
    await tx.done;
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
    const tx = db.transaction(["clips", "clip-media", "clip-thumbnails"], "readwrite");
    await Promise.all(
      ids.flatMap((id) => [
        tx.objectStore("clips").delete(id),
        tx.objectStore("clip-media").delete(id),
        tx.objectStore("clip-thumbnails").delete(id),
      ]),
    );
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
    const tx = db.transaction(["clips", "clip-media", "clip-thumbnails", "sessions"], "readwrite");
    const clipsStore = tx.objectStore("clips");
    const clips = await clipsStore.index("by-session").getAll(sessionId);

    await Promise.all(
      clips.flatMap((clip) => [
        clipsStore.delete(clip.id),
        tx.objectStore("clip-media").delete(clip.id),
        tx.objectStore("clip-thumbnails").delete(clip.id),
      ]),
    );

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

async function saveVlogInTransaction(
  tx: IDBPTransaction<
    IdleDiaryDb,
    ["vlogs", "vlog-media", "vlog-thumbnails", "sessions"],
    "readwrite"
  >,
  vlog: VlogRecord,
) {
  const savedVlog: VlogRecord = { ...vlog, needsAction: vlog.needsAction ?? true };
  await tx.objectStore("vlogs").put(vlogMetadata(savedVlog));
  await tx.objectStore("vlog-media").put({ vlogId: savedVlog.id, blob: savedVlog.blob });
  const thumbnail = thumbnailResultFromFields(savedVlog);
  if (thumbnail) {
    await tx.objectStore("vlog-thumbnails").put(vlogThumbnail(savedVlog.id, thumbnail));
  }

  const session = await tx.objectStore("sessions").get(savedVlog.sessionId);
  if (session) {
    await tx.objectStore("sessions").put({
      ...session,
      generatedVlogId: savedVlog.id,
      updatedAt: new Date().toISOString(),
    });
  }

  return savedVlog;
}

export async function saveVlog(vlog: VlogRecord) {
  try {
    const db = await getDb();
    const tx = db.transaction(["vlogs", "vlog-media", "vlog-thumbnails", "sessions"], "readwrite");
    const savedVlog = await saveVlogInTransaction(tx, vlog);
    await tx.done;
    addDebugEvent("vlog-saved", "storage", {
      vlogId: savedVlog.id,
      clipCount: savedVlog.clipCount,
      needsAction: savedVlog.needsAction,
    });
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

export async function saveVlogThumbnail(id: string, thumbnail: ThumbnailResult) {
  try {
    const db = await getDb();
    const tx = db.transaction(["vlogs", "vlog-media", "vlog-thumbnails"], "readwrite");
    const vlogsStore = tx.objectStore("vlogs");
    const vlog = await vlogsStore.get(id);
    if (!vlog) {
      await tx.done;
      return null;
    }

    const updatedMetadata = { ...vlog, ...thumbnailMetadataFields(thumbnail) };
    await vlogsStore.put(updatedMetadata);
    await tx.objectStore("vlog-thumbnails").put(vlogThumbnail(id, thumbnail));
    const updated = await hydrateVlog(tx, updatedMetadata);
    await tx.done;
    addDebugEvent("vlog-thumbnail-saved", "storage", {
      vlogId: id,
      thumbnailBytes: thumbnail.thumbnailBlob.size,
      thumbnailMimeType: thumbnail.thumbnailMimeType,
    });
    return updated;
  } catch (cause) {
    throw reportError(
      new AppError({
        code: "storage-write-failed",
        area: "storage",
        message: "Could not save saved-video thumbnail",
        userMessage: "This saved video thumbnail could not be saved.",
        cause,
        context: { vlogId: id },
      }),
    );
  }
}

export async function saveVlogAndClearSessionDraft(vlog: VlogRecord) {
  try {
    const db = await getDb();
    const tx = db.transaction(
      [
        "vlogs",
        "vlog-media",
        "vlog-thumbnails",
        "clips",
        "clip-media",
        "clip-thumbnails",
        "sessions",
      ],
      "readwrite",
    );
    const clipsStore = tx.objectStore("clips");
    const clips = await clipsStore.index("by-session").getAll(vlog.sessionId);
    const savedVlog = await saveVlogInTransaction(
      tx as unknown as IDBPTransaction<
        IdleDiaryDb,
        ["vlogs", "vlog-media", "vlog-thumbnails", "sessions"],
        "readwrite"
      >,
      vlog,
    );

    await Promise.all(
      clips.flatMap((clip) => [
        clipsStore.delete(clip.id),
        tx.objectStore("clip-media").delete(clip.id),
        tx.objectStore("clip-thumbnails").delete(clip.id),
      ]),
    );

    await tx.done;
    addDebugEvent("vlog-saved-draft-cleared", "storage", {
      vlogId: savedVlog.id,
      sessionId: savedVlog.sessionId,
      clipCount: clips.length,
      needsAction: savedVlog.needsAction,
    });
  } catch (cause) {
    throw reportError(
      new AppError({
        code: "storage-write-failed",
        area: "storage",
        message: "Could not save generated vlog and clear draft clips",
        userMessage: "The vlog was created but could not be saved locally.",
        cause,
        context: { vlogId: vlog.id, sessionId: vlog.sessionId },
      }),
    );
  }
}

export async function markVlogHandled(id: string) {
  try {
    const db = await getDb();
    const tx = db.transaction(["vlogs", "vlog-thumbnails"], "readwrite");
    const vlogsStore = tx.objectStore("vlogs");
    const vlog = await vlogsStore.get(id);
    if (!vlog) {
      await tx.done;
      return null;
    }

    const handledVlog = vlogMetadata({ ...vlog, needsAction: false });
    await vlogsStore.put(handledVlog);
    const summary = await hydrateVlogSummary(tx, handledVlog);
    await tx.done;
    addDebugEvent("vlog-handled", "storage", { vlogId: id });
    return summary;
  } catch (cause) {
    throw reportError(
      new AppError({
        code: "storage-write-failed",
        area: "storage",
        message: "Could not mark generated vlog handled",
        userMessage: "The saved video status could not be updated.",
        cause,
        context: { vlogId: id },
      }),
    );
  }
}

export async function markNeedsActionVlogsHandled() {
  try {
    const db = await getDb();
    const tx = db.transaction(["vlogs", "vlog-thumbnails"], "readwrite");
    const vlogsStore = tx.objectStore("vlogs");
    const needsActionVlogs = await vlogsStore.index("by-needs-action").getAll("true");

    const handledVlogs = await Promise.all(
      needsActionVlogs.map(async (vlog) => {
        const handledVlog = vlogMetadata({ ...vlog, needsAction: false });
        await vlogsStore.put(handledVlog);
        return hydrateVlogSummary(tx, handledVlog);
      }),
    );

    await tx.done;
    if (handledVlogs.length > 0) {
      addDebugEvent("vlogs-handled", "storage", { count: handledVlogs.length });
    }
    return handledVlogs;
  } catch (cause) {
    throw reportError(
      new AppError({
        code: "storage-write-failed",
        area: "storage",
        message: "Could not mark generated vlogs handled",
        userMessage: "The saved video status could not be updated.",
        cause,
      }),
    );
  }
}

export async function getVlogSummary(id: string) {
  try {
    const db = await getDb();
    const tx = db.transaction(["vlogs", "vlog-thumbnails"], "readonly");
    const metadata = await tx.objectStore("vlogs").get(id);
    if (!metadata) {
      await tx.done;
      return undefined;
    }
    const summary = await hydrateVlogSummary(tx, metadata);
    await tx.done;
    return summary;
  } catch (cause) {
    throw reportError(
      new AppError({
        code: "storage-read-failed",
        area: "storage",
        message: "Could not load generated vlog summary",
        userMessage: "The saved vlog could not be loaded.",
        cause,
        context: { vlogId: id },
      }),
    );
  }
}

export async function getVlog(id: string) {
  try {
    const db = await getDb();
    const tx = db.transaction(["vlogs", "vlog-media", "vlog-thumbnails"], "readonly");
    const metadata = await tx.objectStore("vlogs").get(id);
    if (!metadata) {
      await tx.done;
      return undefined;
    }
    const vlog = await hydrateVlog(tx, metadata);
    await tx.done;
    return vlog ?? undefined;
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

export async function getVlogByGenerationFingerprint(
  generationFingerprint: string,
  sessionId: string,
) {
  try {
    const db = await getDb();
    const tx = db.transaction(["vlogs", "vlog-media", "vlog-thumbnails"], "readonly");
    const matches = await tx
      .objectStore("vlogs")
      .index("by-generation-fingerprint")
      .getAll(generationFingerprint);
    for (const metadata of sortVlogsNewestFirst(matches).filter(
      (vlog) => vlog.sessionId === sessionId,
    )) {
      const vlog = await hydrateVlog(tx, metadata);
      if (vlog) {
        await tx.done;
        return vlog;
      }
    }
    await tx.done;
    return null;
  } catch (cause) {
    throw reportError(
      new AppError({
        code: "storage-read-failed",
        area: "storage",
        message: "Could not load cached generated vlog",
        userMessage: "The saved vlog could not be loaded.",
        cause,
        context: { sessionId, generationFingerprint },
      }),
    );
  }
}

export async function deleteVlog(id: string) {
  try {
    const db = await getDb();
    const tx = db.transaction(["vlogs", "vlog-media", "vlog-thumbnails", "sessions"], "readwrite");
    await Promise.all([
      tx.objectStore("vlogs").delete(id),
      tx.objectStore("vlog-media").delete(id),
      tx.objectStore("vlog-thumbnails").delete(id),
    ]);

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
      const vlog = await getVlog(session.generatedVlogId);
      if (vlog) return vlog;
    }

    const tx = db.transaction(["vlogs", "vlog-media", "vlog-thumbnails"], "readonly");
    const vlogs = await tx.objectStore("vlogs").index("by-session").getAll(sessionId);
    const latest = sortVlogsNewestFirst(vlogs)[0];
    const vlog = latest ? await hydrateVlog(tx, latest) : null;
    await tx.done;
    return vlog;
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
    const tx = db.transaction(["vlogs", "vlog-media", "vlog-thumbnails", "sessions"], "readwrite");
    const session = await tx.objectStore("sessions").get(sessionId);

    const vlogsStore = tx.objectStore("vlogs");
    const vlogs = await vlogsStore.index("by-session").getAll(sessionId);
    await Promise.all(
      vlogs.flatMap((vlog) => [
        vlogsStore.delete(vlog.id),
        tx.objectStore("vlog-media").delete(vlog.id),
        tx.objectStore("vlog-thumbnails").delete(vlog.id),
      ]),
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

export async function listVlogSummaries() {
  try {
    const db = await getDb();
    const tx = db.transaction(["vlogs", "vlog-thumbnails"], "readonly");
    const metadata = sortVlogsNewestFirst(await tx.objectStore("vlogs").index("by-created").getAll());
    const summaries = await Promise.all(metadata.map((vlog) => hydrateVlogSummary(tx, vlog)));
    await tx.done;
    return summaries;
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

export async function hasNeedsActionVlog() {
  try {
    const db = await getDb();
    const match = await db.getFromIndex("vlogs", "by-needs-action", "true");
    return Boolean(match);
  } catch (cause) {
    throw reportError(
      new AppError({
        code: "storage-read-failed",
        area: "storage",
        message: "Could not check saved video status",
        userMessage: "Saved video status could not be loaded.",
        cause,
      }),
    );
  }
}

export async function listVlogs() {
  try {
    const summaries = await listVlogSummaries();
    const vlogs = await Promise.all(summaries.map((vlog) => getVlog(vlog.id)));
    return vlogs.filter((vlog): vlog is VlogRecord => Boolean(vlog));
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
