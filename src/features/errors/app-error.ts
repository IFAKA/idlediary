export type AppErrorArea =
  | "capture"
  | "storage"
  | "generation"
  | "share"
  | "pwa"
  | "ai"
  | "unknown";

export type AppErrorCode =
  | "camera-permission-denied"
  | "camera-unavailable"
  | "recorder-unavailable"
  | "recording-failed"
  | "storage-read-failed"
  | "storage-write-failed"
  | "storage-delete-failed"
  | "generation-unavailable"
  | "generation-failed"
  | "share-unavailable"
  | "download-failed"
  | "unknown";

export type AppErrorContext = Record<string, unknown>;

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly area: AppErrorArea;
  readonly userMessage: string;
  readonly context: AppErrorContext;
  readonly timestamp: string;
  readonly correlationId: string;
  override readonly cause?: unknown;

  constructor(input: {
    code: AppErrorCode;
    area: AppErrorArea;
    message: string;
    userMessage: string;
    cause?: unknown;
    context?: AppErrorContext;
  }) {
    super(input.message);
    this.name = "AppError";
    this.code = input.code;
    this.area = input.area;
    this.userMessage = input.userMessage;
    this.context = input.context ?? {};
    this.timestamp = new Date().toISOString();
    this.correlationId = crypto.randomUUID();
    this.cause = input.cause;
  }
}

export function toAppError(
  error: unknown,
  fallback: Omit<ConstructorParameters<typeof AppError>[0], "cause">,
) {
  if (error instanceof AppError) {
    return error;
  }

  return new AppError({
    ...fallback,
    message:
      error instanceof Error && error.message ? error.message : fallback.message,
    cause: error,
  });
}

export function redactContext(context: AppErrorContext) {
  const blockedKeys = ["blob", "file", "stream", "token", "secret", "password"];

  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => {
      if (blockedKeys.some((blocked) => key.toLowerCase().includes(blocked))) {
        return [key, "[redacted]"];
      }
      if (value instanceof Blob) {
        return [key, `[blob:${value.type || "unknown"}:${value.size}]`];
      }
      return [key, value];
    }),
  );
}
