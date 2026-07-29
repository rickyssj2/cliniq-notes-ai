import { useEffect } from "react";
import { useLocation } from "react-router";
import {
  mintCorrelationId,
  runWithCorrelation,
} from "@shared/correlation";
import { track } from "@shared/telemetry";

/** Emit page.view on route changes (redacted path only). */
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
  }, [location.pathname, location.search]);
}
