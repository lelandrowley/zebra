// Physics world: a circular tray with invisible walls, fixed-step simulation.
// Stepping is fixed-dt with an accumulator so a given fate seed always plays
// out the same roll, frame rate be damned.

import * as CANNON from 'cannon-es';

export const TRAY_RADIUS = 6.4;
const CEILING_Y = 11.5;
const FIXED_DT = 1 / 120;
// Generous catch-up budget so slow devices stay real-time instead of slow-mo.
const MAX_STEPS = 20;

export function createPhysics() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -38, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;
  world.defaultContactMaterial.friction = 0.25;
  world.defaultContactMaterial.restitution = 0.3;

  const diceMat = new CANNON.Material('dice');
  const floorMat = new CANNON.Material('floor');
  const wallMat = new CANNON.Material('wall');

  world.addContactMaterial(new CANNON.ContactMaterial(diceMat, floorMat, {
    friction: 0.34, restitution: 0.26,
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(diceMat, wallMat, {
    friction: 0.1, restitution: 0.35,
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(diceMat, diceMat, {
    friction: 0.24, restitution: 0.3,
  }));

  const floor = new CANNON.Body({ mass: 0, material: floorMat, shape: new CANNON.Plane() });
  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(floor);

  // Invisible cylindrical wall built from box segments. Two properties are
  // load-bearing, and `npm run containment` fails if either is lost:
  //   * the wall must reach ABOVE the ceiling. Dice peak near y = 11 on a
  //     crowded throw, so a wall that stops short of the ceiling leaves a
  //     band they sail straight out through.
  //   * it must be thick. Dice wedged against the wall get ejected by the
  //     contact solver at speeds that tunnel a thin wall in one fixed step.
  // The inner face stays exactly at TRAY_RADIUS, so thickness grows outward
  // and the play area is unchanged.
  const SEGMENTS = 20;
  const wallHeight = CEILING_Y + 2.5;
  const wallHalfThickness = 1.1;
  const segLen = (2 * Math.PI * TRAY_RADIUS) / SEGMENTS;
  for (let i = 0; i < SEGMENTS; i++) {
    const a = (i / SEGMENTS) * Math.PI * 2;
    const body = new CANNON.Body({
      mass: 0,
      material: wallMat,
      // Overlap generously along the arc: at the outset radius the segments
      // must still meet, with margin, or dice squirt through the seams.
      shape: new CANNON.Box(new CANNON.Vec3(segLen * 0.8, wallHeight / 2, wallHalfThickness)),
    });
    body.position.set(
      Math.cos(a) * (TRAY_RADIUS + wallHalfThickness),
      wallHeight / 2,
      Math.sin(a) * (TRAY_RADIUS + wallHalfThickness),
    );
    body.quaternion.setFromEuler(0, -a + Math.PI / 2, 0);
    world.addBody(body);
  }

  // Ceiling keeps wild throws inside the vault.
  const ceiling = new CANNON.Body({ mass: 0, material: wallMat, shape: new CANNON.Plane() });
  ceiling.quaternion.setFromEuler(Math.PI / 2, 0, 0);
  ceiling.position.set(0, CEILING_Y, 0);
  world.addBody(ceiling);

  let acc = 0;
  return {
    world,
    diceMaterial: diceMat,
    /**
     * Advance simulation. afterStep runs inside every fixed step so extra
     * forces (the tray's "felt") stay deterministic across frame rates.
     */
    step(dtSeconds, afterStep) {
      acc = Math.min(acc + dtSeconds, FIXED_DT * MAX_STEPS);
      let n = 0;
      while (acc >= FIXED_DT) {
        world.step(FIXED_DT);
        afterStep?.(FIXED_DT);
        acc -= FIXED_DT;
        n++;
      }
      return n;
    },
  };
}

// Felt drag per fixed step: rigid-body sims have no rolling resistance, so
// round dice (d10/d12/d20) would orbit the tray like roulette balls forever.
// Once a die is near the floor and its tumble has slowed, the felt grabs it.
const FELT_SPIN = Math.pow(0.09, FIXED_DT);  // ~11x angular decay per second
const FELT_SLIDE = Math.pow(0.22, FIXED_DT); // ~4.5x linear decay per second

// Dice must never leave the dish. The wall bodies alone don't guarantee it:
// cannon-es generates convex-polyhedron-vs-box contacts unreliably once dice
// stack up against the wall, so dice creep through at ordinary speeds (~11
// units/s, ~0.1 per step) rather than tunnelling. This is the backstop — a
// radial constraint plus a speed ceiling, both applied INSIDE the fixed step
// so they stay deterministic, same as applyFelt.
const MAX_SPEED = 25;
const MAX_SPIN = 45;
const WALL_RESTITUTION = 0.35; // matches the dice/wall contact material

export function applyContainment(body, radius) {
  const s = body.velocity.length();
  if (s > MAX_SPEED) body.velocity.scale(MAX_SPEED / s, body.velocity);
  const w = body.angularVelocity.length();
  if (w > MAX_SPIN) body.angularVelocity.scale(MAX_SPIN / w, body.angularVelocity);

  const p = body.position;
  const r = Math.hypot(p.x, p.z);
  // Hold the die's centre far enough in that its corners stay behind the
  // visible dish wall, which sits outside TRAY_RADIUS.
  const limit = TRAY_RADIUS - radius * 0.5;
  if (r <= limit || r === 0) return;
  const nx = p.x / r, nz = p.z / r;
  p.x = nx * limit;
  p.z = nz * limit;
  const outward = body.velocity.x * nx + body.velocity.z * nz;
  if (outward > 0) {
    const kick = outward * (1 + WALL_RESTITUTION);
    body.velocity.x -= nx * kick;
    body.velocity.z -= nz * kick;
  }
}

export function applyFelt(body, radius) {
  if (body.sleepState === CANNON.Body.SLEEPING) return;
  if (body.position.y > radius * 1.3) return;
  const w = body.angularVelocity.length();
  if (w < 7) {
    body.angularVelocity.scale(FELT_SPIN, body.angularVelocity);
    if (body.velocity.length() < 3.5) {
      body.velocity.x *= FELT_SLIDE;
      body.velocity.z *= FELT_SLIDE;
    }
  }
}
