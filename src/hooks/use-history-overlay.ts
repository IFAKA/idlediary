"use client";

import { useCallback, useEffect, useRef } from "react";

type HistoryOverlayOptions = {
  isOpen: boolean;
  name: string;
  onClose: () => void;
};

export function useHistoryOverlay({ isOpen, name, onClose }: HistoryOverlayOptions) {
  const hasHistoryEntry = useRef(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen || hasHistoryEntry.current) return;

    window.history.pushState({ idleDiaryOverlay: name }, "", window.location.href);
    hasHistoryEntry.current = true;
  }, [isOpen, name]);

  useEffect(() => {
    if (!isOpen) return;

    const onPopState = () => {
      hasHistoryEntry.current = false;
      onCloseRef.current();
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [isOpen]);

  const closeOverlay = useCallback(() => {
    if (hasHistoryEntry.current) {
      window.history.back();
      return;
    }

    onCloseRef.current();
  }, []);

  return closeOverlay;
}
