import { expect, test } from "@playwright/test";

/**
 * Critical path: filter READY → open note → start review → edit SOAP → approve.
 */
test("filter → open → edit → approve", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());

  await page.goto("/notes");

  await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();

  // Ensure reviewer actor (default is Dr. A).
  await page.getByLabel("Switch active role").selectOption("dr_a");

  // Filter to READY_FOR_REVIEW so the first row is claimable.
  await page.getByRole("button", { name: "READY_FOR_REVIEW" }).click();

  const patientLink = page.locator('a[href*="/notes/"]').first();
  await expect(patientLink).toBeVisible({ timeout: 30_000 });
  await patientLink.click();

  await expect(page.getByRole("button", { name: "Start review" })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Start review" }).click();

  await expect(page.getByRole("button", { name: "Approve" })).toBeVisible({
    timeout: 15_000,
  });

  const subjective = page.getByLabel(/Subjective/i);
  await subjective.fill(`Playwright edit ${Date.now()}`);

  // Autosave ~800ms — wait for dirty to clear or Saved affordance.
  await expect
    .poll(async () => {
      const dirty = await page.getByText("Dirty").count();
      return dirty;
    }, { timeout: 10_000 })
    .toBe(0);

  await page.getByRole("button", { name: "Approve" }).click();

  // After approve, action bar shows lock/amend messaging or APPROVED badge.
  await expect(
    page.getByText(/APPROVED|LOCKED|amendment grace/i).first(),
  ).toBeVisible({ timeout: 15_000 });
});
