import { useEffect } from "react";
import { useLocation } from "react-router";
import {
  mintCorrelationId,
  runWithCorrelation,
} from "@shared/correlation";
import { flush, track } from "@shared/telemetry";

/** Emit page.view on route changes and flush (session boundary). */
export function useTelemetryPageViews() {
  const location = useLocation();

  useEffect(() => {
    const correlationId = mintCorrelationId("page");
    runWithCorrelation(correlationId, () => {
      track("page.view", {
        path: location.pathname,
        searchKeys: [...new URLSearchParams(location.search).keys()],
      });
    });
    void flush("route");
  }, [location.pathname, location.search]);
}
