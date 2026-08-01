import { useEffect } from "react";
import { Link } from "react-router";
import { useActor } from "@entities/user";
import { useDemoControlsStore } from "@features/demo-controls";
import { Button } from "@shared/ui/button";
import {
  DevThrowRenderButton,
  requestDevThrow,
} from "@shared/ui/dev-throw-render-button";

export function HomePage() {
  const actor = useActor();
  const register = useDemoControlsStore((s) => s.register);
  const clear = useDemoControlsStore((s) => s.clear);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    register([
      {
        id: "throw-home",
        label: "Throw page render error",
        onClick: () => requestDevThrow("home-page"),
      },
      {
        id: "unhandled",
        label: "Fire unhandled rejection",
        onClick: () => {
          void Promise.reject(
            new Error("Dev: intentional unhandled rejection"),
          );
        },
      },
    ]);
    return () => clear();
  }, [register, clear]);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <DevThrowRenderButton
        id="home-page"
        hidden
        message="Dev: intentional render crash"
      />
      <p className="text-sm font-medium tracking-[0.18em] text-(--muted) uppercase">
        Soulside AI
      </p>
      <h1 className="text-4xl font-semibold tracking-tight text-(--foreground)">
        Clinical notes
      </h1>
      <p className="max-w-2xl text-base text-(--muted)">
        Signed in as <strong>{actor.displayName}</strong> ({actor.role}). Use the
        header avatar to change roles and watch nav + route guards update.
      </p>
      <ul className="space-y-2 text-sm text-(--muted)">
        <li>
          <Link
            className="text-(--accent) underline-offset-4 hover:underline"
            to="/notes"
          >
            Notes
          </Link>{" "}
          — all roles; filter by status for review work
        </li>
        <li>
          <Link
            className="text-(--accent) underline-offset-4 hover:underline"
            to="/admin"
          >
            Admin
          </Link>{" "}
          — ADMIN only
        </li>
      </ul>
      {import.meta.env.DEV ? (
        <p className="border-t border-(--border) pt-6 text-xs text-(--muted)">
          Dev demos live in the bottom-left{" "}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mx-1 inline-flex"
            onClick={() =>
              window.dispatchEvent(new Event("soulside:toggle-demo"))
            }
          >
            Demo · D
          </Button>{" "}
          bar. Press <kbd className="font-mono">?</kbd> for shortcuts ·{" "}
          <kbd className="font-mono">T</kbd> telemetry.
        </p>
      ) : null}
    </div>
  );
}
