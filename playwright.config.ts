import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke e2e against Vite + Hono. Chaos off for determinism.
 * Start stack yourself with `pnpm dev` + CHAOS=0, or let webServer boot it.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      command:
        "CHAOS=0 AUTO_SEED=1 SEED_COUNT=500 SEED=42 pnpm --filter @soulside/api start",
      url: "http://localhost:3001/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @soulside/web dev",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
