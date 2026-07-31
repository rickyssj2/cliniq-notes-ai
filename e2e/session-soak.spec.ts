import { expect, test } from "@playwright/test";
import {
  acceptDialogs,
  actAs,
  filterByStatus,
  resetApiChaos,
} from "./helpers";

/**
 * Light soak: open many notes in one session. Proves navigation does not
 * crash; full heap/listener instrumentation is out of scope for CI.
 */
test.describe("Session soak", () => {
  test.afterEach(async () => {
    await resetApiChaos();
  });

  test("open 25 notes sequentially without page failure", async ({ page }) => {
    acceptDialogs(page);
    await page.goto("/notes");
    await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();
    await actAs(page, "Dr. A");
    await filterByStatus(page, "READY_FOR_REVIEW");

    const hrefs: string[] = [];
    const links = page.locator('a[href*="/notes/"]');
    await expect(links.first()).toBeVisible({ timeout: 30_000 });
    const n = Math.min(25, await links.count());
    for (let i = 0; i < n; i++) {
      const href = await links.nth(i).getAttribute("href");
      if (href) hrefs.push(href);
    }
    expect(hrefs.length).toBeGreaterThanOrEqual(10);

    for (const href of hrefs) {
      await page.goto(href);
      await expect(page.getByLabel(/Subjective/i)).toBeVisible({
        timeout: 20_000,
      });
      await expect(
        page.getByTitle("WebSocket connection"),
      ).toBeVisible();
    }

    await page.goto("/notes");
    await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();
  });
});
