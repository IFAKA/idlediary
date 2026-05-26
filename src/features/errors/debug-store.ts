import { AppError, type AppErrorContext, redactContext } from "./app-error";

export type DebugEvent = {
  id: string;
  label: string;
  area: string;
  context: AppErrorContext;
  timestamp: string;
};

const events: DebugEvent[] = [];
const errors: AppError[] = [];
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function addDebugEvent(label: string, area: string, context: AppErrorContext = {}) {
  events.unshift({
    id: crypto.randomUUID(),
    label,
    area,
    context: redactContext(context),
    timestamp: new Date().toISOString(),
  });
  events.splice(40);
  notify();
}

export function addDebugError(error: AppError) {
  errors.unshift(error);
  errors.splice(20);
  notify();
}

export function getDebugSnapshot() {
  return {
    events: [...events],
    errors: errors.map((error) => ({
      name: error.name,
      code: error.code,
      area: error.area,
      message: error.message,
      userMessage: error.userMessage,
      context: redactContext(error.context),
      timestamp: error.timestamp,
      correlationId: error.correlationId,
    })),
    userAgent: typeof navigator === "undefined" ? "server" : navigator.userAgent,
    route: typeof location === "undefined" ? "server" : location.pathname,
    generatedAt: new Date().toISOString(),
  };
}

export function subscribeDebugStore(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
