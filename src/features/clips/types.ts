export type ThumbnailFields = {
  thumbnailBlob?: Blob;
  thumbnailMimeType?: string;
  thumbnailWidth?: number;
  thumbnailHeight?: number;
};

export type ThumbnailMetadataFields = Omit<ThumbnailFields, "thumbnailBlob">;

export type ClipAnalysisRecord = {
  version: string;
  description: string;
  tags: string[];
  mood: string;
  energy: "low" | "medium";
  brightness: "dim" | "normal" | "bright";
  analyzedAt: string;
};

export type ClipMetadataRecord = ThumbnailMetadataFields & {
  id: string;
  sessionId: string;
  mimeType: string;
  durationMs: number;
  order?: number;
  createdAt: string;
  size: number;
  analysis?: ClipAnalysisRecord;
};

export type ClipRecord = ClipMetadataRecord &
  ThumbnailFields & {
    blob: Blob;
  };

export type VlogMetadataRecord = ThumbnailMetadataFields & {
  id: string;
  sessionId: string;
  mimeType: string;
  clipCount: number;
  title: string;
  caption: string;
  createdAt: string;
  needsAction?: boolean;
  size: number;
  generationFingerprint?: string;
};

export type VlogSummary = VlogMetadataRecord & ThumbnailFields;

export type VlogRecord = VlogSummary & {
  blob: Blob;
};

export type SessionSummary = {
  id: string;
  startedAt: string;
  updatedAt: string;
  generatedVlogId?: string;
};
