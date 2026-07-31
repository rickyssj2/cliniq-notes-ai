import { expect, test } from "@playwright/test";
import {
  acceptDialogs,
  claimReadyNote,
  resetApiChaos,
  setBrowserOffline,
  waitUntilSoapClean,
} from "./helpers";

/**
 * Assignment scenario: network drop while autosave queues intents, then
 * reconnect. Hard reload while offline cannot re-fetch Vite assets (no SW),
 * so we prove Dexie queue + client remount via history + drain (not a
 * literal 20‑minute sleep).
 */
test.describe("Offline queue", () => {
  test.afterEach(async () => {
    await resetApiChaos();
  });

  test("edit offline → remount via history → online drain keeps SOAP", async ({
    page,
    context,
  }) => {
    acceptDialogs(page);
    const noteUrl = await claimReadyNote(page, "Dr. A");
    const notePath = new URL(noteUrl).pathname;

    await setBrowserOffline(context, true);
    await expect(page.getByTitle("Browser reports offline")).toBeVisible({
      timeout: 10_000,
    });

    const stamp = Date.now();
    const text1 = `OFFLINE_Q1_${stamp}`;
    const text2 = `OFFLINE_Q2_${stamp}`;

    await page.getByLabel(/Subjective/i).fill(text1);
    await page.getByLabel(/Subjective/i).fill(text2);

    await expect
      .poll(
        async () => {
          const queued = page.getByText(/queued/i);
          const saveQueued = page.getByRole("button", { name: /Queued/i });
          return (await queued.count()) + (await saveQueued.count());
        },
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);

    // Soft remount without list refetch: leave detail, then pushState back.
    await page.getByRole("link", { name: "← Notes" }).click();
    await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible({
      timeout: 15_000,
    });
    await page.evaluate((path) => {
      window.history.pushState({}, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, notePath);

    await expect(page.getByLabel(/Subjective/i)).toBeVisible({
      timeout: 20_000,
    });
    await expect
      .poll(async () => page.getByLabel(/Subjective/i).inputValue(), {
        timeout: 15_000,
      })
      .toBe(text2);

    await setBrowserOffline(context, false);
    await waitUntilSoapClean(page);
    await expect(page.getByLabel(/Subjective/i)).toHaveValue(text2);
  });
});
