import type { TelemetryProps } from "./types";

/** Keys that may contain clinical free text — never leave the client. */
const SENSITIVE_KEY =
  /^(content|sections?|text|body|draft|soap|subjective|objective|assessment|plan|noteText|[SOAP])$/i;

/**
 * Strip note free-text and other PII-ish values from telemetry props.
 * Keeps ids, statuses, counts, durations — never SOAP section strings.
 */
export function redactProps(props: TelemetryProps): TelemetryProps {
  const out: TelemetryProps = {};
  for (const [key, value] of Object.entries(props)) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = redactProps(value as TelemetryProps);
      continue;
    }
    if (typeof value === "string" && value.length > 200) {
      out[key] = "[redacted:long_string]";
      continue;
    }
    out[key] = value;
  }
  return out;
}
