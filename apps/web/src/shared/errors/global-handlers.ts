import { reportError } from "./report";

let installed = false;
let lastAt = 0;
const THROTTLE_MS = 1_500;

function throttled(run: () => void) {
  const now = Date.now();
  if (now - lastAt < THROTTLE_MS) return;
  lastAt = now;
  run();
}

/**
 * Catch errors that React error boundaries cannot: event handlers,
 * async gaps, and unhandled promise rejections.
 */
export function installGlobalErrorHandlers() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    throttled(() => {
      reportError({
        source: "window",
        error: event.error ?? event.message,
        label: "window.onerror",
      });
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    throttled(() => {
      reportError({
        source: "unhandledrejection",
        error: event.reason,
        label: "unhandledrejection",
      });
    });
  });
}
