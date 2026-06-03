import * as fakeIndexedDb from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClipRecord, VlogRecord } from "./types";
import {
  deleteVlog,
  getOrCreateSession,
  getOrCreateTodaySession,
  getVlog,
  hasNeedsActionVlog,
  listClips,
  listVlogSummaries,
  markNeedsActionVlogsHandled,
  markVlogHandled,
  resetStorageForTests,
  saveClip,
  saveClipAnalysis,
  saveClipThumbnail,
  saveVlog,
  saveVlogThumbnail,
  sortVlogsNewestFirst,
} from "./storage";

function vlog(id: string, createdAt: string): VlogRecord {
  const blob = new Blob(["video"], { type: "video/mp4" });
  return {
    id,
    sessionId: createdAt.slice(0, 10),
    blob,
    mimeType: "video/mp4",
    clipCount: 1,
    title: id,
    caption: "",
    createdAt,
    size: blob.size,
  };
}

describe("sortVlogsNewestFirst", () => {
  it("sorts saved videos from most recent to oldest without mutating input", () => {
    const oldest = vlog("oldest", "2026-05-25T08:00:00.000Z");
    const newest = vlog("newest", "2026-05-27T08:00:00.000Z");
    const middle = vlog("middle", "2026-05-26T08:00:00.000Z");
    const vlogs = [oldest, newest, middle];

    expect(sortVlogsNewestFirst(vlogs).map((item) => item.id)).toEqual([
      "newest",
      "middle",
      "oldest",
    ]);
    expect(vlogs.map((item) => item.id)).toEqual(["oldest", "newest", "middle"]);
  });

  it("uses id as a stable tie-breaker for videos created at the same time", () => {
    const createdAt = "2026-05-27T08:00:00.000Z";

    expect(
      sortVlogsNewestFirst([vlog("video-a", createdAt), vlog("video-b", createdAt)]).map(
        (item) => item.id,
      ),
    ).toEqual(["video-b", "video-a"]);
  });

  it("sorts videos regardless of optional thumbnail fields", () => {
    const withThumbnail = {
      ...vlog("with-thumbnail", "2026-05-27T08:00:00.000Z"),
      thumbnailBlob: new Blob(["thumb"], { type: "image/webp" }),
      thumbnailMimeType: "image/webp",
      thumbnailWidth: 360,
      thumbnailHeight: 640,
    };
    const withoutThumbnail = vlog("without-thumbnail", "2026-05-26T08:00:00.000Z");

    expect(sortVlogsNewestFirst([withoutThumbnail, withThumbnail]).map((item) => item.id)).toEqual([
      "with-thumbnail",
      "without-thumbnail",
    ]);
  });
});

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function openRawDb(version?: number) {
  return requestToPromise(indexedDB.open("idlediary", version));
}

async function deleteRawDb() {
  return requestToPromise(indexedDB.deleteDatabase("idlediary"));
}

function clip(overrides: Partial<ClipRecord> = {}): ClipRecord {
  const blob = new Blob(["clip"], { type: "video/webm" });
  return {
    id: "clip-1",
    sessionId: "2026-05-27",
    blob,
    mimeType: "video/webm",
    durationMs: 3000,
    order: 0,
    createdAt: "2026-05-27T10:00:00.000Z",
    size: blob.size,
    ...overrides,
  };
}

async function getRawStoreRecord<T>(storeName: string, key: string) {
  const db = await openRawDb();
  const tx = db.transaction(storeName, "readonly");
  const value = await requestToPromise<T | undefined>(tx.objectStore(storeName).get(key));
  db.close();
  return value;
}

