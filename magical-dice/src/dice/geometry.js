// Dice solids, built from raw vertex sets.
//
// Faces are discovered by supporting-plane enumeration (every hull face plane
// contains >= 3 vertices with all others strictly inside), so tetra through
// icosa — and the d10's pentagonal trapezohedron — share one code path.
// Visual meshes get chamfered edges; physics uses the sharp polyhedron.

import * as THREE from 'three';

const PHI = (1 + Math.sqrt(5)) / 2;

function rawVertices(type) {
  switch (type) {
    case 'd4':
      return [[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]];
    case 'd6': {
      const v = [];
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push([x, y, z]);
      return v;
    }
    case 'd8':
      return [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    case 'd10': {
      // Pentagonal trapezohedron with poles on Y. The ring offset c makes each
      // kite exactly planar: c = (1 - cos36°) / (1 + cos36°).
      const c = (1 - Math.cos(Math.PI / 5)) / (1 + Math.cos(Math.PI / 5));
      const v = [[0, 1, 0], [0, -1, 0]];
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI * i) / 5;
        v.push([Math.cos(a), c * (i % 2 ? 1 : -1), Math.sin(a)]);
      }
      return v;
    }
    case 'd12': {
      const v = [];
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push([x, y, z]);
      for (const s of [-1, 1]) for (const t of [-1, 1]) {
        v.push([0, s / PHI, t * PHI]);
        v.push([s / PHI, t * PHI, 0]);
        v.push([s * PHI, 0, t / PHI]);
      }
      return v;
    }
    case 'd20': {
      const v = [];
      for (const s of [-1, 1]) for (const t of [-1, 1]) {
        v.push([0, s, t * PHI]);
        v.push([s, t * PHI, 0]);
        v.push([s * PHI, 0, t]);
      }
      return v;
    }
    default:
      throw new Error(`unknown die type ${type}`);
  }
}

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

/** Enumerate hull faces as vertex-index polygons, CCW seen from outside. */
function discoverFaces(verts) {
  const n = verts.length;
  const eps = 1e-4;
  const planes = [];

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const a = V(verts[i]), b = V(verts[j]), c = V(verts[k]);
        const nrm = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
        if (nrm.lengthSq() < 1e-12) continue;
        nrm.normalize();
        let d = nrm.dot(a);
        if (d < 0) { nrm.negate(); d = -d; }
        if (d < 1e-6) continue; // plane through the centroid can't be a hull face
        let outside = false;
        for (let m = 0; m < n; m++) {
          if (nrm.dot(V(verts[m])) > d + eps) { outside = true; break; }
        }
        if (outside) continue;
        if (!planes.some((p) => p.normal.dot(nrm) > 0.9999 && Math.abs(p.d - d) < eps)) {
          planes.push({ normal: nrm, d });
        }
      }
    }
  }

  const faces = [];
  for (const { normal, d } of planes) {
    const members = [];
    for (let m = 0; m < n; m++) {
      if (Math.abs(normal.dot(V(verts[m])) - d) < eps) members.push(m);
    }
    if (members.length < 3) continue;
    // Order members by angle around the face centroid.
    const centroid = members
      .reduce((acc, m) => acc.add(V(verts[m])), new THREE.Vector3())
      .multiplyScalar(1 / members.length);
    const u = V(verts[members[0]]).sub(centroid).normalize();
    const w = new THREE.Vector3().crossVectors(normal, u);
    members.sort((m1, m2) => {
      const p1 = V(verts[m1]).sub(centroid), p2 = V(verts[m2]).sub(centroid);
      return Math.atan2(p1.dot(w), p1.dot(u)) - Math.atan2(p2.dot(w), p2.dot(u));
    });
    // Ensure CCW seen from outside (Newell normal along the plane normal).
    const newell = new THREE.Vector3();
    for (let i = 0; i < members.length; i++) {
      const p = V(verts[members[i]]), q = V(verts[members[(i + 1) % members.length]]);
      newell.x += (p.y - q.y) * (p.z + q.z);
      newell.y += (p.z - q.z) * (p.x + q.x);
      newell.z += (p.x - q.x) * (p.y + q.y);
    }
    if (newell.dot(normal) < 0) members.reverse();
    faces.push({ indices: members, normal, d });
  }
  return faces;
}

/**
 * Assign face values so opposite faces sum to N+1 (like real dice).
 * The d4 gets vertex values instead (a resting tetrahedron shows no top face).
 */
