// A single die: visual mesh + cannon body + value reading.

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { buildDie, DIE_SCALE, DIE_MASS } from './geometry.js';
import { getDieMaterials, styleById } from './materials.js';

export const BASE_RADIUS = 0.78;

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class Die {
  constructor(type, styleId, typo, typoKey) {
    this.type = type;
    this.styleId = styleId;
    this.def = buildDie(type, BASE_RADIUS * DIE_SCALE[type]);

    this.mesh = new THREE.Mesh(
      this.def.geometry,
      getDieMaterials(this.def, styleById(styleId), typo, typoKey),
    );
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;

    const shape = new CANNON.ConvexPolyhedron({
      vertices: this.def.cannon.verts.map((v) => new CANNON.Vec3(v[0], v[1], v[2])),
      faces: this.def.cannon.faces.map((f) => f.slice()),
    });
    this.body = new CANNON.Body({
      mass: DIE_MASS[type],
      shape,
      allowSleep: true,
      sleepSpeedLimit: 0.75,
      sleepTimeLimit: 0.18,
    });
    // Reads as air drag + the felt of the tray; kills endless rattling.
    this.body.linearDamping = 0.24;
    this.body.angularDamping = 0.28;

    this.nudges = 0;
    this.lastValue = null;
  }

  setMaterials(typo, typoKey) {
    this.mesh.material = getDieMaterials(this.def, styleById(this.styleId), typo, typoKey);
  }

  setStyle(styleId, typo, typoKey) {
    this.styleId = styleId;
    this.setMaterials(typo, typoKey);
  }

  syncVisual() {
    this.mesh.position.copy(this.body.position);
    this.mesh.quaternion.copy(this.body.quaternion);
  }

  get sleeping() {
    return this.body.sleepState === CANNON.Body.SLEEPING;
  }

  /** Place + hurl the die. All randomness drawn from the fate stream. */
  throwFrom(fate, index, count, trayRadius) {
    const body = this.body;
    body.wakeUp();
    this.nudges = 0;
    this.lastValue = null;

    // Enter from around the rim, spread out so dice don't clump or overlap.
    const baseAngle = fate.next() * Math.PI * 2;
    const angle = baseAngle + (index / Math.max(count, 1)) * Math.PI * 1.7 + fate.range(-0.25, 0.25);
    const rr = trayRadius * fate.range(0.6, 0.85);
    body.position.set(
      Math.cos(angle) * rr,
      2.1 + index * 0.55 + fate.next() * 0.4,
      Math.sin(angle) * rr,
    );

    _q.setFromEuler(new THREE.Euler(
      fate.next() * Math.PI * 2, fate.next() * Math.PI * 2, fate.next() * Math.PI * 2));
    body.quaternion.set(_q.x, _q.y, _q.z, _q.w);

    // Fling toward (roughly) the centre with plenty of tumble.
    const toC = _v.set(-body.position.x, 0, -body.position.z).normalize();
    const speed = fate.range(6.5, 10);
    const swirl = fate.range(-2.2, 2.2);
    body.velocity.set(
      toC.x * speed - toC.z * swirl,
      fate.range(-2.5, -0.5),
      toC.z * speed + toC.x * swirl,
    );
    body.angularVelocity.set(fate.range(-22, 22), fate.range(-22, 22), fate.range(-22, 22));
  }

  /** Gentle deterministic kick for a die that settled cocked against a wall. */
  nudge(fate) {
    this.nudges++;
    this.body.wakeUp();
    this.body.velocity.set(fate.range(-1.6, 1.6), fate.range(2.4, 3.4), fate.range(-1.6, 1.6));
    this.body.angularVelocity.set(fate.range(-9, 9), fate.range(-9, 9), fate.range(-9, 9));
  }

  /**
   * Read the die. Returns { value, dot } where dot is the up-alignment of the
   * winning face (1 = perfectly flat; low dot means the die is cocked).
   */
  read() {
    const q = this.body.quaternion;
    if (this.type === 'd4') {
      // Highest vertex names the value.
      let best = -Infinity, value = 1;
      this.def.verts.forEach((v, i) => {
        const w = new CANNON.Vec3();
        q.vmult(new CANNON.Vec3(v[0], v[1], v[2]), w);
        if (w.y > best) { best = w.y; value = this.def.vertexValues[i]; }
      });
      // A resting tetra's top vertex alignment: compare against its own radius.
      return { value, dot: best / this.def.radius };
    }
    let value = 1, bestDot = -Infinity;
    this.def.faces.forEach((f, i) => {
      const w = new CANNON.Vec3();
      q.vmult(new CANNON.Vec3(f.normal[0], f.normal[1], f.normal[2]), w);
      if (w.y > bestDot) { bestDot = w.y; value = this.def.values[i]; }
    });
    return { value, dot: bestDot };
  }

  isCocked() {
    const { dot } = this.read();
    return this.type === 'd4' ? dot < 0.6 : dot < 0.78;
  }
}
