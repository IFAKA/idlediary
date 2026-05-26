export type ClipRecord = {
  id: string;
  sessionId: string;
  blob: Blob;
  mimeType: string;
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
  clipCount: number;
  title: string;
  caption: string;
  createdAt: string;
};

export type SessionSummary = {
  id: string;
  startedAt: string;
  updatedAt: string;
  generatedVlogId?: string;
};
