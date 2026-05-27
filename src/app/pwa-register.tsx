"use client";

import { useEffect } from "react";
import { addDebugEvent } from "@/features/errors/debug-store";
import { reportError } from "@/features/errors/report-error";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV === "development") {
      return;
    }

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        addDebugEvent("service-worker-registered", "pwa");
        return registration.update();
      })
      .catch((error) => reportError(error, { area: "pwa" }));
  }, []);

  return null;
}
