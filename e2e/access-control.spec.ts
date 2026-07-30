import { expect, test } from "@playwright/test";
import {
  acceptDialogs,
  actAs,
  claimReadyNote,
  filterByStatus,
  openFirstNote,
} from "./helpers";

/**
 * Access-control E2E — roles and assignment gates in the real UI.
 * Domain unit tests prove the rules; these prove the UI enforces them.
 */
test.describe("Role & assignment gates", () => {
  test("auditor sees SOAP as read-only", async ({ page }) => {
    await page.goto("/notes");
    await actAs(page, "Auditor Lee");
    await filterByStatus(page, "IN_REVIEW");
    await openFirstNote(page);

    await expect(page.getByLabel(/Subjective/i)).toBeDisabled();
    await expect(
      page.getByText(/READONLY_AUDITOR|cannot change note workflow/i).first(),
    ).toBeVisible();
  });

  test("unassigned reviewer cannot edit claimed note", async ({ page }) => {
    const noteUrl = await claimReadyNote(page, "Dr. A");

    await actAs(page, "Dr. B");
    await page.goto(noteUrl);

    await expect(page.getByLabel(/Subjective/i)).toBeDisabled();
    await expect(
      page.getByText(/assigned reviewer or an admin/i),
    ).toBeVisible();
  });

  test("admin can approve a note assigned to another reviewer", async ({
    page,
  }) => {
    acceptDialogs(page);
    const noteUrl = await claimReadyNote(page, "Dr. A");

    await actAs(page, "Admin Kim");
    await page.goto(noteUrl);

    const approve = page.getByRole("button", { name: "Approve" });
    await expect(approve).toBeEnabled({ timeout: 10_000 });
    await approve.click();

    await expect(page.getByText(/APPROVED/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});

test.describe("URL-persisted filters", () => {
  test("deep link keeps status filter after back navigation", async ({
    page,
  }) => {
    await page.goto("/notes?status=READY_FOR_REVIEW");
    await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();

    await openFirstNote(page);
    await page.goBack();

    await expect(page).toHaveURL(/status=READY_FOR_REVIEW/);
    await expect(
      page.getByRole("button", { name: "READY_FOR_REVIEW", exact: true }),
    ).toBeVisible();
  });
});
