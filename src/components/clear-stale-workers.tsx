"use client";

import { useEffect } from "react";

/** Entfernt Service Worker von ET2/E2, die auf demselben localhost:3000 registriert sind. */
export function ClearStaleWorkers() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const reg of regs) void reg.unregister();
    });
    if (typeof caches === "undefined") return;
    void caches.keys().then((keys) => {
      for (const key of keys) void caches.delete(key);
    });
  }, []);
  return null;
}
