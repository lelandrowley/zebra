// Audition the table sounds: render the real audio.js through an
// OfflineAudioContext in a headless browser and write WAVs you can listen to.
// Needs `npm run dev` up (it imports the live module over the dev server).
//
//   npm run dev &
//   node scripts/audition.mjs                     # -> shots/audio/
//   LABEL=try2 OUT=/tmp/x node scripts/audition.mjs
//
// The trick: stub window.AudioContext with something that hands back an
// OfflineAudioContext, so audio.js's own ensure() builds against it unmodified.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const OUT = process.env.OUT ?? path.join(
  path.dirname(path.dirname(new URL(import.meta.url).pathname)), 'shots', 'audio');
const MODULE = process.env.MODULE ?? '/src/audio.js';
const LABEL = process.env.LABEL ?? 'new';
fs.mkdirSync(OUT, { recursive: true });

const SR = 44100;

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5173');

/** Render one call of the audio module into a stereo Float32 pair. */
async function render(fnName, args, seconds) {
  return page.evaluate(async ({ fnName, args, seconds, SR, MODULE }) => {
    const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const oc = new Offline(2, Math.ceil(SR * seconds), SR);
    // audio.js does `new (window.AudioContext)()` inside ensure().
    const realAC = window.AudioContext;
    window.AudioContext = function () { return oc; };
    window.webkitAudioContext = window.AudioContext;
    // Fresh module instance each time so its cached ctx is this offline one.
    const mod = await import(`${MODULE}?v=${Math.random()}`);
    mod.setMuted(false);
    mod.unlockAudio();
    mod[fnName](...args);
    const buf = await oc.startRendering();
    window.AudioContext = realAC;
    return [Array.from(buf.getChannelData(0)), Array.from(buf.getChannelData(1))];
  }, { fnName, args, seconds, SR, MODULE });
}

function writeWav(file, chans) {
  const n = chans[0].length;
  const bytes = n * 2 * 2;
  const buf = Buffer.alloc(44 + bytes);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + bytes, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(bytes, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 2; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]));
      buf.writeInt16LE(Math.round(v * 32767), o); o += 2;
    }
  }
  fs.writeFileSync(file, buf);
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(chans[0][i]));
  console.log(`  ${path.basename(file)}  ${(n / SR).toFixed(2)}s  peak ${peak.toFixed(3)}`);
}

const mix = (seconds) => [new Float32Array(Math.ceil(SR * seconds)), new Float32Array(Math.ceil(SR * seconds))];
function addAt(dst, src, atSec, gain = 1) {
  const off = Math.floor(atSec * SR);
  for (let c = 0; c < 2; c++) {
    for (let i = 0; i < src[c].length; i++) {
      const j = off + i;
      if (j >= 0 && j < dst[c].length) dst[c][j] += src[c][i] * gain;
    }
  }
}

console.log(`rendering [${LABEL}] from ${MODULE}`);

// --- individual sounds ---
const clackHard = await render('clack', [0.95, 1.0], 1.6);
const clackSoft = await render('clack', [0.28, 1.0], 1.6);
const clackSmall = await render('clack', [0.7, 0.75], 1.6);
const chime = await render('chime', [34, 6], 4.0);
const crit = await render('critFanfare', [], 4.5);
const fumble = await render('fumbleKnell', [], 4.5);

writeWav(path.join(OUT, `${LABEL}-clack-hard.wav`), clackHard);
writeWav(path.join(OUT, `${LABEL}-chime.wav`), chime);
writeWav(path.join(OUT, `${LABEL}-crit.wav`), crit);
writeWav(path.join(OUT, `${LABEL}-fumble.wav`), fumble);

// --- a whole roll: dice clattering down, then fate settling ---
const roll = mix(7.0);
let t = 0.05;
const clacks = [clackHard, clackSoft, clackSmall];
// Dense at first, thinning out as the dice lose energy — like a real pour.
for (let i = 0; i < 26; i++) {
  const src = clacks[i % clacks.length];
  const energy = Math.max(0.12, 1 - t / 2.0);
  addAt(roll, src, t, energy * (0.5 + ((i * 37) % 50) / 100));
  t += 0.035 + ((i * 17) % 90) / 1000 + t * 0.06;
  if (t > 2.3) break;
}
addAt(roll, chime, 2.65, 1);
writeWav(path.join(OUT, `${LABEL}-a-full-roll.wav`), roll);

const critRoll = mix(7.0);
t = 0.05;
for (let i = 0; i < 22; i++) {
  addAt(critRoll, clacks[i % clacks.length], t, Math.max(0.15, 1 - t / 1.9));
  t += 0.04 + ((i * 23) % 80) / 1000 + t * 0.07;
  if (t > 2.1) break;
}
addAt(critRoll, crit, 2.5, 1);
writeWav(path.join(OUT, `${LABEL}-a-natural-20.wav`), critRoll);

await browser.close();
console.log('done ->', OUT);
