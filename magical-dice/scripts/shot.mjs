// Desktop screenshot suite (settle-aware) — a visual tour of the app.
import { launch, waitAsleep, APP_URL, OUT } from './harness.mjs';

const { browser, page } = await launch({ width: 1440, height: 900 });
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });

await page.goto(APP_URL);
await page.waitForTimeout(800);
await waitAsleep(page);
await page.waitForTimeout(1200);
await shot('01-hero');

await page.click('#roll-btn');
await page.waitForTimeout(900);
await shot('02-midroll');
await waitAsleep(page);
await page.waitForTimeout(2500);
await shot('03-result');

await page.click('[data-tab="style"]');
await page.waitForTimeout(400);
await shot('04-style-panel');
await page.click('.swatch[title="Gold"]');
await page.waitForTimeout(1500);
await shot('05-gold');
await page.click('.swatch[title="Nebula"]');
await page.waitForTimeout(1500);
await shot('06-nebula');
await page.click('#opt-motley');
await page.waitForTimeout(1500);
await shot('07-motley');
await page.click('#opt-motley');

await page.click('[data-tab="type"]');
await page.waitForTimeout(400);
await shot('08-type');

await page.click('[data-tab="fate"]');
await page.fill('#seed-1', '3');
await page.fill('#seed-2', 'cold pizza');
await page.fill('#seed-3', 'zebra');
await page.click('#weave-btn');
await page.waitForTimeout(400);
await shot('09-fate');
await waitAsleep(page);
await page.click('#roll-btn');
await waitAsleep(page);
await page.waitForTimeout(2500);
await shot('10-fated-roll');

console.log('done ->', OUT);
await browser.close();
