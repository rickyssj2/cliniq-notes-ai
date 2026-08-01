import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  acceptDialogs,
  actAs,
  armForceConflict,
  claimReadyNote,
  filterByStatus,
  openFirstNote,
  resetApiChaos,
} from "./helpers";

/**
 * WCAG 2.1 AA audit of the states a reviewer actually occupies, not just the
 * routes. Lighthouse only ever sees a freshly loaded page; the dialog, the
 * offline banner and the read-only role are where the real risk lives.
 *
 * Scanning is per-state and asserts zero violations: a growing allowlist is how
 * accessibility suites quietly stop meaning anything.
 */
const WCAG_21_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function violations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_21_AA).analyze();
  return results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(" ")),
  }));
}

test.describe("Accessibility — WCAG 2.1 AA", () => {
  test.afterEach(async () => {
    await resetApiChaos();
  });

  test("home", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test("notes queue, populated and virtualized", async ({ page }) => {
    await page.goto("/notes");
    await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();
    await expect(page.locator('a[href*="/notes/"]').first()).toBeVisible({
      timeout: 30_000,
    });
    expect(await violations(page)).toEqual([]);
  });

  test("notes queue with rows selected (bulk bar visible)", async ({ page }) => {
    await page.goto("/notes");
    await filterByStatus(page, "READY_FOR_REVIEW");
    await page.getByRole("checkbox").nth(1).check();
    await expect(page.getByRole("button", { name: /Start review/i })).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test("note detail as the assigned reviewer (editable)", async ({ page }) => {
    acceptDialogs(page);
    await claimReadyNote(page, "Dr. A");
    expect(await violations(page)).toEqual([]);
  });

  test("note detail as a read-only auditor (disabled actions)", async ({
    page,
  }) => {
    await page.goto("/notes");
    await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();
    await openFirstNote(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 30_000,
    });
    await actAs(page, "Auditor Lee");
    await expect(
      page.getByText(/cannot change note workflow state/i).first(),
    ).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test("three-way merge dialog", async ({ page }) => {
    acceptDialogs(page);
    await claimReadyNote(page, "Dr. A");

    await armForceConflict(page);
    await page.keyboard.press("Escape");
    const subjective = page.getByLabel("Subjective");
    await subjective.click();
    await subjective.fill("conflict trigger text");
    await page.getByRole("button", { name: /Save now/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    expect(await violations(page)).toEqual([]);
  });

  test("keyboard shortcut help dialog", async ({ page }) => {
    await page.goto("/notes");
    await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();
    await page.keyboard.press("?");
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test("offline banner and queued state", async ({ page, context }) => {
    await page.goto("/notes");
    await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();
    await context.setOffline(true);
    await expect(page.getByText(/offline/i).first()).toBeVisible();
    expect(await violations(page)).toEqual([]);
    await context.setOffline(false);
  });

  test("skip link reaches the main landmark", async ({ page }) => {
    await page.goto("/notes");
    await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();
    await page.locator("body").press("Tab");

    const skip = page.getByRole("link", { name: /skip to main content/i });
    await expect(skip).toBeFocused();
    await skip.press("Enter");

    // One main landmark per document, and the skip target is it.
    await expect(page.locator("main#main")).toHaveCount(1);
    expect(await page.locator("main").count()).toBe(1);
  });
});
