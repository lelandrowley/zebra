// Sounds of the table, synthesized in WebAudio — no audio files.
// Clacks on impact, a soft chime when fate settles, flourishes for crits.

let ctx = null;
let master = null;
let muted = false;
let unlocked = false;

function ensure() {
  if (!unlocked) return null; // never start audio before a user gesture
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** Call from the first user gesture so the context is allowed to start. */
export function unlockAudio() {
  unlocked = true;
  ensure();
}
export function setMuted(m) { muted = m; }

function noiseBuffer(seconds) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** A die striking the tray. intensity 0..1, size ~ die radius factor. */
export function clack(intensity, size = 1) {
  if (muted || !ensure()) return;
  const t = ctx.currentTime;
  const gain = ctx.createGain();
  const v = 0.08 + Math.min(intensity, 1) * 0.55;
  gain.gain.setValueAtTime(v, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);

  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(0.06);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = (1900 + Math.random() * 900) / size;
  bp.Q.value = 1.1;

  // a knock body under the click
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime((330 + Math.random() * 120) / size, t);
  osc.frequency.exponentialRampToValueAtTime(90 / size, t + 0.05);
  const og = ctx.createGain();
  og.gain.setValueAtTime(v * 0.5, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);

  src.connect(bp).connect(gain).connect(master);
  osc.connect(og).connect(master);
  src.start(t); src.stop(t + 0.07);
  osc.start(t); osc.stop(t + 0.06);
}

function bell(freq, t, dur, vol) {
  const osc = ctx.createOscillator();
  const shimmer = ctx.createOscillator();
  osc.type = 'sine';
  shimmer.type = 'sine';
  osc.frequency.value = freq;
  shimmer.frequency.value = freq * 2.004; // detuned partial
  const g = ctx.createGain();
  const sg = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  sg.gain.value = 0.35;
  osc.connect(g);
  shimmer.connect(sg).connect(g);
  g.connect(master);
  osc.start(t); osc.stop(t + dur + 0.05);
  shimmer.start(t); shimmer.stop(t + dur + 0.05);
}

const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0]; // C major pentatonic

/** Fate settles: a small arpeggio coloured by the total. */
export function chime(total, diceCount) {
  if (muted || !ensure()) return;
  const t = ctx.currentTime;
  const notes = 2 + Math.min(2, Math.floor(diceCount / 3));
  for (let i = 0; i < notes; i++) {
    const n = PENTA[(total + i * 2) % PENTA.length] * (total % 2 ? 1 : 0.5);
    bell(n, t + i * 0.09, 1.1, 0.16);
  }
}

/** Natural 20 — a rising sparkle. */
export function critFanfare() {
  if (muted || !ensure()) return;
  const t = ctx.currentTime;
  [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => bell(f, t + i * 0.07, 1.3, 0.17));
}

/** Natural 1 — a low sigh. */
export function fumbleKnell() {
  if (muted || !ensure()) return;
  const t = ctx.currentTime;
  bell(146.83, t, 1.6, 0.22);
  bell(155.56, t + 0.12, 1.7, 0.16); // minor second rub
}
