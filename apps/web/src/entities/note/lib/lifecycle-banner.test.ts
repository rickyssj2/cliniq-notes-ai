import { describe, expect, it } from "vitest";
import { getLifecycleBanner } from "./lifecycle-banner";

describe("getLifecycleBanner", () => {
  it("explains LOCKED without requiring UI status branches", () => {
    expect(getLifecycleBanner("LOCKED")).toMatch(/LOCKED.*24h/i);
  });

  it("explains GENERATING", () => {
    expect(getLifecycleBanner("GENERATING")).toMatch(/generating/i);
  });

  it("stays quiet when the actor still has something to do", () => {
    expect(getLifecycleBanner("READY_FOR_REVIEW")).toBeNull();
    expect(getLifecycleBanner("IN_REVIEW")).toBeNull();
  });
});
