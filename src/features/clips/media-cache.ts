import type { ClipRecord, VlogRecord } from "./types";

type CacheEntry = {
  version: string;
  url: string;
};

const clipUrls = new Map<string, CacheEntry>();
const vlogUrls = new Map<string, CacheEntry>();

function clipVersion(clip: ClipRecord) {
  return `${clip.size}:${clip.createdAt}`;
}

function vlogVersion(vlog: VlogRecord) {
  return `${vlog.blob.size}:${vlog.createdAt}`;
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

export function releaseClipObjectUrl(clipId: string) {
  const cached = clipUrls.get(clipId);
  revoke(cached);
  clipUrls.delete(clipId);
}

export function releaseAllClipObjectUrls() {
  for (const entry of clipUrls.values()) {
    revoke(entry);
  }
  clipUrls.clear();
}

export function retainClipObjectUrls(clipIds: string[]) {
  const keep = new Set(clipIds);
  for (const clipId of clipUrls.keys()) {
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

export function releaseVlogObjectUrl(vlogId: string) {
  const cached = vlogUrls.get(vlogId);
  revoke(cached);
  vlogUrls.delete(vlogId);
}

export function releaseAllVlogObjectUrls() {
  for (const entry of vlogUrls.values()) {
    revoke(entry);
  }
  vlogUrls.clear();
}

export function retainVlogObjectUrl(vlogId: string | null) {
  for (const id of vlogUrls.keys()) {
    if (id !== vlogId) {
      releaseVlogObjectUrl(id);
    }
  }
}
