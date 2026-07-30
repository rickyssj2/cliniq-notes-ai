import { expect, test } from "@playwright/test";
import {
  acceptDialogs,
  armForceConflict,
  claimReadyNote,
  waitUntilSoapClean,
} from "./helpers";

/**
 * Workflow E2E — branches off the happy path (reject, conflict merge).
 * These catch UI wiring bugs unit tests cannot (modals, autosave, action bar).
 */
test.describe("Reviewer workflows", () => {
  test("reject with reason updates status", async ({ page }) => {
    acceptDialogs(page);
    await claimReadyNote(page, "Dr. B");

    await page.getByRole("button", { name: "Reject" }).click();
    await expect(
      page.getByRole("dialog", { name: /Reject note/i }),
    ).toBeVisible();

    await page
      .getByPlaceholder(/missing plan/i)
      .fill("E2E: incomplete assessment");
    await page.getByRole("button", { name: "Confirm reject" }).click();

    await expect(page.getByText("REJECTED").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByLabel(/Subjective/i)).toBeDisabled();
  });

  test("force conflict opens merge modal and resolves", async ({ page }) => {
    acceptDialogs(page);
    await claimReadyNote(page, "Dr. A");

    await armForceConflict(page);

    await page
      .getByLabel(/Subjective/i)
      .fill(`Conflict seed ${Date.now()}`);
    await expect(
      page.getByRole("dialog", { name: /Version conflict/i }),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Resolve & save" }).click();
    await expect(
      page.getByRole("dialog", { name: /Version conflict/i }),
    ).not.toBeVisible({ timeout: 15_000 });

    await waitUntilSoapClean(page);
  });
});
