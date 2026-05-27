export type ClipRecord = {
  id: string;
  sessionId: string;
  blob: Blob;
  mimeType: string;
  thumbnailBlob?: Blob;
  thumbnailMimeType?: string;
  thumbnailWidth?: number;
  thumbnailHeight?: number;
  durationMs: number;
  order?: number;
  createdAt: string;
  size: number;
};

export type VlogRecord = {
  id: string;
  sessionId: string;
  blob: Blob;
  mimeType: string;
  thumbnailBlob?: Blob;
  thumbnailMimeType?: string;
  thumbnailWidth?: number;
  thumbnailHeight?: number;
  clipCount: number;
  title: string;
  caption: string;
  createdAt: string;
  needsAction?: boolean;
};

export type SessionSummary = {
  id: string;
  startedAt: string;
  updatedAt: string;
  generatedVlogId?: string;
};
