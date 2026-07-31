import { expect, test } from "@playwright/test";
import {
  acceptDialogs,
  actAs,
  claimReadyNote,
  resetApiChaos,
  waitUntilSoapClean,
} from "./helpers";

/**
 * Assignment scenario: two overlapping editors — one wins; the other must
 * resolve without losing local SOAP.
 */
test.describe("Concurrency — overlapping editors", () => {
  test.afterEach(async () => {
    await resetApiChaos();
  });

  test("two tabs: loser keeps draft in merge modal", async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    acceptDialogs(pageA);
    acceptDialogs(pageB);

    try {
      const noteUrl = await claimReadyNote(pageA, "Dr. A");

      await pageB.goto(noteUrl);
      await expect(pageB.getByLabel(/Subjective/i)).toBeEnabled({
        timeout: 30_000,
      });
      // Same assignee, second window — classic overlapping edit.
      await actAs(pageB, "Dr. A");
      await expect(pageB.getByLabel(/Subjective/i)).toBeEnabled();

      // Hold B's version POST until A has committed a new tip.
      let releaseB!: () => void;
      const gate = new Promise<void>((resolve) => {
        releaseB = resolve;
      });
      await pageB.route("**/api/notes/*/versions", async (route) => {
        if (route.request().method() === "POST") {
          await gate;
        }
        await route.continue();
      });

      const stamp = Date.now();
      const loserText = `LOSER_B_${stamp}`;
      const winnerText = `WINNER_A_${stamp}`;

      await pageB.getByLabel(/Subjective/i).fill(loserText);
      await expect(pageB.getByText("Dirty").first()).toBeVisible();

      await pageA.getByLabel(/Subjective/i).fill(winnerText);
      await waitUntilSoapClean(pageA);

      releaseB();

      const dialog = pageB.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 20_000 });
      await expect(dialog).toContainText(
        /Version conflict|Someone else saved/i,
      );
      // Loser's local SOAP must still be visible — no silent wipe.
      await expect(dialog).toContainText(loserText);

      await pageB.getByRole("button", { name: "Resolve & save" }).click();
      await expect(dialog).not.toBeVisible({ timeout: 15_000 });
      await waitUntilSoapClean(pageB);
      await expect(pageB.getByLabel(/Subjective/i)).toHaveValue(loserText);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
