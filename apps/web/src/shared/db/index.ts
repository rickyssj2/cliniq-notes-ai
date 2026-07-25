import Dexie, { type EntityTable } from "dexie";

export type MutationQueueItem = {
  id?: number;
  clientMutationId: string;
  noteId: string;
  type: "create_version" | "transition";
  payload: unknown;
  baseVersionId?: string;
  status: "pending" | "in_flight" | "failed";
  attempts: number;
  createdAt: string;
  lastError?: string;
};

export type TelemetryParkItem = {
  id?: number;
  batchId: string;
  events: unknown[];
  attempts: number;
  createdAt: string;
  lastError?: string;
};

class SoulsideDb extends Dexie {
  mutationQueue!: EntityTable<MutationQueueItem, "id">;
  telemetryPark!: EntityTable<TelemetryParkItem, "id">;

  constructor() {
    super("soulside");
    this.version(1).stores({
      mutationQueue:
        "++id, clientMutationId, noteId, status, createdAt, [status+createdAt]",
      telemetryPark: "++id, batchId, createdAt",
    });
  }
}

export const db = new SoulsideDb();
