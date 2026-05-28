import { AppError } from "@/features/errors/app-error";

const preferredTypes = [
  'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a.40.2",
];

const audioBitsPerSecond = 192_000;

export function supportedRecordingMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }
  return preferredTypes.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function recorderOptions(stream: MediaStream, mimeType?: string): MediaRecorderOptions {
  return {
    ...(mimeType ? { mimeType } : {}),
    ...(stream.getAudioTracks().length > 0 ? { audioBitsPerSecond } : {}),
  };
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
    return new MediaRecorder(stream, recorderOptions(stream, mimeType));
  }

  throw new AppError({
    code: "recorder-unavailable",
    area: "capture",
    message: "MediaRecorder cannot produce MP4/H.264/AAC clips",
    userMessage: "This device cannot record compatible MP4 video here.",
    context: { userAgent: navigator.userAgent },
  });
}
