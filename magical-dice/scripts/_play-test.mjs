// Throwaway end-to-end play test for the Play-mode feature. Not a committed
// script — drives the live dev server with Playwright, plays all three games
// for real through the UI, and screenshots the HUD at desktop + phone sizes.
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/private/tmp/claude-501/-Users-leland-Documents-AI-Projects-Claude-Code/8b117d02-126e-486f-9c4e-ac3977229fea/scratchpad/shots-play';
fs.mkdirSync(OUT, { recursive: true });

const URL = 'http://localhost:5173/';

async function launch(viewport) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text()); });
  return { browser, page };
}

async function waitSettled(page, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const rolling = await page.evaluate(() => window.__FW_DEBUG__?.rolling());
    if (rolling === false) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

async function rollAndSettle(page) {
  await page.click('#roll-btn');
  await page.waitForTimeout(250);
  await waitSettled(page);
  await page.waitForTimeout(200);
}

async function hudState(page) {
  return page.evaluate(() => {
    const $ = (s) => document.querySelector(s);
    return {
      visible: !$('#game-hud').classList.contains('hidden'),
      headline: $('#hud-headline')?.textContent,
      score: $('#hud-score')?.textContent,
      sub: $('#hud-sub')?.textContent,
      detail: $('#hud-detail')?.textContent,
      over: !$('#hud-over').classList.contains('hidden'),
      resultTitle: $('#hud-result-title')?.textContent,
      resultDetail: $('#hud-result-detail')?.textContent,
      actionBtns: Array.from(document.querySelectorAll('#hud-actions button')).map((b) => ({ label: b.textContent, disabled: b.disabled })),
      modeIndicatorHidden: $('#mode-indicator').classList.contains('hidden'),
      modeIndicatorText: $('#mode-indicator')?.textContent,
      verdictHidden: $('#verdict').classList.contains('hidden'),
    };
  });
}

async function enterGame(page, name) {
  const closed = await page.evaluate(() => document.getElementById('panel').classList.contains('closed'));
  if (closed) {
    await page.click('#panel-toggle');
    await page.waitForTimeout(400);
  }
  await page.click('#game-mode-entry');
  await page.waitForTimeout(300);
  await page.click(`.game-card:has-text("${name}")`);
  await page.waitForTimeout(700);
}

async function exitGame(page) {
  await page.click('#hud-exit');
  await page.waitForTimeout(500);
}

function shotFactory(page, prefix) {
  return (name) => page.screenshot({ path: `${OUT}/${prefix}-${name}.png` });
}

async function playToOver(page, shot, label, maxRolls, actionEveryTime) {
  let s = null;
  for (let i = 0; i < maxRolls; i++) {
    await rollAndSettle(page);
    s = await hudState(page);
    console.log(`${label} roll ${i + 1}: hl="${s.headline}" score=${s.score} sub="${s.sub}" detail="${s.detail}" over=${s.over}`);
    if (i < 2) await shot(`roll-${i + 1}`);
    if (s.over) break;
    if (actionEveryTime && s.actionBtns[0] && !s.actionBtns[0].disabled) {
      await page.click('#hud-actions button');
      await page.waitForTimeout(200);
      s = await hudState(page);
      console.log(`${label}   action -> score=${s.score} over=${s.over}`);
      if (s.over) break;
    }
  }
  return s;
}

// =========================== DESKTOP RUN ===========================
async function desktopRun() {
  const { browser, page } = await launch({ width: 1280, height: 800 });
  const shot = shotFactory(page, 'desktop');
  await page.goto(URL);
  await page.waitForTimeout(800);
  const booted = await page.evaluate(() => !!window.__FW_DEBUG__);
  console.log('DESKTOP booted:', booted);
  await waitSettled(page);
  await page.waitForTimeout(1000);
  await shot('00-default');
  console.log('DESKTOP default check:', JSON.stringify(await hudState(page)));

  // panel starts OPEN on desktop by default — this IS the true default view
  await page.click('#panel-toggle'); // close it -> pure tray
  await page.waitForTimeout(400);
  await shot('00b-tray-only-panel-closed');

  await page.click('#panel-toggle'); // reopen -> Dice tab, showing the quiet entry
  await page.waitForTimeout(400);
  await shot('00c-panel-dice-tab-with-entry');

  await page.click('.chip:has-text("Fireball")');
  await page.waitForTimeout(1000);
  await shot('01-custom-loadout-fireball');
  console.log('loadout before any game:', await page.textContent('#loadout-summary'));

  await page.click('#panel-toggle'); // close panel, ready to play
  await page.waitForTimeout(400);

  // ---------------- PIG ----------------
  console.log('=== PIG ===');
  await enterGame(page, 'Pig');
  await shot('pig-00-entered');
  console.log('pig entered HUD:', JSON.stringify(await hudState(page)));

  // Dice tab should be locked while playing
  await page.click('#panel-toggle');
  await page.waitForTimeout(300);
  await shot('pig-00b-dice-locked');
  console.log('dice locked? plus-disabled=', await page.evaluate(() => document.querySelector('.die-row .plus')?.disabled),
    'hint=', await page.textContent('#dice-cap-hint'));
  await page.click('#panel-toggle');
  await page.waitForTimeout(300);

  const pigShot = shotFactory(page, 'pig');
  let s = await playToOver(page, pigShot, 'pig', 90, true);
  await shot('pig-99-over');
  console.log('pig final:', JSON.stringify(s));

  await page.click('#hud-again');
  await page.waitForTimeout(400);
  console.log('pig after play-again:', JSON.stringify(await hudState(page)));
  await shot('pig-again');

  await exitGame(page);
  await shot('pig-exited');
  const afterPigExit = await hudState(page);
  console.log('after pig exit:', JSON.stringify(afterPigExit), 'loadout:', await page.textContent('#loadout-summary'));

  await rollAndSettle(page);
  await page.waitForTimeout(300);
  console.log('post-exit free roll verdict hidden (expect false):', await page.evaluate(() => document.querySelector('#verdict').classList.contains('hidden')));
  await shot('post-pig-free-roll-verdict');

  // ---------------- BANK IT ----------------
  console.log('=== BANK IT ===');
  await enterGame(page, 'Bank It');
  await shot('bank-00-entered');
  const bankShot = shotFactory(page, 'bank');
  s = await playToOver(page, bankShot, 'bank', 20, true);
  await shot('bank-99-over');
  console.log('bank final:', JSON.stringify(s));

  await page.click('#hud-again');
  await page.waitForTimeout(400);
  await shot('bank-again');
  await exitGame(page);
  await shot('bank-exited');

  // ---------------- CHICAGO ----------------
  console.log('=== CHICAGO ===');
  await enterGame(page, 'Chicago');
  await shot('chicago-00-entered');
  const chicagoShot = shotFactory(page, 'chicago');
  s = await playToOver(page, chicagoShot, 'chicago', 13, false);
  await shot('chicago-99-over');
  console.log('chicago final:', JSON.stringify(s));

  await page.click('#hud-again');
  await page.waitForTimeout(400);
  await shot('chicago-again');
  await exitGame(page);
  await shot('chicago-exited');

  console.log('FINAL desktop default check:', JSON.stringify(await hudState(page)), 'loadout:', await page.textContent('#loadout-summary'));

  await browser.close();
}

// =========================== MOBILE RUN ===========================
async function mobileRun() {
  const { browser, page } = await launch({ width: 390, height: 844 });
  const shot = shotFactory(page, 'mobile');
  await page.goto(URL);
  await page.waitForTimeout(800);
  await waitSettled(page);
  await page.waitForTimeout(1000);
  await shot('00-default');
  console.log('MOBILE default check:', JSON.stringify(await hudState(page)));

  let first = true;
  for (const name of ['Pig', 'Bank It', 'Chicago']) {
    const tag = name.replace(/\s+/g, '');
    console.log(`mobile quick check: ${name}`);
    if (first) {
      await page.click('#panel-toggle');
      await page.waitForTimeout(400);
      await shot('panel-entry-point');
      first = false;
    }
    await enterGame(page, name);
    await shot(`${tag}-hud`);
    await rollAndSettle(page);
    await shot(`${tag}-hud-after-roll`);
    console.log(`  ${name} mobile HUD:`, JSON.stringify(await hudState(page)));
    await exitGame(page);
    await page.waitForTimeout(300);
  }

  await shot('99-default-restored');
  console.log('MOBILE final default check:', JSON.stringify(await hudState(page)));

  await browser.close();
}

await desktopRun();
await mobileRun();
console.log('DONE ->', OUT);
