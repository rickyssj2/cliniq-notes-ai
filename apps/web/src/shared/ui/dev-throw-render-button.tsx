import { useState } from "react";
import { Button } from "@shared/ui/button";

function Boom({ message }: { message: string }): never {
  throw new Error(message);
}

/**
 * Dev-only control to verify nested error boundaries.
 * Render errors only — does not exercise window/Query reporters.
 */
export function DevThrowRenderButton({
  label = "Throw render error",
  message = "Dev: intentional render crash (Phase 12)",
}: {
  label?: string;
  message?: string;
}) {
  const [boom, setBoom] = useState(false);
  if (!import.meta.env.DEV) return null;
  if (boom) return <Boom message={message} />;

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
