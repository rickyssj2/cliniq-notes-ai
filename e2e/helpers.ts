import { expect, type BrowserContext, type Page } from "@playwright/test";

const API_BASE = process.env.API_URL ?? "http://localhost:3001";

/** Accept `window.confirm` (mock MFA on Approve). */
export function acceptDialogs(page: Page) {
  page.on("dialog", (dialog) => dialog.accept());
}

/** Toggle Chromium offline (fires `online`/`offline`, fails fetch). */
export async function setBrowserOffline(
  context: BrowserContext,
  offline: boolean,
) {
  await context.setOffline(offline);
}

/** Patch chaos config on the mock API (dev routes bypass latency). */
export async function setApiChaos(patch: Record<string, unknown>) {
  const res = await fetch(`${API_BASE}/api/dev/chaos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    throw new Error(`setApiChaos failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/** Clear demo delay / fail-next so later specs stay deterministic. */
export async function resetApiChaos() {
  await setApiChaos({
    ackDelayMs: 0,
    failNext: {
      transitions: 0,
      versions: 0,
      conflicts: 0,
      noteGets: 0,
      telemetry: 0,
    },
  });
}

/** Open the header avatar menu and pick a dev actor by display name. */
export async function actAs(page: Page, displayName: string) {
  const trigger = page.getByRole("button", { name: /Change actor/i });
  await expect(trigger).toBeVisible();

  const label = (await trigger.getAttribute("aria-label")) ?? "";
  if (label.startsWith(`Act as ${displayName} (`)) return;

  await trigger.click();
  await page
    .getByRole("listbox", { name: "Switch active actor" })
    .getByRole("button", { name: displayName })
    .click();
  // switchActor mints a JWT before closing the menu.
  await expect(trigger).toHaveAttribute(
    "aria-label",
    new RegExp(`^Act as ${displayName} \\(`),
  );
}

/** Filter notes list by status chip (e.g. `READY_FOR_REVIEW`). */
export async function filterByStatus(page: Page, status: string) {
  await page.getByRole("button", { name: status, exact: true }).click();
}

/** Open the first note row in the current list view. */
export async function openFirstNote(page: Page) {
  const link = page.locator('a[href*="/notes/"]').first();
  await expect(link).toBeVisible({ timeout: 30_000 });
  await link.click();
}

/**
 * Claim a READY note as `actor` and return its detail URL.
 * Assumes you are already on `/notes` or will navigate there.
 */
export async function claimReadyNote(
  page: Page,
  actor = "Dr. A",
): Promise<string> {
  await page.goto("/notes");
  await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();
  await actAs(page, actor);
  await filterByStatus(page, "READY_FOR_REVIEW");
  await openFirstNote(page);

  await expect(
    page.getByRole("button", { name: "Start review" }),
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Start review" }).click();
  await expect(page.getByRole("button", { name: "Approve" })).toBeVisible({
    timeout: 15_000,
  });

  return page.url();
}

/** Wait until section dirty badges clear (autosave finished). */
export async function waitUntilSoapClean(page: Page) {
  await expect
    .poll(async () => page.getByText("Dirty").count(), { timeout: 10_000 })
    .toBe(0);
}

/** Open demo FAB and arm force-conflict on next save (note detail only). */
export async function armForceConflict(page: Page) {
  await page.getByRole("button", { name: /Demo · D/i }).click();
  await page
    .getByRole("button", { name: "Force conflict on next save" })
    .click();
}
