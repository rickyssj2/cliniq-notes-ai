import { describe, expect, it } from "vitest";
import { redactProps } from "./redact";

describe("redactProps", () => {
  it("redacts SOAP / content keys", () => {
    const out = redactProps({
      noteId: "note_1",
      status: "IN_REVIEW",
      content: { sections: { S: "patient said…" } },
      sections: { S: "secret" },
      S: "subjective text",
    });
    expect(out.noteId).toBe("note_1");
    expect(out.status).toBe("IN_REVIEW");
    expect(out.content).toBe("[redacted]");
    expect(out.sections).toBe("[redacted]");
    expect(out.S).toBe("[redacted]");
  });

  it("redacts nested sensitive keys and long strings", () => {
    const out = redactProps({
      meta: { draft: "should go", count: 2 },
      blurb: "x".repeat(250),
    });
    expect(out.meta).toEqual({ draft: "[redacted]", count: 2 });
    expect(out.blurb).toBe("[redacted:long_string]");
  });
});
