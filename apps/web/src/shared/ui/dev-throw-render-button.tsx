import { useEffect, useState } from "react";
import { Button } from "@shared/ui/button";

export const DEV_THROW_EVENT = "soulside:dev-throw";

function Boom({ message }: { message: string }): never {
  throw new Error(message);
}

/**
 * Dev-only control to verify nested error boundaries.
 * Trigger via click or `dispatchEvent(new CustomEvent(DEV_THROW_EVENT, { detail: { id } }))`.
 */
export function DevThrowRenderButton({
  id,
  label = "Throw render error",
  message = "Dev: intentional render crash (Phase 12)",
  hidden = false,
}: {
  id: string;
  label?: string;
  message?: string;
  /** When true, only an external event triggers the throw (no visible button). */
  hidden?: boolean;
}) {
  const [boom, setBoom] = useState(false);

  useEffect(() => {
    const onThrow = (e: Event) => {
      const detail = (e as CustomEvent<{ id?: string }>).detail;
      if (detail?.id === id) setBoom(true);
    };
    window.addEventListener(DEV_THROW_EVENT, onThrow);
    return () => window.removeEventListener(DEV_THROW_EVENT, onThrow);
  }, [id]);

  if (!import.meta.env.DEV) return null;
  if (boom) return <Boom message={message} />;
  if (hidden) return null;

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => setBoom(true)}
    >
      {label}
    </Button>
  );
}

export function requestDevThrow(id: string) {
  window.dispatchEvent(
    new CustomEvent(DEV_THROW_EVENT, { detail: { id } }),
  );
}