function assignValues(faces) {
  const n = faces.length;
  const values = new Array(n).fill(0);
  const used = new Array(n).fill(false);
  const pairs = [];
  for (let i = 0; i < n; i++) {
    if (used[i]) continue;
    used[i] = true;
    let opp = -1;
    for (let j = i + 1; j < n; j++) {
      if (!used[j] && faces[i].normal.dot(faces[j].normal) < -0.999) { opp = j; break; }
    }
    if (opp >= 0) { used[opp] = true; pairs.push([i, opp]); }
    else pairs.push([i]);
  }
  if (pairs.every((p) => p.length === 2)) {
    pairs.forEach((p, k) => { values[p[0]] = k + 1; values[p[1]] = n - k; });
  } else {
    faces.forEach((_, i) => { values[i] = i + 1; });
  }
  return values;
}

/** Per-face texture-space data used by the face painter. */
function faceUVData(face, verts, shrunk) {
  const { normal } = face;
  const pts = face.indices.map((_, i) => V(shrunk[i]));
  const centroid = pts.reduce((a, p) => a.add(p.clone()), new THREE.Vector3()).multiplyScalar(1 / pts.length);

  // "Up" in texture space points at the polygon's farthest corner (for a d10
  // kite that's the pole tip; for triangles any corner — numbers lean on it).
  let apex = 0, best = -1;
  pts.forEach((p, i) => {
    const d2 = p.distanceToSquared(centroid);
    if (d2 > best) { best = d2; apex = i; }
  });
  const up = pts[apex].clone().sub(centroid).normalize();
  const right = new THREE.Vector3().crossVectors(up, normal).normalize();

  let s = 0;
  const planar = pts.map((p) => {
    const q = p.clone().sub(centroid);
    const x = q.dot(right), y = q.dot(up);
    s = Math.max(s, Math.abs(x), Math.abs(y));
    return [x, y];
  });
  s *= 1.18; // margin so corners stay inside the texture

  const uvPoly = planar.map(([x, y]) => [0.5 + x / (2 * s), 0.5 + y / (2 * s)]);
  // Inradius (in UV units) of the polygon — sizes the numeral.
  let inr = Infinity;
  for (let i = 0; i < uvPoly.length; i++) {
    const [ax, ay] = uvPoly[i], [bx, by] = uvPoly[(i + 1) % uvPoly.length];
    const ex = bx - ax, ey = by - ay;
    const t = Math.max(0, Math.min(1, ((0.5 - ax) * ex + (0.5 - ay) * ey) / (ex * ex + ey * ey)));
    inr = Math.min(inr, Math.hypot(0.5 - (ax + t * ex), 0.5 - (ay + t * ey)));
  }
  return { uvPoly, uvCenter: [0.5, 0.5], uvInradius: inr, uvs: uvPoly };
}

function pushTri(arrays, pa, pb, pc, na, nb, nc, ua, ub, uc) {
  arrays.pos.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z, pc.x, pc.y, pc.z);
  arrays.nrm.push(na.x, na.y, na.z, nb.x, nb.y, nb.z, nc.x, nc.y, nc.z);
  arrays.uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
}

/**
 * Build the full die definition for a type. Cached per type.
 * Returns { type, sides, geometry, faceCount, faces, values, vertexValues,
 *           facePaint, cannon: {verts, faces}, radius }
 */
