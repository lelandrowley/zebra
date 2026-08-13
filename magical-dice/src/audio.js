// Sounds of the table, synthesized in WebAudio — no audio files.
//
// Impacts use modal synthesis: a struck solid rings at a handful of resonant
// modes whose frequencies are NOT harmonically related, and the high modes die
// away fastest. That inharmonic spread is what the ear hears as "material".
// Broadband filtered noise on its own reads as hiss and a falling sine reads as
// a drum, which is why the first pass at these sounds felt cheap.
//
// Everything is fed through a procedurally generated convolution reverb, so the
// vault has a room around it. The impulse response is synthesized here — no
// audio files, same as the rest.

let ctx = null;
let master = null;
let dry = null;      // impact/bell sends: straight through
let wet = null;      // ...and into the reverb
let muted = false;
let unlocked = false;

/**
 * A reverb impulse: noise under a decaying envelope, progressively darkened.
 * The short fade-in stops it reading as a gated slap.
 */
function makeImpulse(seconds, decay, color) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const env = (1 - t) ** decay * Math.min(1, t * 260);
      lp += ((Math.random() * 2 - 1) - lp) * color;
      d[i] = lp * env;
    }
  }
  return buf;
}

function ensure() {
  if (!unlocked) return null; // never start audio before a user gesture
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();

    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);

    dry = ctx.createGain();
    dry.gain.value = 0.82;
    dry.connect(master);

    const convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(2.6, 2.4, 0.34);
    wet = ctx.createGain();
    wet.gain.value = 0.3;
    wet.connect(convolver);
    convolver.connect(master);
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

/** A send that feeds both the dry path and the reverb. */
function voiceBus(level) {
  const bus = ctx.createGain();
  bus.gain.value = level;
  bus.connect(dry);
  bus.connect(wet);
  return bus;
}

// --- impacts ---------------------------------------------------------------

// Ratios are deliberately irregular: evenly spaced partials sound like a
// pitched instrument rather than a struck stone. Higher modes decay fastest.
const CLACK_MODES = [
  { ratio: 1.00, gain: 1.00, decay: 0.075 },
  { ratio: 1.59, gain: 0.62, decay: 0.054 },
  { ratio: 2.31, gain: 0.43, decay: 0.038 },
  { ratio: 3.17, gain: 0.27, decay: 0.027 },
  { ratio: 4.42, gain: 0.15, decay: 0.019 },
];

/** A die striking the tray. intensity 0..1, size ~ die radius factor. */
export function clack(intensity, size = 1) {
  if (muted || !ensure()) return;
  const t = ctx.currentTime;
  const hit = Math.min(Math.max(intensity, 0), 1);
  const bus = voiceBus(0.05 + hit * 0.36);
  // Bigger dice ring lower. A little scatter per strike keeps a handful of
  // dice from sounding machine-stamped.
  const base = (720 / size) * (0.93 + Math.random() * 0.14);

  for (const m of CLACK_MODES) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = base * m.ratio * (0.995 + Math.random() * 0.01);
    const g = ctx.createGain();
    // A harder strike excites the high modes more — that is what the ear
    // reads as "sharp" rather than merely "loud".
    const amp = m.gain * (0.4 + hit * 0.8);
    const dur = m.decay * (0.8 + hit * 0.45);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.0012); // effectively instant
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(bus);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  // The contact tick: a few milliseconds of noise, filtered narrowly so it
  // lands as a click instead of a hiss.
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(0.014);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 4300 / Math.sqrt(size);
  bp.Q.value = 5.5;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.35 + hit * 0.5, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.013);
  n.connect(bp).connect(ng).connect(bus);
  n.start(t); n.stop(t + 0.02);
}

// --- bells -----------------------------------------------------------------

