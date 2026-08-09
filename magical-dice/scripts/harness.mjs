// Shared bits for the headless visual/behavior harness.
// Chromium: playwright's own browser by default; override with CHROMIUM_PATH.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const APP_URL = process.env.APP_URL ?? 'file://' + path.join(ROOT, 'dist/index.html');
export const OUT = process.env.OUT_DIR ?? path.join(ROOT, 'shots');
fs.mkdirSync(OUT, { recursive: true });

export async function launch(viewport, opts = {}) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport, ...opts });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  return { browser, page };
}

/** Poll the app's debug hook until every die sleeps. */
export async function waitAsleep(page, rounds = 150) {
  for (let i = 0; i < rounds; i++) {
    await page.waitForTimeout(400);
    if (await page.evaluate(() => window.__FW_DEBUG__.asleep())) return true;
  }
  return false;
}
