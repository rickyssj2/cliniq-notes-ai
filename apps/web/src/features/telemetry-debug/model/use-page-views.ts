import { useEffect } from "react";
import { useLocation } from "react-router";
import { track } from "@shared/telemetry";

/** Emit page.view on route changes (redacted path only). */
export function useTelemetryPageViews() {
  const location = useLocation();
  useEffect(() => {
    track("page.view", {
      path: location.pathname,
      searchKeys: [...new URLSearchParams(location.search).keys()],
    });
  }, [location.pathname, location.search]);
}
