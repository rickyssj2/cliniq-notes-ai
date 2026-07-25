import { Link } from "react-router";
import { NOTE_STATUSES, ROLES } from "@soulside/domain";

export function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm font-medium tracking-[0.18em] text-[var(--muted)] uppercase">
        Soulside AI
      </p>
      <h1 className="text-4xl font-semibold tracking-tight text-[var(--foreground)]">
        Clinical notes
      </h1>
      <p className="max-w-2xl text-base text-[var(--muted)]">
        Phases 0–2 are in place: FSD shell, pure note state machine ({NOTE_STATUSES.length}{" "}
        statuses / {ROLES.length} roles), and a mock API with WebSocket. Use the API Lab
        to exercise the backend from the browser.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          to="/lab"
          className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-foreground)]"
        >
          Open API Lab
        </Link>
        <a
          href="/api/health"
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--card)] px-4 text-sm font-medium"
        >
          API health
        </a>
      </div>
    </main>
  );
}
