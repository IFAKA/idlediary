import type { ClipRecord, ThumbnailFields, VlogRecord, VlogSummary } from "./types";

type CacheEntry = {
  version: string;
  url: string;
};

const clipUrls = new Map<string, CacheEntry>();
const vlogUrls = new Map<string, CacheEntry>();
const clipThumbnailUrls = new Map<string, CacheEntry>();
const vlogThumbnailUrls = new Map<string, CacheEntry>();

function clipVersion(clip: ClipRecord) {
  return `${clip.size}:${clip.createdAt}`;
}

function vlogVersion(vlog: VlogRecord) {
  return `${vlog.blob.size}:${vlog.createdAt}`;
}

function thumbnailVersion(record: ThumbnailFields) {
  if (!record.thumbnailBlob) return null;

  return [
    record.thumbnailBlob.size,
    record.thumbnailMimeType ?? record.thumbnailBlob.type,
    record.thumbnailWidth ?? "",
    record.thumbnailHeight ?? "",
  ].join(":");
}

function revoke(entry: CacheEntry | undefined) {
  if (entry) URL.revokeObjectURL(entry.url);
}

export function getObjectUrlForClip(clip: ClipRecord) {
  const version = clipVersion(clip);
  const cached = clipUrls.get(clip.id);

  if (cached?.version === version) return cached.url;

  revoke(cached);
  const entry = {
    version,
    url: URL.createObjectURL(clip.blob),
  };
  clipUrls.set(clip.id, entry);
  return entry.url;
}

export function getThumbnailObjectUrlForClip(clip: ClipRecord) {
  if (!clip.thumbnailBlob) return null;
  const version = thumbnailVersion(clip);
  if (!version) return null;

  const cached = clipThumbnailUrls.get(clip.id);
  if (cached?.version === version) return cached.url;

  revoke(cached);
  const entry = {
    version,
    url: URL.createObjectURL(clip.thumbnailBlob),
  };
  clipThumbnailUrls.set(clip.id, entry);
  return entry.url;
}

export function releaseClipObjectUrl(clipId: string) {
  const cached = clipUrls.get(clipId);
  revoke(cached);
  clipUrls.delete(clipId);

  const cachedThumbnail = clipThumbnailUrls.get(clipId);
  revoke(cachedThumbnail);
  clipThumbnailUrls.delete(clipId);
}

export function releaseAllClipObjectUrls() {
  for (const entry of clipUrls.values()) {
    revoke(entry);
  }
  clipUrls.clear();
  for (const entry of clipThumbnailUrls.values()) {
    revoke(entry);
  }
  clipThumbnailUrls.clear();
}

export function retainClipObjectUrls(clipIds: string[]) {
  const keep = new Set(clipIds);
  for (const clipId of clipUrls.keys()) {
    if (!keep.has(clipId)) {
      releaseClipObjectUrl(clipId);
    }
  }
  for (const clipId of clipThumbnailUrls.keys()) {
    if (!keep.has(clipId)) {
      releaseClipObjectUrl(clipId);
    }
  }
}

export function getObjectUrlForVlog(vlog: VlogRecord) {
  const version = vlogVersion(vlog);
  const cached = vlogUrls.get(vlog.id);

  if (cached?.version === version) return cached.url;

  revoke(cached);
  const entry = {
    version,
    url: URL.createObjectURL(vlog.blob),
  };
  vlogUrls.set(vlog.id, entry);
  return entry.url;
}

export function getThumbnailObjectUrlForVlog(vlog: VlogSummary) {
  if (!vlog.thumbnailBlob) return null;
  const version = thumbnailVersion(vlog);
  if (!version) return null;

  const cached = vlogThumbnailUrls.get(vlog.id);
  if (cached?.version === version) return cached.url;

  revoke(cached);
  const entry = {
    version,
    url: URL.createObjectURL(vlog.thumbnailBlob),
  };
  vlogThumbnailUrls.set(vlog.id, entry);
  return entry.url;
}

export function releaseVlogObjectUrl(vlogId: string) {
  const cached = vlogUrls.get(vlogId);
  revoke(cached);
  vlogUrls.delete(vlogId);

  const cachedThumbnail = vlogThumbnailUrls.get(vlogId);
  revoke(cachedThumbnail);
  vlogThumbnailUrls.delete(vlogId);
}

export function releaseAllVlogObjectUrls() {
  for (const entry of vlogUrls.values()) {
    revoke(entry);
  }
  vlogUrls.clear();
  for (const entry of vlogThumbnailUrls.values()) {
    revoke(entry);
  }
  vlogThumbnailUrls.clear();
}

export function retainVlogObjectUrl(vlogId: string | null) {
  for (const id of vlogUrls.keys()) {
    if (id !== vlogId) {
      releaseVlogObjectUrl(id);
    }
  }
  for (const id of vlogThumbnailUrls.keys()) {
    if (id !== vlogId) {
      releaseVlogObjectUrl(id);
    }
  }
}
