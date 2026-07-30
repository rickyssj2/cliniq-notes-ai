/** Lightweight Suspense fallback for lazy routes / deferred hosts. */
export function PageFallback({ label = "Loading" }: { label?: string }) {
  return (
    <div
      className="mx-auto flex max-w-6xl items-center justify-center px-6 py-24"
      role="status"
      aria-live="polite"
    >
      <p className="text-sm text-(--muted)">{label}…</p>
    </div>
  );
}
