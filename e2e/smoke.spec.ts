import { expect, test } from "@playwright/test";
import {
  acceptDialogs,
  actAs,
  claimReadyNote,
  filterByStatus,
  openFirstNote,
  waitUntilSoapClean,
} from "./helpers";

/**
 * Smoke = shortest proof the app boots and the golden path works.
 * Run this first in CI; expand coverage in sibling spec files.
 */
test.describe("Smoke — reviewer happy path", () => {
  test("filter → open → edit → approve", async ({ page }) => {
    acceptDialogs(page);

    await page.goto("/notes");
    await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();

    await actAs(page, "Dr. A");
    await filterByStatus(page, "READY_FOR_REVIEW");
    await openFirstNote(page);

    await expect(
      page.getByRole("button", { name: "Start review" }),
    ).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Start review" }).click();

    await expect(page.getByRole("button", { name: "Approve" })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByLabel(/Subjective/i).fill(`Playwright edit ${Date.now()}`);
    await waitUntilSoapClean(page);

    await page.getByRole("button", { name: "Approve" }).click();

    await expect(
      page.getByText(/APPROVED|LOCKED|amendment grace/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
