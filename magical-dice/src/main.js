// Fatewoven — a magical dice roller.
// main.js owns the loop: physics ⇄ dice ⇄ scene ⇄ ui, and the thread of fate.

import './style.css';
import * as THREE from 'three';
import { createScene } from './scene.js';
import { createPhysics, applyFelt, applyContainment, TRAY_RADIUS } from './physics.js';
import { Die } from './dice/die.js';
import { STYLES, styleById, clearMaterialCache, tickInfusedGlow } from './dice/materials.js';
import { typoKeyOf } from './dice/faces.js';
import { DIE_TYPES, DIE_SCALE } from './dice/geometry.js';
import { createGame, gameById } from './games.js';
import { Fate } from './rng.js';
import * as audio from './audio.js';
import { impactHaptic, resultHaptic, isNativeApp } from './haptics.js';
import { initUI, MAX_DICE } from './ui.js';

const STORE_KEY = 'fatewoven-v1';

// Storage access THROWS in sandboxed iframes (artifact hosts, some embeds) —
// every touch goes through these guards so the app still boots there.
const storeGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const storeSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* opaque origin / private mode */ } };

const defaults = () => ({
  loadout: { d4: 1, d6: 1, d8: 1, d10: 1, d12: 1, d20: 1 },
  styleId: 'amethyst',
  motley: false,
  typo: { font: 'cinzel', size: 92, bold: false, ink: 'auto', glow: true, underline: true, motif: 'none' },
  seeds: ['', '', ''],
  sound: true,
  wisps: false,
  gameId: null,
});

function loadState() {
  try {
    const raw = JSON.parse(storeGet(STORE_KEY) ?? 'null');
    if (!raw) return defaults();
    const d = defaults();
    return {
      ...d, ...raw,
      loadout: { ...d.loadout, ...(raw.loadout ?? {}) },
      typo: { ...d.typo, ...(raw.typo ?? {}) },
      seeds: Array.isArray(raw.seeds) && raw.seeds.length === 3 ? raw.seeds : d.seeds,
    };
  } catch {
    return defaults();
  }
}

function saveState(state) {
  storeSet(STORE_KEY, JSON.stringify(state));
}

async function loadFonts() {
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('700 90px Cinzel'),
        document.fonts.load('400 90px Cinzel'),
        document.fonts.load("400 90px 'Uncial Antiqua'"),
      ]),
      new Promise((r) => setTimeout(r, 1800)),
    ]);
  } catch { /* fall back to system stacks */ }
}

