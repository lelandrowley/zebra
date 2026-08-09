// Physics world: a circular tray with invisible walls, fixed-step simulation.
// Stepping is fixed-dt with an accumulator so a given fate seed always plays
// out the same roll, frame rate be damned.

import * as CANNON from 'cannon-es';

export const TRAY_RADIUS = 6.4;
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

  // Invisible cylindrical wall built from box segments.
  const SEGMENTS = 20;
  const wallHeight = 10;
  const segLen = (2 * Math.PI * TRAY_RADIUS) / SEGMENTS;
  for (let i = 0; i < SEGMENTS; i++) {
    const a = (i / SEGMENTS) * Math.PI * 2;
    const body = new CANNON.Body({
      mass: 0,
      material: wallMat,
      shape: new CANNON.Box(new CANNON.Vec3(segLen * 0.62, wallHeight / 2, 0.35)),
    });
    body.position.set(
      Math.cos(a) * (TRAY_RADIUS + 0.35),
      wallHeight / 2,
      Math.sin(a) * (TRAY_RADIUS + 0.35),
    );
    body.quaternion.setFromEuler(0, -a + Math.PI / 2, 0);
    world.addBody(body);
  }

  // Ceiling keeps wild throws inside the vault.
  const ceiling = new CANNON.Body({ mass: 0, material: wallMat, shape: new CANNON.Plane() });
  ceiling.quaternion.setFromEuler(Math.PI / 2, 0, 0);
  ceiling.position.set(0, 11.5, 0);
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
