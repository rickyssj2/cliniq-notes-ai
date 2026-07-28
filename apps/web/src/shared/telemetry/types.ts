export type TelemetryProps = Record<string, unknown>;

export type TrackOptions = {
  /** Flush sooner / prefer keepalive on unload. */
  important?: boolean;
};

export type TelemetryEvent = {
  id: string;
  name: string;
  props: TelemetryProps;
  important: boolean;
  at: string;
};

export type TelemetryStats = {
  buffered: number;
  flushedEvents: number;
  flushedBatches: number;
  parkedBatches: number;
  failedAttempts: number;
  lastFlushAt: string | null;
  lastError: string | null;
  lastBatchId: string | null;
};
