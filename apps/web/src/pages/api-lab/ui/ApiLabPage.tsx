import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import type {
  CursorPage,
  NoteDetail,
  NoteStatus,
  NoteSummary,
} from "@soulside/domain";
import { NOTE_STATUSES } from "@soulside/domain";
import { ApiError, apiFetch } from "@shared/api";
import { config } from "@shared/config";
import { Button } from "@shared/ui/button";

type LogEntry = {
  id: string;
  at: string;
  kind: "http" | "ws" | "info" | "error";
  message: string;
};

function mutationId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function ApiLabPage() {
  const [seedCount, setSeedCount] = useState(500);
  const [statusFilter, setStatusFilter] = useState<NoteStatus | "">("READY_FOR_REVIEW");
  const [actorId, setActorId] = useState("dr_a");
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<NoteDetail | null>(null);
  const [storeInfo, setStoreInfo] = useState<unknown>(null);
  const [chaos, setChaos] = useState<{ enabled: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  const pushLog = useCallback((kind: LogEntry["kind"], message: string) => {
    setLog((prev) =>
      [
        {
          id: crypto.randomUUID(),
          at: new Date().toLocaleTimeString(),
          kind,
          message,
        },
        ...prev,
      ].slice(0, 80),
    );
  }, []);

  const run = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      setBusy(true);
      try {
        await fn();
        pushLog("http", label);
      } catch (err) {
        if (err instanceof ApiError) {
          pushLog("error", `${label} → ${err.status} ${JSON.stringify(err.body)}`);
        } else {
          pushLog("error", `${label} → ${(err as Error).message}`);
        }
      } finally {
        setBusy(false);
      }
    },
    [pushLog],
  );

  const refreshInfo = useCallback(async () => {
    const [{ data: info }, { data: chaosData }] = await Promise.all([
      apiFetch<unknown>("/dev/info"),
      apiFetch<{ enabled: boolean }>("/dev/chaos"),
    ]);
    setStoreInfo(info);
    setChaos(chaosData);
  }, []);

  const loadNotes = useCallback(async () => {
    const params = new URLSearchParams({ limit: "20", sort: "updatedAt", order: "desc" });
    if (statusFilter) params.set("status", statusFilter);
    const { data } = await apiFetch<CursorPage<NoteSummary>>(`/notes?${params}`);
    setNotes(data.items);
    pushLog("http", `Listed ${data.items.length} / ${data.meta.total} notes`);
  }, [pushLog, statusFilter]);

  const openNote = useCallback(
    async (id: string) => {
      setSelectedId(id);
      const { data } = await apiFetch<NoteDetail>(`/notes/${id}`);
      setDetail(data);
      pushLog("http", `Opened ${id} (${data.status})`);

      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "subscribe",
            noteIds: [id],
            user: { id: actorId, displayName: actorId, role: "REVIEWER" },
          }),
        );
        ws.send(
          JSON.stringify({
            type: "presence.join",
            noteId: id,
            user: { id: actorId, displayName: actorId, role: "REVIEWER" },
          }),
        );
      }
    },
    [actorId, pushLog],
  );

  const connectWs = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    const ws = new WebSocket(config.wsUrl);
    wsRef.current = ws;
    ws.onopen = () => {
      setWsConnected(true);
      pushLog("ws", `Connected ${config.wsUrl}`);
    };
    ws.onclose = () => {
      setWsConnected(false);
      pushLog("ws", "Disconnected");
    };
    ws.onerror = () => pushLog("error", "WebSocket error");
    ws.onmessage = (evt) => {
      pushLog("ws", String(evt.data));
    };
  }, [pushLog]);

  useEffect(() => {
    void run("Load store info", refreshInfo);
    return () => {
      wsRef.current?.close();
    };
  }, [refreshInfo, run]);

  const statusCounts = useMemo(() => {
    if (!storeInfo || typeof storeInfo !== "object") return null;
    const statuses = (storeInfo as { statuses?: Record<string, number> }).statuses;
    return statuses ?? null;
  }, [storeInfo]);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="text-sm font-medium tracking-[0.18em] text-[var(--muted)] uppercase">
            Phase 2 · API Lab
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Backend playground</h1>
          <p className="max-w-2xl text-sm text-[var(--muted)]">
            Exercise seed, list, transitions, version conflicts, chaos, and the
            WebSocket feed from the browser — no curl required.
          </p>
        </div>
        <Link
          to="/"
          className="text-sm text-[var(--accent)] underline-offset-4 hover:underline"
        >
          ← Home
        </Link>
      </header>

      <section className="grid gap-4 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 md:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold tracking-wide uppercase">Store</h2>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              Seed count
              <input
                type="number"
                min={1}
                max={100000}
                value={seedCount}
                onChange={(e) => setSeedCount(Number(e.target.value))}
                className="mt-1 block w-28 rounded border border-[var(--border)] bg-white px-2 py-1"
              />
            </label>
            <Button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(`Seed ${seedCount}`, async () => {
                  await apiFetch("/dev/seed", {
                    method: "POST",
                    body: JSON.stringify({ count: seedCount, seed: 42 }),
                  });
                  await refreshInfo();
                  await loadNotes();
                })
              }
            >
              Seed
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void run("Refresh info", refreshInfo)}
            >
              Refresh info
            </Button>
          </div>
          {statusCounts && (
            <div className="flex flex-wrap gap-2 text-xs text-[var(--muted)]">
              {NOTE_STATUSES.map((s) => (
                <span
                  key={s}
                  className="rounded border border-[var(--border)] px-2 py-1"
                >
                  {s}: {statusCounts[s] ?? 0}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold tracking-wide uppercase">Chaos & WS</h2>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run("Toggle chaos", async () => {
                  const next = !(chaos?.enabled ?? true);
                  const { data } = await apiFetch<{ enabled: boolean }>("/dev/chaos", {
                    method: "POST",
                    body: JSON.stringify({ enabled: next }),
                  });
                  setChaos(data);
                  pushLog("info", `Chaos ${data.enabled ? "ON" : "OFF"}`);
                })
              }
            >
              Chaos: {chaos?.enabled ? "ON" : "OFF"}
            </Button>
            <Button
              type="button"
              variant={wsConnected ? "outline" : "default"}
              onClick={() => (wsConnected ? wsRef.current?.close() : connectWs())}
            >
              {wsConnected ? "Disconnect WS" : "Connect WS"}
            </Button>
          </div>
          <p className="text-xs text-[var(--muted)]">
            Tip: turn chaos OFF for predictable demos, then ON to see latency/500s.
          </p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              Status filter
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as NoteStatus | "")
                }
                className="mt-1 block rounded border border-[var(--border)] bg-white px-2 py-1"
              >
                <option value="">All</option>
                {NOTE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Actor
              <select
                value={actorId}
                onChange={(e) => setActorId(e.target.value)}
                className="mt-1 block rounded border border-[var(--border)] bg-white px-2 py-1"
              >
                <option value="dr_a">dr_a (REVIEWER)</option>
                <option value="dr_b">dr_b (REVIEWER)</option>
                <option value="usr_clin_001">usr_clin_001 (CLINICIAN)</option>
                <option value="usr_adm_001">usr_adm_001 (ADMIN)</option>
              </select>
            </label>
            <Button
              type="button"
              disabled={busy}
              onClick={() => void run("List notes", loadNotes)}
            >
              List notes
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run("Pick ready note", async () => {
                  const { data } = await apiFetch<NoteSummary>("/dev/ready-note");
                  await openNote(data.id);
                  await loadNotes();
                })
              }
            >
              Pick READY note
            </Button>
          </div>

          <ul className="max-h-80 overflow-auto divide-y divide-[var(--border)] text-sm">
            {notes.length === 0 && (
              <li className="py-6 text-[var(--muted)]">
                No notes loaded yet — Seed, then List notes.
              </li>
            )}
            {notes.map((note) => (
              <li key={note.id}>
                <button
                  type="button"
                  className={`flex w-full items-center justify-between gap-3 px-2 py-2 text-left hover:bg-black/5 ${
                    selectedId === note.id ? "bg-teal-50" : ""
                  }`}
                  onClick={() => void run(`Open ${note.id}`, () => openNote(note.id))}
                >
                  <span>
                    <span className="font-medium">{note.patient.displayName}</span>
                    <span className="ml-2 text-xs text-[var(--muted)]">{note.id}</span>
                  </span>
                  <span className="text-xs tracking-wide text-[var(--muted)]">
                    {note.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="text-sm font-semibold tracking-wide uppercase">Selected note</h2>
          {!detail && (
            <p className="text-sm text-[var(--muted)]">
              Select a note to run transitions and version saves.
            </p>
          )}
          {detail && (
            <>
              <div className="space-y-1 text-sm">
                <p>
                  <strong>{detail.patient.displayName}</strong> · {detail.id}
                </p>
                <p>
                  Status: <code>{detail.status}</code>
                </p>
                <p>
                  Head: <code>{detail.currentVersion.id}</code> r
                  {detail.currentVersion.revision}
                </p>
                <p>
                  Reviewer:{" "}
                  {detail.assignedReviewer
                    ? `${detail.assignedReviewer.displayName} (${detail.assignedReviewer.id})`
                    : "—"}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={busy || detail.status !== "READY_FOR_REVIEW"}
                  onClick={() =>
                    void run("Start review", async () => {
                      await apiFetch(`/notes/${detail.id}/transitions`, {
                        method: "POST",
                        body: JSON.stringify({
                          to: "IN_REVIEW",
                          actorId,
                          clientMutationId: mutationId("start"),
                        }),
                      });
                      await openNote(detail.id);
                    })
                  }
                >
                  Start review
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || detail.status !== "IN_REVIEW"}
                  onClick={() =>
                    void run("Save version", async () => {
                      await apiFetch(`/notes/${detail.id}/versions`, {
                        method: "POST",
                        body: JSON.stringify({
                          baseVersionId: detail.currentVersion.id,
                          clientMutationId: mutationId("ver"),
                          actorId,
                          content: {
                            sections: {
                              S: `${detail.currentVersion.content.sections.S}\n[edit ${new Date().toISOString()}]`,
                              O: detail.currentVersion.content.sections.O,
                              A: detail.currentVersion.content.sections.A,
                              P: detail.currentVersion.content.sections.P,
                            },
                          },
                        }),
                      });
                      await openNote(detail.id);
                    })
                  }
                >
                  Save version
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || detail.status !== "IN_REVIEW"}
                  onClick={() =>
                    void run("Force conflict (stale base)", async () => {
                      try {
                        await apiFetch(`/notes/${detail.id}/versions`, {
                          method: "POST",
                          body: JSON.stringify({
                            baseVersionId: "ver_stale_base",
                            clientMutationId: mutationId("conflict"),
                            actorId,
                            content: {
                              sections: { S: "x", O: "x", A: "x", P: "x" },
                            },
                          }),
                        });
                      } catch (err) {
                        if (err instanceof ApiError && err.status === 409) {
                          pushLog(
                            "info",
                            `409 conflict payload: ${JSON.stringify(err.body)}`,
                          );
                          return;
                        }
                        throw err;
                      }
                    })
                  }
                >
                  Force 409 conflict
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy || detail.status !== "IN_REVIEW"}
                  onClick={() =>
                    void run("Approve", async () => {
                      await apiFetch(`/notes/${detail.id}/transitions`, {
                        method: "POST",
                        body: JSON.stringify({
                          to: "APPROVED",
                          actorId,
                          mfaVerified: true,
                          clientMutationId: mutationId("approve"),
                        }),
                      });
                      await openNote(detail.id);
                    })
                  }
                >
                  Approve
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || detail.status !== "IN_REVIEW"}
                  onClick={() =>
                    void run("Reject", async () => {
                      await apiFetch(`/notes/${detail.id}/transitions`, {
                        method: "POST",
                        body: JSON.stringify({
                          to: "REJECTED",
                          actorId,
                          reason: "missing plan",
                          clientMutationId: mutationId("reject"),
                        }),
                      });
                      await openNote(detail.id);
                    })
                  }
                >
                  Reject
                </Button>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide uppercase">Event log</h2>
          <Button type="button" size="sm" variant="ghost" onClick={() => setLog([])}>
            Clear
          </Button>
        </div>
        <ol className="max-h-64 space-y-1 overflow-auto font-mono text-xs">
          {log.length === 0 && (
            <li className="text-[var(--muted)]">Actions and WS messages appear here.</li>
          )}
          {log.map((entry) => (
            <li
              key={entry.id}
              className={
                entry.kind === "error"
                  ? "text-[var(--danger)]"
                  : entry.kind === "ws"
                    ? "text-teal-800"
                    : "text-[var(--foreground)]"
              }
            >
              <span className="text-[var(--muted)]">[{entry.at}]</span> {entry.message}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
