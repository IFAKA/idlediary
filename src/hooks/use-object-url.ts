"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

export function useObjectUrl(blob: Blob | null) {
  const srcRef = useRef<string | null>(null);
  const getSnapshot = useCallback(() => srcRef.current, []);

  const subscribe = useCallback(
    (notify: () => void) => {
      if (!blob) {
        srcRef.current = null;
        notify();
        return () => undefined;
      }

      const nextSrc = URL.createObjectURL(blob);
      srcRef.current = nextSrc;
      notify();

      return () => {
        if (srcRef.current === nextSrc) {
          srcRef.current = null;
        }
        URL.revokeObjectURL(nextSrc);
      };
    },
    [blob],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
