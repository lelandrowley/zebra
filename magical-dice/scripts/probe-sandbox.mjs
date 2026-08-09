// Simulates the artifact host: content in a sandboxed iframe (opaque origin,
// storage access throws). The app must still boot, roll, and settle.
import fs from 'node:fs';
import path from 'node:path';
import { launch, ROOT } from './harness.mjs';

const SCRATCH = '/tmp/claude-0/-home-user-zebra/c4b4dcb5-e50d-56b3-9fe3-23746f2b032e/scratchpad';
fs.copyFileSync(process.argv[2] ?? path.join(ROOT, 'dist/index.html'), path.join(SCRATCH, 'frame-content.html'));

const { browser, page } = await launch({ width: 1100, height: 700 });
await page.goto('file://' + path.join(SCRATCH, 'sandbox-frame.html'));
await page.waitForTimeout(3000);
const frame = page.frames().find((f) => f !== page.mainFrame());

console.log('storage throws:', await frame.evaluate(() => {
  try { localStorage.getItem('x'); return false; } catch { return true; }
}));

for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(500);
  const state = await frame.evaluate(() => window.__FW_DEBUG__ ? {
    booted: true, asleep: window.__FW_DEBUG__.asleep(), sim: window.__FW_DEBUG__.simTime().toFixed(1),
  } : { booted: false }).catch((e) => ({ err: String(e).slice(0, 120) }));
  if (i % 6 === 0 || state.asleep) console.log('t=' + (i * 0.5) + 's', JSON.stringify(state));
  if (state.asleep) { console.log('SANDBOX BOOT: PASS'); await browser.close(); process.exit(0); }
}
console.log('SANDBOX BOOT: FAIL');
await page.screenshot({ path: SCRATCH + '/shots/sandbox-fail.png' });
await browser.close();
process.exit(1);
