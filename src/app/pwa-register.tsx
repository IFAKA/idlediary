"use client";

import { useEffect } from "react";
import { addDebugEvent } from "@/features/errors/debug-store";
import { reportError } from "@/features/errors/report-error";

const offlineCacheVersion = process.env.NEXT_PUBLIC_OFFLINE_CACHE_VERSION ?? "local";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV === "development") {
      return;
    }

    navigator.serviceWorker
      .register(`/sw.js?v=${encodeURIComponent(offlineCacheVersion)}`, {
        updateViaCache: "none",
      })
      .then((registration) => {
        addDebugEvent("service-worker-registered", "pwa", {
          offlineCacheVersion,
        });
        return registration.update();
      })
      .catch((error) => reportError(error, { area: "pwa" }));
  }, []);

  return null;
}
