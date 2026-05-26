import { AppError, type AppErrorContext, redactContext, toAppError } from "./app-error";
import { addDebugError } from "./debug-store";

export function reportError(error: unknown, context: AppErrorContext = {}) {
  const appError =
    error instanceof AppError
      ? error
      : toAppError(error, {
          code: "unknown",
          area: "unknown",
          message: "Unexpected application error",
          userMessage: "Something did not work. Try again in a moment.",
          context,
        });

  const merged = new AppError({
    code: appError.code,
    area: appError.area,
    message: appError.message,
    userMessage: appError.userMessage,
    cause: appError.cause,
    context: { ...appError.context, ...context },
  });

  addDebugError(merged);

  if (process.env.NODE_ENV !== "production") {
    console.error("[IdleDiary]", {
      code: merged.code,
      area: merged.area,
      message: merged.message,
      userMessage: merged.userMessage,
      context: redactContext(merged.context),
      timestamp: merged.timestamp,
      correlationId: merged.correlationId,
    });
  }

  return merged;
}
