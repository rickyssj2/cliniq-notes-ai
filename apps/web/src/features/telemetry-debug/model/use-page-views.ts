import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import {
  mintCorrelationId,
  runWithCorrelation,
} from "@shared/correlation";
import { flush, track } from "@shared/telemetry";

/** Emit page.view on route changes and flush the batch (session boundary). */
export function useTelemetryPageViews() {
  const location = useLocation();
  const prevPath = useRef<string | null>(null);

  useEffect(() => {
    const correlationId = mintCorrelationId("page");
    runWithCorrelation(correlationId, () => {
      track("page.view", {
        path: location.pathname,
        searchKeys: [...new URLSearchParams(location.search).keys()],
      });
    });

    // Flush on navigation (and initial mount) so route changes are a session boundary.
    const key = `${location.pathname}?${location.search}`;
    if (prevPath.current !== key) {
      prevPath.current = key;
      void flush("route");
    }
  }, [location.pathname, location.search]);
}
