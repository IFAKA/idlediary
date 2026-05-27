"use client";

import { useSyncExternalStore } from "react";
import { AppViewportShell } from "@/components/app-viewport-shell";
import { CaptureScreen } from "@/features/capture/capture-screen";
import { FirstLaunchIntro } from "./first-launch-intro";

const INTRO_SEEN_KEY = "idlediary:intro-seen";
const INTRO_SEEN_CHANGE_EVENT = "idlediary:intro-seen-change";

function introSeenSnapshot() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(INTRO_SEEN_KEY) === "true";
}

function subscribeToIntroSeen(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(INTRO_SEEN_CHANGE_EVENT, listener);

  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(INTRO_SEEN_CHANGE_EVENT, listener);
  };
}

function markIntroSeen() {
  window.localStorage.setItem(INTRO_SEEN_KEY, "true");
  window.dispatchEvent(new Event(INTRO_SEEN_CHANGE_EVENT));
}

export function RecordRootScreen() {
  const introSeen = useSyncExternalStore(
    subscribeToIntroSeen,
    introSeenSnapshot,
    () => false,
  );

  if (introSeen) {
    return <CaptureScreen />;
  }

  return (
    <AppViewportShell>
      <FirstLaunchIntro onStart={markIntroSeen} />
    </AppViewportShell>
  );
}
