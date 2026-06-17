"use client";

import { useEffect } from "react";

async function enterFullscreen() {
  if (document.fullscreenElement) return;
  try {
    await document.documentElement.requestFullscreen();
  } catch {
    // Blocked until user gesture on some browsers.
  }
}

async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      await navigator.wakeLock.request("screen");
    }
  } catch {
    // Unsupported or denied.
  }
}

/** Kiosk behavior for the public TV display: fullscreen, wake lock, no browser chrome. */
export function useDisplayKiosk() {
  useEffect(() => {
    void enterFullscreen();
    void requestWakeLock();

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void enterFullscreen();
        void requestWakeLock();
      }
    };

    const onFullscreenExit = () => {
      void enterFullscreen();
    };

    const onInteract = () => {
      void enterFullscreen();
    };

    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("fullscreenchange", onFullscreenExit);
    window.addEventListener("pointerdown", onInteract);
    window.addEventListener("keydown", onInteract);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("fullscreenchange", onFullscreenExit);
      window.removeEventListener("pointerdown", onInteract);
      window.removeEventListener("keydown", onInteract);
    };
  }, []);
}