function boot() {
  const canvas = document.getElementById('scene');
  let view;
  try {
    view = createScene(canvas);
  } catch (err) {
    console.error(err);
    document.getElementById('app').innerHTML =
      '<div class="fallback">This browser could not conjure WebGL, which Fatewoven needs for its dice. Try a recent Chrome, Firefox or Safari.</div>';
    return;
  }

  const state = loadState();
  view.setWisps(state.wisps);
  const physics = createPhysics();
  const fate = new Fate();
  fate.weave(...state.seeds);
  let simSteps = 0;

  const dice = [];
  let rolling = false;
  let quietRoll = false;   // the welcome pour: settle silently, no verdict
  let rollDeadlineStep = 0; // in sim steps, so slow devices stay deterministic
  let chargeUntil = 0;
  let lastClack = 0;
  const activeChips = [];
  const chipAnchor = new THREE.Vector3();

  let game = null;             // the active game engine, or null in free-roll mode
  let preGameLoadout = null;   // the player's own loadout, remembered across a game

  audio.setMuted(!state.sound);

  // ---- dice management -----------------------------------------------------

  function motleyStyleId(i) {
    return STYLES[(i * 5 + 2) % STYLES.length].id;
  }

  function buildDice() {
    for (const die of dice) {
      view.scene.remove(die.mesh);
      physics.world.removeBody(die.body);
    }
    dice.length = 0;
    const typoKey = typoKeyOf(state.typo);
    let i = 0;
    for (const type of DIE_TYPES) {
      for (let n = 0; n < state.loadout[type]; n++, i++) {
        const styleId = state.motley ? motleyStyleId(i) : state.styleId;
        const die = new Die(type, styleId, state.typo, typoKey);
        die.body.material = physics.diceMaterial;
        die.body.addEventListener('collide', (e) => onDieImpact(die, e));
        view.scene.add(die.mesh);
        physics.world.addBody(die.body);
        dice.push(die);
      }
    }
  }

  function restyleDice() {
    clearMaterialCache();
    const typoKey = typoKeyOf(state.typo);
    dice.forEach((die, i) => {
      die.setStyle(state.motley ? motleyStyleId(i) : state.styleId, state.typo, typoKey);
    });
  }

  // ---- rolling -------------------------------------------------------------

  function throwAll({ quiet = false, power = 1 } = {}) {
    if (dice.length === 0) return;
    rolling = true;
    quietRoll = quiet;
    rollDeadlineStep = simSteps + 12 * 120;
    clearChips();
    ui.hideVerdict();
    ui.setRolling(true);
    view.setRolling(true);
    // One base angle for the whole throw — see Die.throwFrom.
    const baseAngle = fate.next() * Math.PI * 2;
    dice.forEach((die, i) => {
      die.throwFrom(fate, i, dice.length, TRAY_RADIUS * 0.8, baseAngle);
      if (power !== 1) {
        die.body.velocity.scale(power, die.body.velocity);
        die.body.angularVelocity.scale(power, die.body.angularVelocity);
      }
    });
  }

  function roll() {
    const now = performance.now();
    if (now < chargeUntil) return;
    chargeUntil = now + 350;
    audio.unlockAudio();
    if (dice.length === 0) {
      ui.toast('Choose your dice first — the tray is empty.');
      return;
    }
    if (game && !game.canRoll()) {
      ui.toast('This game is over — play again or exit the table.');
      return;
    }
    throwAll();
  }

  function clearChips() {
    activeChips.length = 0;
    ui.clearChips();
  }

  // ---- games -----------------------------------------------------------

  function applyLoadoutChange() {
    saveState(state);
    buildDice();
    throwAll({ quiet: true, power: 0.55 });
  }

  function refreshGameHUD() {
    const def = state.gameId ? gameById(state.gameId) : null;
    ui.renderGameHUD(game && def ? {
      name: def.name,
      status: game.status(),
      actions: game.actions(),
      over: game.isOver(),
      result: game.isOver() ? game.result() : null,
    } : null);
  }

  function enterGame(id) {
    const def = gameById(id);
    if (!def) return;
    if (!game) preGameLoadout = { ...state.loadout };
    game = createGame(id);
    state.gameId = id;
    state.loadout = { ...game.loadout };
    applyLoadoutChange();
    refreshGameHUD();
  }

  function leaveGame() {
    if (!game) return;
    game = null;
    state.gameId = null;
    state.loadout = preGameLoadout ? { ...preGameLoadout } : { ...defaults().loadout };
    preGameLoadout = null;
    applyLoadoutChange();
    refreshGameHUD();
  }

  function settle() {
    // Cocked dice get a deterministic nudge (twice at most).
    const cocked = dice.filter((d) => d.isCocked() && d.nudges < 2);
    if (cocked.length > 0) {
      cocked.forEach((d) => d.nudge(fate));
      return; // still rolling
    }

    rolling = false;
    ui.setRolling(false);
    view.setRolling(false);

    if (quietRoll) return;

    let total = 0;
    let crit = false, fumble = false;
    const parts = [];
    for (const die of dice) {
      const { value } = die.read();
      die.lastValue = value;
      total += value;
      parts.push(value);
      const isCrit = die.type === 'd20' && value === 20;
      const isFumble = die.type === 'd20' && value === 1;
      crit ||= isCrit;
      fumble ||= isFumble;
      const style = styleById(die.styleId);
      const chip = ui.addChip({
        value, type: die.type, color: style.swatch[0], crit: isCrit, fumble: isFumble,
      });
      activeChips.push({ die, chip });
      view.burst(die.mesh.position, isCrit ? '#ffe3a1' : style.swatch[0]);
    }

    // Doubles are only meaningful on a pair — with three dice "two the same"
    // is ordinary, and with one there is nothing to match.
    const doubles = dice.length === 2 && parts[0] === parts[1];

    if (game) {
      // A game HUD plus a giant unrelated total would be noise — the HUD's
      // own score takes over the hero spot while a game is active.
      game.onRoll(parts);
      refreshGameHUD();
    } else {
      ui.showVerdict({ total, single: dice.length === 1, crit, fumble, doubles });
    }
    if (crit) audio.critFanfare();
    else if (fumble) audio.fumbleKnell();
    else if (doubles) audio.doublesChime(parts[0]);
    else audio.chime(total, dice.length);
    resultHaptic(crit ? 'crit' : fumble ? 'fumble' : doubles ? 'crit' : 'normal');

    const label = DIE_TYPES.filter((t) => state.loadout[t] > 0)
      .map((t) => (state.loadout[t] > 1 ? `${state.loadout[t]}${t}` : t)).join('+');
    ui.addChronicle({
      total,
      label,
      parts: dice.length > 1 && dice.length <= 8 ? parts.join('+') : '',
    });
  }

  function onDieImpact(die, event) {
    const now = performance.now();
    const impact = Math.abs(event.contact.getImpactVelocityAlongNormal());
    if (impact < 2.2 || now - lastClack < 45) return;
    lastClack = now;
    audio.clack(Math.min(1, impact / 14), DIE_SCALE[die.type]);
    impactHaptic(impact > 8);
    if (impact > 4 && rolling) {
      const p = die.body.position;
      view.spawnSparks(
        new THREE.Vector3(p.x, Math.max(0.06, p.y - 0.4), p.z),
        styleById(die.styleId).swatch[0],
        Math.min(10, 3 + impact | 0),
        1.6,
        1.1,
      );
    }
  }

  // ---- ui ------------------------------------------------------------------

  const ui = initUI(state, {
    onRoll: roll,
    onLoadoutChange() {
      applyLoadoutChange();
    },
    onGameSelect(id) {
      enterGame(id);
    },
    onGameLeave() {
      leaveGame();
    },
    onGameAction(id) {
      if (!game) return;
      game.act(id);
      refreshGameHUD();
    },
    onGameReset() {
      if (!game) return;
      game.reset();
      refreshGameHUD();
    },
    onStyleChange() {
      saveState(state);
      restyleDice();
      ui.drawTypePreview();
    },
    onTypoChange() {
      saveState(state);
      restyleDice();
    },
    onWeave() {
      saveState(state);
      fate.weave(...state.seeds);
      ui.setSigil(fate.sigil());
      ui.toast('The thread is rewoven. Your fate begins anew ✦');
      throwAll({ quiet: true, power: 0.55 });
    },
    onSoundToggle() {
      saveState(state);
      audio.setMuted(!state.sound);
      if (state.sound) audio.unlockAudio();
    },
    onWispsToggle() {
      saveState(state);
      view.setWisps(state.wisps);
    },
  });

  ui.setSigil(fate.sigil());

  // ---- boot + loop ---------------------------------------------------------

  // Resume a game left active in a previous session — gameId is persisted,
  // but the game engine's own progress (score, round, pot…) is not, so this
  // is a fresh instance of whichever game was active, not a mid-round resume.
  if (state.gameId && gameById(state.gameId)) {
    game = createGame(state.gameId);
    state.loadout = { ...game.loadout };
  }

  buildDice();
  throwAll({ quiet: true, power: 0.55 });
  refreshGameHUD();

  if (!storeGet('fatewoven-greeted')) {
    setTimeout(() => {
      ui.toast('Answer the three questions under Fate — your answers weave the dice’s destiny ✦', 6000);
      storeSet('fatewoven-greeted', '1');
    }, 1600);
  }

  // debug hook for the headless test harness
  window.__FW_DEBUG__ = {
    dice: () => dice.map((d) => ({
      type: d.type,
      sleep: ['awake', 'sleepy', 'asleep'][d.body.sleepState],
      v: d.body.velocity.length(),
      w: d.body.angularVelocity.length(),
      x: d.body.position.x,
      y: d.body.position.y,
      z: d.body.position.z,
    })),
    /** Radial distance of the die furthest from the tray centre. */
    maxRadius: () => dice.reduce((m, d) =>
      Math.max(m, Math.hypot(d.body.position.x, d.body.position.z)), 0),
    asleep: () => dice.length > 0 && dice.every((d) => d.sleeping),
    rolling: () => rolling,
    values: () => dice.map((d) => d.lastValue),
    reads: () => dice.map((d) => ({ type: d.type, ...d.read() })),
    draws: () => fate.drawCount,
    simTime: () => simSteps / 120,
    mapURL: (i, face) => dice[i]?.mesh.material[face]?.map?.image?.toDataURL(),
    matInfo: (i) => dice[i]?.mesh.material.map((m) => ({
      hasMap: !!m.map, mapSize: m.map?.image?.width,
      emissive: !!m.emissiveMap, trans: !!m.transmissionMap,
    })),
  };

  const timer = new THREE.Timer();
  let lastTick = 0;

  function frame(now) {
    lastTick = performance.now();
    requestAnimationFrame(frame);
    step(now);
  }

  function step(now) {
    timer.update(now);
    const dt = Math.min(timer.getDelta(), 0.1);
    const t = timer.getElapsed();

    simSteps += physics.step(dt, () => {
      for (const die of dice) {
        applyFelt(die.body, die.def.radius);
        applyContainment(die.body, die.def.radius);
      }
    });
    for (const die of dice) die.syncVisual();

    if (rolling) {
      const allAsleep = dice.every((d) => d.sleeping);
      if (allAsleep || simSteps > rollDeadlineStep) settle();
    }

    // The infused gems breathe. Cosmetic and time-driven, so it never touches
    // the fate stream or the fixed physics step.
    tickInfusedGlow(t);

    // keep result chips pinned above their dice
    for (const { die, chip } of activeChips) {
      chipAnchor.copy(die.mesh.position);
      chipAnchor.y += die.def.radius * 1.15;
      ui.positionChip(chip, view.project(chipAnchor));
    }

    view.update(dt, t);
  }
  frame();

  // Some sandboxed iframes (e.g. artifact hosts) park requestAnimationFrame
  // entirely. If rAF goes silent while we're visible, drive frames on a timer.
  // Two courtesies keep this from wedging the main thread: back off when a
  // frame is expensive (software rasterizers), and stop entirely on unload so
  // navigation tasks are never starved.
  let watchdogBusyUntil = 0;
  const watchdogId = setInterval(() => {
    const now = performance.now();
    if (now - lastTick <= 400 || now < watchdogBusyUntil) return;
    if (document.visibilityState !== 'visible') return;
    step(now);
    const cost = performance.now() - now;
    if (cost > 50) watchdogBusyUntil = performance.now() + cost * 6;
  }, 33);
  window.addEventListener('pagehide', () => clearInterval(watchdogId));
}

loadFonts().then(boot);

// Offline support when hosted over https (skipped inside the native app,
// where Capacitor serves the bundled assets itself).
if ('serviceWorker' in navigator && location.protocol === 'https:' && !isNativeApp) {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* not critical */ });
}
