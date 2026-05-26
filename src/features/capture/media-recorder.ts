import { AppError } from "@/features/errors/app-error";

const preferredTypes = [
  'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export function supportedRecordingMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }
  return preferredTypes.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function canRecordBareMp4() {
  return MediaRecorder.isTypeSupported("video/mp4");
}

function videoOnlyStream(stream: MediaStream) {
  return new MediaStream(stream.getVideoTracks());
}

export function createRecorder(stream: MediaStream) {
  if (typeof MediaRecorder === "undefined") {
    throw new AppError({
      code: "recorder-unavailable",
      area: "capture",
      message: "MediaRecorder is unavailable in this browser",
      userMessage: "This browser cannot record video here.",
      context: { userAgent: navigator.userAgent },
    });
  }

  const mimeType = supportedRecordingMimeType();
  if (mimeType) {
    return new MediaRecorder(stream, { mimeType });
  }

  if (canRecordBareMp4() && stream.getVideoTracks().length > 0) {
    return new MediaRecorder(videoOnlyStream(stream), { mimeType: "video/mp4" });
  }

  return new MediaRecorder(stream);
}