const cache = new Map();
export function buildDie(type, radius) {
  const key = `${type}:${radius}`;
  if (cache.has(key)) return cache.get(key);

  let raw = rawVertices(type);
  // Normalize to the requested circumscribed radius.
  const maxLen = Math.max(...raw.map((v) => Math.hypot(...v)));
  raw = raw.map((v) => v.map((c) => (c / maxLen) * radius));

  const faces = discoverFaces(raw);
  const values = assignValues(faces);
  const sides = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20 }[type];
  const chamfer = { d4: 0.09, d6: 0.13, d8: 0.11, d10: 0.1, d12: 0.1, d20: 0.1 }[type] ?? 0.1;

  // --- chamfered visual geometry -------------------------------------------
  // Shrink each face toward its centroid; connect with edge quads and corner fans.
  const shrunkByFace = faces.map((face) => {
    const centroid = face.indices
      .reduce((a, vi) => a.add(V(raw[vi])), new THREE.Vector3())
      .multiplyScalar(1 / face.indices.length);
    return face.indices.map((vi) => V(raw[vi]).lerp(centroid, chamfer));
  });

  const paint = faces.map((face, fi) => {
    const data = faceUVData(face, raw, shrunkByFace[fi].map((v) => [v.x, v.y, v.z]));
    return {
      ...data,
      value: values[fi],
      sides,
      // d4 corners carry the vertex numbers (read the top corner when at rest).
      cornerValues: type === 'd4' ? face.indices.map((vi) => vi + 1) : null,
    };
  });

  // Triangle soup per material (face index; bevel = faces.length).
  const perMaterial = [];
  for (let i = 0; i <= faces.length; i++) perMaterial.push({ pos: [], nrm: [], uv: [] });

  faces.forEach((face, fi) => {
    const pts = shrunkByFace[fi];
    const uv = paint[fi].uvPoly;
    const nn = face.normal;
    for (let i = 1; i < pts.length - 1; i++) {
      pushTri(perMaterial[fi], pts[0], pts[i], pts[i + 1], nn, nn, nn, uv[0], uv[i], uv[i + 1]);
    }
  });

  const bevel = perMaterial[faces.length];
  const sphereN = (p) => p.clone().normalize();
  const bevelUV = (p) => {
    // Cheap stable mapping into the middle of the blank texture.
    const q = sphereN(p);
    return [0.5 + q.x * 0.06, 0.5 + q.z * 0.06];
  };
  const addBevelTri = (a, b, c) => {
    // Wind outward (centroid at origin).
    const n1 = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (n1.dot(new THREE.Vector3().addVectors(a, b).add(c)) < 0) [b, c] = [c, b];
    pushTri(bevel, a, b, c, sphereN(a), sphereN(b), sphereN(c), bevelUV(a), bevelUV(b), bevelUV(c));
  };

  // Edge quads: for each edge shared by two faces, join their shrunk edges.
  const edgeMap = new Map();
  faces.forEach((face, fi) => {
    const m = face.indices.length;
    for (let i = 0; i < m; i++) {
      const a = face.indices[i], b = face.indices[(i + 1) % m];
      const ekey = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (!edgeMap.has(ekey)) edgeMap.set(ekey, []);
      edgeMap.get(ekey).push({ fi, i, j: (i + 1) % m });
    }
  });
  for (const sides of edgeMap.values()) {
    if (sides.length !== 2) continue;
    const [s1, s2] = sides;
    const A1 = shrunkByFace[s1.fi][s1.i], B1 = shrunkByFace[s1.fi][s1.j];
    // Face 2 traverses the same edge in reverse.
    const B2 = shrunkByFace[s2.fi][s2.i], A2 = shrunkByFace[s2.fi][s2.j];
    addBevelTri(A1, B1, B2);
    addBevelTri(A1, B2, A2);
  }

  // Corner fans: shrunk copies of each original vertex, ordered around it.
  for (let vi = 0; vi < raw.length; vi++) {
    const ring = [];
    faces.forEach((face, fi) => {
      const at = face.indices.indexOf(vi);
      if (at >= 0) ring.push(shrunkByFace[fi][at]);
    });
    if (ring.length < 3) continue;
    const axis = V(raw[vi]).normalize();
    const u = new THREE.Vector3(1, 0, 0);
    if (Math.abs(axis.dot(u)) > 0.9) u.set(0, 1, 0);
    const t1 = new THREE.Vector3().crossVectors(axis, u).normalize();
    const t2 = new THREE.Vector3().crossVectors(axis, t1);
    ring.sort((p, q) => Math.atan2(p.dot(t2), p.dot(t1)) - Math.atan2(q.dot(t2), q.dot(t1)));
    for (let i = 1; i < ring.length - 1; i++) addBevelTri(ring[0], ring[i], ring[i + 1]);
  }

  // Merge into one BufferGeometry with material groups.
  const pos = [], nrm = [], uv = [];
  const groups = [];
  perMaterial.forEach((m, mi) => {
    const start = pos.length / 3;
    pos.push(...m.pos); nrm.push(...m.nrm); uv.push(...m.uv);
    const count = m.pos.length / 3;
    if (count > 0) groups.push({ start, count, materialIndex: mi });
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  groups.forEach((g) => geometry.addGroup(g.start, g.count, g.materialIndex));

  const def = {
    type,
    sides: { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20 }[type],
    radius,
    geometry,
    faceCount: faces.length,
    faces: faces.map((f) => ({ indices: f.indices, normal: [f.normal.x, f.normal.y, f.normal.z] })),
    values,
    vertexValues: type === 'd4' ? [1, 2, 3, 4] : null,
    verts: raw,
    facePaint: paint,
    cannon: { verts: raw.map((v) => v.slice()), faces: faces.map((f) => f.indices.slice()) },
  };
  cache.set(key, def);
  return def;
}

export const DIE_TYPES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];
export const DIE_SCALE = { d4: 1.16, d6: 0.99, d8: 1.02, d10: 1.02, d12: 1.0, d20: 1.06 };
export const DIE_MASS = { d4: 0.9, d6: 1.0, d8: 1.0, d10: 1.05, d12: 1.15, d20: 1.25 };
