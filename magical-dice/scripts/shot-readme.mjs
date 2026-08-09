// README hero shots (JPEG, repo-friendly sizes) -> docs/.
import path from 'node:path';
import { launch, waitAsleep, APP_URL, ROOT } from './harness.mjs';

const DOCS = path.join(ROOT, 'docs');
const { browser, page } = await launch({ width: 1360, height: 850 });

await page.goto(APP_URL);
await page.waitForTimeout(600);
await waitAsleep(page);
await page.click('#roll-btn');
await waitAsleep(page);
await page.waitForTimeout(2600);
await page.screenshot({ path: path.join(DOCS, 'hero.jpg'), type: 'jpeg', quality: 84 });
await page.click('[data-tab="style"]');
await page.click('.swatch[title="Nebula"]');
await page.waitForTimeout(1800);
await page.screenshot({ path: path.join(DOCS, 'nebula.jpg'), type: 'jpeg', quality: 84 });
await page.click('#opt-motley');
await page.waitForTimeout(1800);
await page.screenshot({ path: path.join(DOCS, 'motley.jpg'), type: 'jpeg', quality: 84 });
await browser.close();
console.log('done ->', DOCS);
