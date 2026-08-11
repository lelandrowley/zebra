// Containment check: dice must never leave the tray.
//
// Physics-only, so it needs no browser and replays hundreds of rolls in
// seconds — cannon-es and geometry.js are pure JS. It replicates main.js's
// step loop and die.js's throwFrom verbatim; if either changes, mirror it here.
//
//   node scripts/verify-containment.mjs
//   DICE=12 ROLLS=400 TYPES=d20 node scripts/verify-containment.mjs

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createPhysics, applyFelt, applyContainment, TRAY_RADIUS } from '../src/physics.js';
import { buildDie, DIE_SCALE, DIE_MASS } from '../src/dice/geometry.js';
import { Fate } from '../src/rng.js';

const BASE_RADIUS = 0.78; // mirrors die.js
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

function makeDie(type) {
  const def = buildDie(type, BASE_RADIUS * DIE_SCALE[type]);
  const body = new CANNON.Body({
    mass: DIE_MASS[type],
    shape: new CANNON.ConvexPolyhedron({
      vertices: def.cannon.verts.map((v) => new CANNON.Vec3(v[0], v[1], v[2])),
      faces: def.cannon.faces.map((f) => f.slice()),
    }),
    allowSleep: true, sleepSpeedLimit: 0.75, sleepTimeLimit: 0.18,
  });
  body.linearDamping = 0.24;
  body.angularDamping = 0.28;
  return { type, def, body };
}

/** Verbatim from die.js throwFrom — keep in sync. */
function throwFrom(die, fate, index, count, trayRadius, baseAngle) {
  const body = die.body;
  body.wakeUp();
  const angle = baseAngle + (index / Math.max(count, 1)) * Math.PI * 2 + fate.range(-0.08, 0.08);
  const rr = trayRadius * fate.range(0.72, 0.92);
  body.position.set(Math.cos(angle) * rr, 2.1 + (index % 2) * 0.95 + fate.next() * 0.3, Math.sin(angle) * rr);
  _q.setFromEuler(new THREE.Euler(
    fate.next() * Math.PI * 2, fate.next() * Math.PI * 2, fate.next() * Math.PI * 2));
  body.quaternion.set(_q.x, _q.y, _q.z, _q.w);
  const toC = _v.set(-body.position.x, 0, -body.position.z).normalize();
  const speed = fate.range(6.5, 10);
  const swirl = fate.range(-2.2, 2.2);
  body.velocity.set(toC.x * speed - toC.z * swirl, fate.range(-2.5, -0.5), toC.z * speed + toC.x * swirl);
  body.angularVelocity.set(fate.range(-22, 22), fate.range(-22, 22), fate.range(-22, 22));
}

const COUNT = Number(process.env.DICE ?? 12);
const ROLLS = Number(process.env.ROLLS ?? 300);
const TYPES = (process.env.TYPES ?? 'd20,d12,d10,d8,d6,d4').split(',');

const physics = createPhysics();
const dice = [];
for (let i = 0; i < COUNT; i++) {
  const d = makeDie(TYPES[i % TYPES.length]);
  d.body.material = physics.diceMaterial;
  physics.world.addBody(d.body);
  dice.push(d);
}

const fate = new Fate();
fate.weave('', '', '');

let escapes = 0, rollsWithEscape = 0, worst = 0, peakY = 0, neverSettled = 0;
const detail = [];

for (let r = 0; r < ROLLS; r++) {
  const baseAngle = fate.next() * Math.PI * 2;
  dice.forEach((d, i) => throwFrom(d, fate, i, dice.length, TRAY_RADIUS * 0.8, baseAngle));
  let steps = 0;
  const LIMIT = 12 * 120; // same sim-step deadline main.js uses
  while (steps < LIMIT) {
    steps += physics.step(1 / 60, () => {
      for (const d of dice) { applyFelt(d.body, d.def.radius); applyContainment(d.body, d.def.radius); }
    });
    for (const d of dice) peakY = Math.max(peakY, d.body.position.y);
    if (dice.every((d) => d.body.sleepState === CANNON.Body.SLEEPING)) break;
  }
  if (steps >= LIMIT) neverSettled++;
  const radii = dice.map((d) => Math.hypot(d.body.position.x, d.body.position.z));
  worst = Math.max(worst, ...radii);
  const out = radii.filter((x) => x > TRAY_RADIUS).length;
  if (out) {
    rollsWithEscape++;
    escapes += out;
    if (detail.length < 6) {
      const i = radii.findIndex((x) => x > TRAY_RADIUS);
      detail.push(`roll ${r + 1}: ${dice[i].type} escaped to r=${radii[i].toFixed(2)}`);
    }
  }
}

for (const line of detail) console.log('  ' + line);
console.log(`${COUNT} dice x ${ROLLS} rolls — escaped ${escapes}, ` +
  `rolls affected ${rollsWithEscape}/${ROLLS}, furthest r=${worst.toFixed(2)} ` +
  `(wall at ${TRAY_RADIUS}), peak y=${peakY.toFixed(2)}, never-settled ${neverSettled}`);
console.log('CONTAINMENT:', escapes === 0 ? 'PASS' : 'FAIL');
process.exit(escapes === 0 ? 0 : 1);
