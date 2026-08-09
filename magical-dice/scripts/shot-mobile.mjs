// Phone-sized screenshots (roll result + open panel).
import { launch, waitAsleep, APP_URL, OUT } from './harness.mjs';

const { browser, page } = await launch(
  { width: 390, height: 844 },
  { isMobile: true, hasTouch: true },
);

await page.goto(APP_URL);
await page.waitForTimeout(600);
await waitAsleep(page);
await page.tap('#roll-btn');
await waitAsleep(page);
await page.waitForTimeout(2200);
await page.screenshot({ path: `${OUT}/11-mobile-result.png` });
await page.tap('#panel-toggle');
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/12-mobile-panel.png` });
await browser.close();
console.log('done ->', OUT);
