/**
 * Renders the HTML diagram sources in this folder to PNGs in docs/images.
 *
 *   node docs/diagrams/render.mjs                 # all diagrams
 *   node docs/diagrams/render.mjs effect-flow     # one or more by name
 *
 * Uses the Playwright chromium that the e2e suite already installs.
 */
import { chromium } from "@playwright/test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "../images");

const DIAGRAMS = [
  "state-layers",
  "hexagonal-architecture",
  "effect-flow",
  "realtime-reconcile",
];

const requested = process.argv.slice(2);
const targets = requested.length
  ? DIAGRAMS.filter((name) => requested.includes(name))
  : DIAGRAMS;

const unknown = requested.filter((name) => !DIAGRAMS.includes(name));
if (unknown.length) {
  console.error(`Unknown diagram(s): ${unknown.join(", ")}`);
  console.error(`Available: ${DIAGRAMS.join(", ")}`);
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });

for (const name of targets) {
  const src = resolve(here, `${name}.html`);
  await page.goto(pathToFileURL(src).href, { waitUntil: "networkidle" });
  const canvas = page.locator("#canvas");
  const out = resolve(outDir, `${name}.png`);
  await canvas.screenshot({ path: out });
  console.log(`rendered ${name}.png`);
}

await browser.close();
