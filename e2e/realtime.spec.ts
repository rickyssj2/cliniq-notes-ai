import { expect, test } from "@playwright/test";
import {
  acceptDialogs,
  actAs,
  filterByStatus,
  openFirstNote,
  resetApiChaos,
} from "./helpers";

/**
 * Assignment scenario: note.status_changed may arrive (and paint) before the
 * HTTP transition acknowledgment returns.
 */
test.describe("Realtime reconcile", () => {
  test.afterEach(async () => {
    await resetApiChaos();
  });

  test("status_changed paints before held HTTP ack", async ({ page }) => {
    acceptDialogs(page);

    await page.goto("/notes");
    await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();
    await actAs(page, "Dr. A");
    await filterByStatus(page, "READY_FOR_REVIEW");
    await openFirstNote(page);

    await expect(
      page.getByRole("button", { name: "Start review" }),
    ).toBeVisible({ timeout: 30_000 });

    // Let the server finish and emit WS, then hold the HTTP response body.
    let httpReleased = false;
    await page.route("**/api/notes/*/transitions", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      await new Promise((r) => setTimeout(r, 2_500));
      httpReleased = true;
      await route.fulfill({ response });
    });

    await page.getByRole("button", { name: "Start review" }).click();

    // WS path should enable Approve while the POST response is still held.
    await expect(page.getByRole("button", { name: "Approve" })).toBeVisible({
      timeout: 15_000,
    });
    expect(httpReleased).toBe(false);

    await expect
      .poll(() => httpReleased, { timeout: 10_000 })
      .toBe(true);
  });
});
