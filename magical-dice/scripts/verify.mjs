// Behavior verification: settle timing, chips, and — the heart of the app —
// roll determinism: the same three answers must replay the same rolls.
import { launch, waitAsleep, APP_URL } from './harness.mjs';

const { browser, page } = await launch({ width: 960, height: 600 });

async function settled(tag) {
  const t0 = await page.evaluate(() => window.__FW_DEBUG__.simTime());
  const ok = await waitAsleep(page);
  const t = await page.evaluate(() => window.__FW_DEBUG__.simTime());
  console.log(`${tag}: ${ok ? `settled in ${(t - t0).toFixed(2)} sim-seconds` : 'NEVER SETTLED'}`);
}

async function fullRoll(tag) {
  await page.click('#roll-btn');
  await page.waitForTimeout(500);
  await settled(tag);
  return page.evaluate(() => ({
    values: window.__FW_DEBUG__.values(),
    chips: [...document.querySelectorAll('.die-chip .v')].map((e) => e.textContent),
    draws: window.__FW_DEBUG__.draws(),
  }));
}

await page.goto(APP_URL + '?quality=low');
await page.waitForTimeout(1500);
await settled('welcome pour');
const roll1 = await fullRoll('roll 1');
console.log('roll 1:', JSON.stringify(roll1));

// Reload = fresh thread of fate; the pour and first roll must replay exactly.
await page.reload();
await page.waitForTimeout(1500);
await settled('pour after reload');
const replay = await fullRoll('replay roll 1');
console.log('replay:', JSON.stringify(replay));

const pass = JSON.stringify(replay.values) === JSON.stringify(roll1.values);
console.log('DETERMINISM:', pass ? 'PASS' : 'FAIL');
console.log('CHIPS PRESENT:', roll1.chips.length > 0 && replay.chips.length > 0 ? 'PASS' : 'FAIL');
await browser.close();
process.exit(pass ? 0 : 1);
