export type CoalescedSaveStatus =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "error"
  | "conflict";

export type CoalescedSaver = {
  /** Debounce a save request (coalesces with in-flight). */
  schedule: () => void;
  /** Flush immediately (manual Save). */
  flushNow: () => Promise<void>;
  /** Cancel pending debounce (not in-flight). */
  cancel: () => void;
  getStatus: () => CoalescedSaveStatus;
  getLastError: () => string | null;
  subscribe: (listener: () => void) => () => void;
};

type SaveResult =
  | { ok: true }
  | { ok: false; kind: "conflict" | "error"; message: string };

/**
 * One in-flight POST per note; at most one queued follow-up.
 * Retries after 5xx reuse the same clientMutationId until success/conflict.
 */
export function createCoalescedSaver(opts: {
  debounceMs: number;
  mintMutationId: () => string;
  save: (clientMutationId: string) => Promise<SaveResult>;
  onStatus?: (status: CoalescedSaveStatus) => void;
}): CoalescedSaver {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let queued = false;
  let mutationId: string | null = null;
  let status: CoalescedSaveStatus = "idle";
  let lastError: string | null = null;
  const listeners = new Set<() => void>();

  const notify = () => {
    opts.onStatus?.(status);
    for (const l of listeners) l();
  };

  const setStatus = (next: CoalescedSaveStatus) => {
    status = next;
    notify();
  };

  const run = async () => {
    if (inFlight) {
      queued = true;
      return;
    }
    inFlight = true;
    if (!mutationId) mutationId = opts.mintMutationId();
    setStatus("saving");
    lastError = null;
    notify();

    try {
      const result = await opts.save(mutationId);
      if (result.ok) {
        mutationId = null;
        setStatus("saved");
      } else if (result.kind === "conflict") {
        mutationId = null;
        lastError = result.message;
        setStatus("conflict");
        queued = false;
      } else {
        lastError = result.message;
        setStatus("error");
        // Keep mutationId for idempotent retry on next flush.
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Save failed";
      setStatus("error");
    } finally {
      inFlight = false;
      if (queued) {
        queued = false;
        mutationId = opts.mintMutationId();
        await run();
      }
    }
  };

  return {
    schedule() {
      if (status !== "saving") {
        setStatus("dirty");
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void run();
      }, opts.debounceMs);
    },
    async flushNow() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await run();
    },
    cancel() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    getStatus: () => status,
    getLastError: () => lastError,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