// A cast bell's partials, near enough: hum an octave below, then prime, the
// minor-third tierce that gives bells their ache, quint, nominal, and a few
// bright inharmonics on top that fade quickly.
const BELL_PARTIALS = [
  { ratio: 0.50, gain: 0.30, decay: 1.00, pair: true },
  { ratio: 1.00, gain: 1.00, decay: 0.86, pair: true },
  { ratio: 1.19, gain: 0.44, decay: 0.64, pair: true },
  { ratio: 1.51, gain: 0.31, decay: 0.52, pair: true },
  { ratio: 2.00, gain: 0.36, decay: 0.40, pair: false },
  { ratio: 2.66, gain: 0.17, decay: 0.25, pair: false },
  { ratio: 3.42, gain: 0.10, decay: 0.17, pair: false },
  { ratio: 4.53, gain: 0.05, decay: 0.11, pair: false },
];

/**
 * One struck bell. The low partials are voiced as detuned pairs: the two
 * drift in and out of phase, which is the slow shimmer real bells have.
 */
function bell(freq, t, dur, vol) {
  const bus = voiceBus(vol);
  for (const p of BELL_PARTIALS) {
    const voices = p.pair ? [-1, 1] : [0];
    for (const side of voices) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * p.ratio;
      osc.detune.value = side * 4.5;
      const g = ctx.createGain();
      const d = dur * p.decay;
      const amp = p.gain * (p.pair ? 0.5 : 1);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      osc.connect(g).connect(bus);
      osc.start(t); osc.stop(t + d + 0.05);
    }
  }
}

/** A breath of high sparkle over a chime — the "magic" on top of the bell. */
function sparkle(t, spread, vol) {
  const bus = voiceBus(vol);
  for (let i = 0; i < 7; i++) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 2100 + Math.random() * 3400;
    const g = ctx.createGain();
    const at = t + Math.random() * spread;
    const d = 0.18 + Math.random() * 0.5;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.06 + Math.random() * 0.07, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + d);
    osc.connect(g).connect(bus);
    osc.start(at); osc.stop(at + d + 0.05);
  }
}

const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0]; // C major pentatonic

/** Fate settles: a small rising figure coloured by the total. */
export function chime(total, diceCount) {
  if (muted || !ensure()) return;
  const t = ctx.currentTime;
  const notes = 2 + Math.min(2, Math.floor(diceCount / 3));
  const octave = total % 2 ? 1 : 0.5;
  for (let i = 0; i < notes; i++) {
    bell(PENTA[(total + i * 2) % PENTA.length] * octave, t + i * 0.1, 2.6, 0.14);
  }
  sparkle(t + 0.06, 0.4, 0.5);
}

/** Natural 20 — a rising sparkle with the vault ringing under it. */
export function critFanfare() {
  if (muted || !ensure()) return;
  const t = ctx.currentTime;
  [523.25, 659.25, 783.99, 1046.5, 1318.5]
    .forEach((f, i) => bell(f, t + i * 0.075, 3.0, 0.15));
  sparkle(t + 0.1, 0.75, 0.85);
  // A low bloom underneath so the flourish has weight.
  bell(130.81, t, 3.4, 0.1);
}

/** Natural 1 — a low sigh, the minor second rubbing against itself. */
export function fumbleKnell() {
  if (muted || !ensure()) return;
  const t = ctx.currentTime;
  bell(146.83, t, 3.2, 0.2);
  bell(155.56, t + 0.14, 3.4, 0.15); // minor second rub
}

/**
 * A pair matched. Struck as the SAME note twice — one bell answering the
 * other a beat later, which is the sound of the thing it is announcing.
 * `face` colours the pitch so snake eyes and double twenties differ.
 */
export function doublesChime(face = 1) {
  if (muted || !ensure()) return;
  const t = ctx.currentTime;
  const note = PENTA[face % PENTA.length];
  bell(note, t, 2.8, 0.15);
  bell(note, t + 0.17, 2.8, 0.13);
  bell(note * 2, t + 0.34, 2.4, 0.08);
  sparkle(t + 0.1, 0.5, 0.6);
}
