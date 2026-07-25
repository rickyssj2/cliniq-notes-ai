import { NOTE_STATUSES, ROLES } from "@soulside/domain";
import { Button } from "@shared/ui/button";
import { config } from "@shared/config";

export function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm font-medium tracking-[0.18em] text-[var(--muted)] uppercase">
        Soulside AI
      </p>
      <h1 className="text-4xl font-semibold tracking-tight text-[var(--foreground)]">
        Clinical notes scaffold
      </h1>
      <p className="max-w-2xl text-base text-[var(--muted)]">
        Phase 0 is live: FSD web app, Hono API proxy, Dexie stub, shared domain
        contracts, and baseline UI primitives. Statuses: {NOTE_STATUSES.length}.
        Roles: {ROLES.length}.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          onClick={() => {
            window.open(`${config.apiBaseUrl}/health`, "_blank", "noopener,noreferrer");
          }}
        >
          Check API health
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            window.location.reload();
          }}
        >
          Reload shell
        </Button>
      </div>
    </main>
  );
}
