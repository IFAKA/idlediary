"use client";

import { useEffect } from "react";
import { addDebugEvent } from "@/features/errors/debug-store";
import { reportError } from "@/features/errors/report-error";

const offlineCacheVersion = process.env.NEXT_PUBLIC_OFFLINE_CACHE_VERSION ?? "local";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    if (process.env.NODE_ENV === "development") {
      void removeDevelopmentServiceWorkers();
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

async function removeDevelopmentServiceWorkers() {
  try {
    const hadController = navigator.serviceWorker.controller !== null;
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));

    if ("caches" in window) {
      const cacheNames = await window.caches.keys();
      await Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith("idlediary-"))
          .map((cacheName) => window.caches.delete(cacheName)),
      );
    }

    if (registrations.length > 0) {
      addDebugEvent("service-worker-removed-development", "pwa", {
        registrations: registrations.length,
        reloading: hadController,
      });
    }

    if (hadController && sessionStorage.getItem("idlediary-dev-sw-reload") !== "done") {
      sessionStorage.setItem("idlediary-dev-sw-reload", "done");
      window.location.reload();
    }
  } catch (error) {
    reportError(error, { area: "pwa" });
  }
}