describe("storage media split", () => {
  beforeEach(async () => {
    vi.stubGlobal("indexedDB", new fakeIndexedDb.IDBFactory());
    vi.stubGlobal("IDBKeyRange", fakeIndexedDb.IDBKeyRange);
    vi.stubGlobal("IDBRequest", fakeIndexedDb.IDBRequest);
    vi.stubGlobal("IDBOpenDBRequest", fakeIndexedDb.IDBOpenDBRequest);
    vi.stubGlobal("IDBDatabase", fakeIndexedDb.IDBDatabase);
    vi.stubGlobal("IDBTransaction", fakeIndexedDb.IDBTransaction);
    vi.stubGlobal("IDBObjectStore", fakeIndexedDb.IDBObjectStore);
    vi.stubGlobal("IDBIndex", fakeIndexedDb.IDBIndex);
    vi.stubGlobal("IDBCursor", fakeIndexedDb.IDBCursor);
    vi.stubGlobal("IDBCursorWithValue", fakeIndexedDb.IDBCursorWithValue);
    resetStorageForTests();
    await deleteRawDb();
  });

  it("lists vlog summaries without video blobs and rehydrates full vlogs on demand", async () => {
    const saved = vlog("vlog-1", "2026-05-27T11:00:00.000Z");
    await saveVlog(saved);
    await saveVlogThumbnail(saved.id, {
      thumbnailBlob: new Blob(["thumb"], { type: "image/webp" }),
      thumbnailMimeType: "image/webp",
      thumbnailWidth: 360,
      thumbnailHeight: 640,
    });

    const summaries = await listVlogSummaries();
    expect(summaries).toHaveLength(1);
    expect("blob" in summaries[0]!).toBe(false);
    expect(summaries[0]).toMatchObject({
      id: saved.id,
      size: saved.size,
      thumbnailMimeType: "image/webp",
    });
    expect(summaries[0]!.thumbnailBlob).toBeDefined();

    const full = await getVlog(saved.id);
    expect(full?.blob).toBeDefined();
    expect(await hasNeedsActionVlog()).toBe(true);

    await markVlogHandled(saved.id);
    expect(await hasNeedsActionVlog()).toBe(false);

    const rawMetadata = await getRawStoreRecord<Record<string, unknown>>("vlogs", saved.id);
    expect(rawMetadata?.blob).toBeUndefined();
    expect(rawMetadata?.needsActionKey).toBe("false");
    const rawMedia = await getRawStoreRecord<Record<string, unknown>>("vlog-media", saved.id);
    expect(rawMedia?.blob).toBeDefined();
  });

  it("marks every saved video that needs action as handled", async () => {
    const first = vlog("vlog-1", "2026-05-27T11:00:00.000Z");
    const second = vlog("vlog-2", "2026-05-27T12:00:00.000Z");
    const alreadyHandled = { ...vlog("vlog-3", "2026-05-27T13:00:00.000Z"), needsAction: false };
    await saveVlog(first);
    await saveVlog(second);
    await saveVlog(alreadyHandled);

    const handled = await markNeedsActionVlogsHandled();

    expect(handled.map((entry) => entry.id).sort()).toEqual(["vlog-1", "vlog-2"]);
    expect(await hasNeedsActionVlog()).toBe(false);
    await expect(getVlog(first.id)).resolves.toMatchObject({ needsAction: false });
    await expect(getVlog(second.id)).resolves.toMatchObject({ needsAction: false });
    await expect(getVlog(alreadyHandled.id)).resolves.toMatchObject({ needsAction: false });
  });

  it("updates only clip metadata and thumbnail stores when saving thumbnails", async () => {
    const savedClip = clip();
    await saveClip(savedClip);
    const originalMedia = await getRawStoreRecord<{ blob: Blob }>("clip-media", savedClip.id);

    const updated = await saveClipThumbnail(savedClip.id, {
      thumbnailBlob: new Blob(["thumb"], { type: "image/webp" }),
      thumbnailMimeType: "image/webp",
      thumbnailWidth: 256,
      thumbnailHeight: 256,
    });

    const rawMetadata = await getRawStoreRecord<Record<string, unknown>>("clips", savedClip.id);
    const rawThumbnail = await getRawStoreRecord<Record<string, unknown>>(
      "clip-thumbnails",
      savedClip.id,
    );
    const currentMedia = await getRawStoreRecord<{ blob: Blob }>("clip-media", savedClip.id);

    expect(updated?.thumbnailBlob).toBeDefined();
    expect(rawMetadata?.blob).toBeUndefined();
    expect(rawMetadata?.thumbnailBlob).toBeUndefined();
    expect(rawThumbnail?.blob).toBeDefined();
    expect(originalMedia?.blob).toBeDefined();
    expect(currentMedia?.blob).toBeDefined();
  });

  it("persists clip analysis in metadata without rewriting media", async () => {
    const savedClip = clip();
    await saveClip(savedClip);
    const originalMedia = await getRawStoreRecord<{ blob: Blob }>("clip-media", savedClip.id);

    const updated = await saveClipAnalysis(savedClip.id, {
      version: "mobilevit-small-q8-v1",
      description: "coffee cup / table",
      mood: "coffee",
      energy: "low",
      brightness: "normal",
      analyzedAt: "2026-05-27T10:01:00.000Z",
    });

    const rawMetadata = await getRawStoreRecord<Record<string, unknown>>("clips", savedClip.id);
    const currentMedia = await getRawStoreRecord<{ blob: Blob }>("clip-media", savedClip.id);
    const listed = await listClips(savedClip.sessionId);

    expect(updated?.analysis).not.toHaveProperty("tags");
    expect(rawMetadata?.blob).toBeUndefined();
    expect(rawMetadata?.analysis).toMatchObject({ mood: "coffee" });
    expect(originalMedia?.blob).toBeDefined();
    expect(currentMedia?.blob).toBeDefined();
    expect(listed[0]?.analysis?.description).toBe("coffee cup / table");
  });

  it("migrates v1 embedded clip and vlog blobs into media and thumbnail stores", async () => {
    const request = indexedDB.open("idlediary", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      const clips = db.createObjectStore("clips", { keyPath: "id" });
      clips.createIndex("by-session", "sessionId");
      clips.createIndex("by-created", "createdAt");
      db.createObjectStore("sessions", { keyPath: "id" });
      const vlogs = db.createObjectStore("vlogs", { keyPath: "id" });
      vlogs.createIndex("by-created", "createdAt");
    };
    const db = await requestToPromise(request);
    const tx = db.transaction(["clips", "sessions", "vlogs"], "readwrite");
    const legacyClip = clip({
      thumbnailBlob: new Blob(["clip-thumb"], { type: "image/webp" }),
      thumbnailMimeType: "image/webp",
      thumbnailWidth: 256,
      thumbnailHeight: 256,
    });
    const legacyVlog = vlog("vlog-legacy", "2026-05-27T12:00:00.000Z");
    tx.objectStore("clips").put(legacyClip);
    tx.objectStore("sessions").put({
      id: legacyClip.sessionId,
      startedAt: "2026-05-27T09:00:00.000Z",
      updatedAt: "2026-05-27T12:00:00.000Z",
      generatedVlogId: legacyVlog.id,
    });
    tx.objectStore("vlogs").put({
      ...legacyVlog,
      thumbnailBlob: new Blob(["vlog-thumb"], { type: "image/webp" }),
      thumbnailMimeType: "image/webp",
      thumbnailWidth: 360,
      thumbnailHeight: 640,
    });
    await transactionDone(tx);
    db.close();

    const clips = await listClips(legacyClip.sessionId);
    const summaries = await listVlogSummaries();
    const fullVlog = await getVlog(legacyVlog.id);

    expect(clips[0]?.blob).toBeDefined();
    expect(clips[0]?.thumbnailBlob).toBeDefined();
    expect("blob" in summaries[0]!).toBe(false);
    expect(summaries[0]?.thumbnailBlob).toBeDefined();
    expect(fullVlog?.blob).toBeDefined();
    expect((await getOrCreateSession(legacyClip.sessionId)).generatedVlogId).toBe(legacyVlog.id);

    const rawClip = await getRawStoreRecord<Record<string, unknown>>("clips", legacyClip.id);
    const rawVlog = await getRawStoreRecord<Record<string, unknown>>("vlogs", legacyVlog.id);
    expect(rawClip?.blob).toBeUndefined();
    expect(rawVlog?.blob).toBeUndefined();
  });

  it("deletes vlog metadata, media, thumbnails, and generated session references", async () => {
    const saved = vlog("vlog-delete", "2026-05-27T11:00:00.000Z");
    await saveVlog(saved);
    await saveVlogThumbnail(saved.id, {
      thumbnailBlob: new Blob(["thumb"], { type: "image/webp" }),
      thumbnailMimeType: "image/webp",
      thumbnailWidth: 360,
      thumbnailHeight: 640,
    });

    await deleteVlog(saved.id);

    expect(await getRawStoreRecord("vlogs", saved.id)).toBeUndefined();
    expect(await getRawStoreRecord("vlog-media", saved.id)).toBeUndefined();
    expect(await getRawStoreRecord("vlog-thumbnails", saved.id)).toBeUndefined();
    expect((await getOrCreateTodaySession()).generatedVlogId).toBeUndefined();
  });
});
