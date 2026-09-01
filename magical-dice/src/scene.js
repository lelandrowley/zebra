// The vault: renderer, camera, magical lighting, rune tray, wisps, dust,
// impact sparks and bloom. Everything cosmetic lives here — none of it
// touches the fate stream.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { TRAY_RADIUS } from './physics.js';

export const ZOOM_MIN = 0.6;
export const ZOOM_MAX = 2.0;

const RUNES = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟᛝ';

function canvasOf(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  return c;
}

function makeEnvironment(renderer) {
  // A tiny glowing room captured into a PMREM — gives gems and metals their
  // warm-gold / violet / teal magical reflections.
  const env = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(20, 14, 20),
    new THREE.MeshBasicMaterial({ color: 0x120d22, side: THREE.BackSide }),
  );
  env.add(room);
  const panel = (color, intensity, w, h, pos, rot) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity) }),
    );
    m.position.set(...pos);
    m.rotation.set(...rot);
    env.add(m);
  };
  panel('#fff2dc', 4.2, 7, 5, [0, 6.8, 0], [Math.PI / 2, 0, 0]);      // warm key overhead
  panel('#b7a4f2', 2.0, 5, 7, [-9.7, 1, 0], [0, Math.PI / 2, 0]);     // violet wall (pastel)
  panel('#9fdcd2', 1.8, 5, 7, [9.7, 1, 0], [0, -Math.PI / 2, 0]);     // teal wall (pastel)
  panel('#f2cf82', 2.6, 12, 2.2, [0, 0.5, -9.7], [0, 0, 0]);          // gold strip
  panel('#6b5a9e', 1.2, 12, 12, [0, -6.8, 0], [-Math.PI / 2, 0, 0]);  // floor bounce
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.03).texture;
  pmrem.dispose();
  return tex;
}

function makeBackdrop() {
  const map = new THREE.CanvasTexture(canvasOf(1024, (ctx, S) => {
    const g = ctx.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, '#05040c');
    g.addColorStop(0.55, '#0d0a1d');
    g.addColorStop(0.78, '#1b1233');
    g.addColorStop(1, '#0a0714');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 420; i++) {
      const x = Math.random() * S, y = Math.random() * S * 0.8;
      const r = Math.random() * 1.1 + 0.2;
      const tint = ['255,255,255', '206,215,255', '255,231,196', '221,196,255'][Math.floor(Math.random() * 4)];
      ctx.fillStyle = `rgba(${tint},${0.25 + Math.random() * 0.6})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }));
  map.colorSpace = THREE.SRGBColorSpace;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(80, 32, 24),
    new THREE.MeshBasicMaterial({ map, side: THREE.BackSide, fog: false }),
  );
  dome.rotation.y = 1.3;
  return dome;
}

function runeRingTexture() {
  return new THREE.CanvasTexture(canvasOf(1024, (ctx, S) => {
    const c = S / 2;
    ctx.translate(c, c);
    ctx.strokeStyle = 'rgba(238,198,110,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, S * 0.475, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, S * 0.408, 0, Math.PI * 2); ctx.stroke();
    const N = 44;
    ctx.fillStyle = '#f2cf7a';
    ctx.font = `500 ${S * 0.043}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < N; i++) {
      ctx.save();
      ctx.rotate((i / N) * Math.PI * 2);
      ctx.translate(0, -S * 0.442);
      ctx.fillText(RUNES[i % RUNES.length], 0, 0);
      ctx.restore();
    }
    // tick marks
    ctx.strokeStyle = 'rgba(238,198,110,0.55)';
    for (let i = 0; i < N * 2; i++) {
      ctx.save();
      ctx.rotate((i / (N * 2)) * Math.PI * 2);
      ctx.beginPath();
      ctx.moveTo(0, -S * 0.404);
      ctx.lineTo(0, -S * (i % 2 ? 0.394 : 0.386));
      ctx.stroke();
      ctx.restore();
    }
  }));
}

function sigilTexture() {
  return new THREE.CanvasTexture(canvasOf(512, (ctx, S) => {
    const c = S / 2;
    ctx.translate(c, c);
    ctx.strokeStyle = 'rgba(180,150,255,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, S * 0.46, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, S * 0.3, 0, Math.PI * 2); ctx.stroke();
    // heptagram
    const P = 7, R = S * 0.44;
    ctx.beginPath();
    for (let i = 0; i <= P; i++) {
      const a = ((i * 3) % P) / P * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * R, y = Math.sin(a) * R;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }));
}

function haloTexture() {
  return new THREE.CanvasTexture(canvasOf(128, (ctx, S) => {
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.28)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }));
}

export function createScene(canvas) {
  const quality = new URLSearchParams(location.search).get('quality') ?? 'high';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
  renderer.setPixelRatio(quality === 'low' ? 1 : Math.min(window.devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0816, 0.02);
  scene.environment = makeEnvironment(renderer);
  scene.add(makeBackdrop());

  const camera = new THREE.PerspectiveCamera(40, 2, 0.1, 220);
  const camBaseFull = new THREE.Vector3(0, 13.4, 10.6);
  // Pulled back and raised for game mode, where the scoreboard takes the
  // lower band of the screen and the canvas shrinks vertically — keeps the
  // whole tray and rune ring comfortably margined in the shorter viewport
  // instead of crowding the frame edges. See setFraming() below.
  const camBaseCompact = new THREE.Vector3(0, 17.3, 11.6);
  const camBase = camBaseFull.clone();
  camera.position.copy(camBase);
  const lookAt = new THREE.Vector3(0, 0.2, -0.6);
  camera.lookAt(lookAt);

  // --- lights ---------------------------------------------------------------
  scene.add(new THREE.HemisphereLight(0x8a7bd8, 0x241a30, 0.55));

  const key = new THREE.DirectionalLight(0xfff1d8, 2.15);
  key.position.set(6, 13, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = key.shadow.camera.bottom = -10;
  key.shadow.camera.right = key.shadow.camera.top = 10;
  key.shadow.camera.far = 40;
  key.shadow.bias = -0.0004;
  key.shadow.radius = 5;
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x7a5fd0, 1.1);
  rim.position.set(-7, 6, -7);
  scene.add(rim);

  const front = new THREE.DirectionalLight(0xcfd8ff, 0.5);
  front.position.set(0, 6, 14);
  scene.add(front);

  // --- the table ------------------------------------------------------------
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(46, 64),
    new THREE.MeshStandardMaterial({ color: 0x17122a, roughness: 0.62, metalness: 0.08, envMapIntensity: 0.4 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const dish = new THREE.Mesh(
    new THREE.CircleGeometry(TRAY_RADIUS + 0.85, 72),
    new THREE.MeshStandardMaterial({ color: 0x251c44, roughness: 0.38, metalness: 0.2, envMapIntensity: 0.85 }),
  );
  dish.rotation.x = -Math.PI / 2;
  dish.position.y = 0.005;
  dish.receiveShadow = true;
  scene.add(dish);

  // A soft moonbeam pool in the middle of the tray — light for the gems to drink.
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(5.4, 48),
    new THREE.MeshBasicMaterial({
      map: haloTexture(), color: 0x8f86c8, transparent: true, opacity: 0.26,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.015;
  scene.add(pool);

  // Visible dish wall — an open cylinder standing up from the tray floor, so
  // the dish reads as something that can actually hold the dice. The physics
  // wall (invisible, see physics.js) sits inside this at r = TRAY_RADIUS, so
  // dice never visually clip through it.
  const dishWallHeight = 1.15;
  const dishWall = new THREE.Mesh(
    new THREE.CylinderGeometry(TRAY_RADIUS + 0.62, TRAY_RADIUS + 0.62, dishWallHeight, 72, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x2c2150, roughness: 0.3, metalness: 0.5, envMapIntensity: 1.0, side: THREE.DoubleSide,
    }),
  );
  dishWall.position.y = dishWallHeight / 2;
  dishWall.castShadow = true;
  dishWall.receiveShadow = true;
  scene.add(dishWall);

  const rimTorus = new THREE.Mesh(
    new THREE.TorusGeometry(TRAY_RADIUS + 0.62, 0.3, 20, 96),
    new THREE.MeshStandardMaterial({ color: 0x2c2150, roughness: 0.24, metalness: 0.55, envMapIntensity: 1.15 }),
  );
  rimTorus.rotation.x = Math.PI / 2;
  rimTorus.position.y = dishWallHeight; // rolled lip sitting atop the dish wall
  rimTorus.castShadow = true;
  rimTorus.receiveShadow = true;
  scene.add(rimTorus);

  const runeMap = runeRingTexture();
  runeMap.colorSpace = THREE.SRGBColorSpace;
  const runeRing = new THREE.Mesh(
    new THREE.PlaneGeometry((TRAY_RADIUS + 0.3) * 2, (TRAY_RADIUS + 0.3) * 2),
    new THREE.MeshBasicMaterial({
      map: runeMap, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, opacity: 0.75,
    }),
  );
  runeRing.rotation.x = -Math.PI / 2;
  runeRing.position.y = 0.03;
  scene.add(runeRing);

  const sigilMap = sigilTexture();
  sigilMap.colorSpace = THREE.SRGBColorSpace;
  const sigil = new THREE.Mesh(
    new THREE.PlaneGeometry(5.6, 5.6),
    new THREE.MeshBasicMaterial({
      map: sigilMap, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, opacity: 0.14,
    }),
  );
  sigil.rotation.x = -Math.PI / 2;
  sigil.position.y = 0.02;
  scene.add(sigil);

  // --- wisps ----------------------------------------------------------------
  const halo = haloTexture();
  const wisps = [
    { color: 0xffc46a, r: 5.6, h: 2.4, speed: 0.31, phase: 0.0, bob: 0.9 },
    { color: 0x6ae0d0, r: 6.6, h: 1.7, speed: -0.23, phase: 2.1, bob: 1.3 },
    { color: 0xb06aff, r: 4.8, h: 3.1, speed: 0.17, phase: 4.2, bob: 0.7 },
  ].map((w) => {
    const group = new THREE.Group();
    const light = new THREE.PointLight(w.color, 14, 16, 2);
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: halo, color: w.color, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.material.opacity = 0.7;
    glow.scale.setScalar(1.35);
    group.add(light, core, glow);
    scene.add(group);
    return { ...w, group };
  });

  // --- dust motes -----------------------------------------------------------
  const DUST = 150;
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(DUST * 3);
  const dustCol = new Float32Array(DUST * 3);
  const dustMeta = [];
  for (let i = 0; i < DUST; i++) {
    const r = Math.sqrt(Math.random()) * 9;
    const a = Math.random() * Math.PI * 2;
    dustPos.set([Math.cos(a) * r, 0.2 + Math.random() * 5.5, Math.sin(a) * r], i * 3);
    dustMeta.push({ tw: 0.5 + Math.random() * 1.6, ph: Math.random() * Math.PI * 2, rise: 0.05 + Math.random() * 0.12 });
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute('color', new THREE.BufferAttribute(dustCol, 3));
  const spriteTex = haloTexture();
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    size: 0.07, vertexColors: true, transparent: true, opacity: 0.9,
    map: spriteTex, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  scene.add(dust);

  // --- spark pool -----------------------------------------------------------
  const SPARKS = 240;
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(SPARKS * 3);
  const sparkCol = new Float32Array(SPARKS * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
  const sparkMeta = Array.from({ length: SPARKS }, () => ({ life: 0, ttl: 1, vel: new THREE.Vector3(), col: new THREE.Color() }));
  let sparkCursor = 0;
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
    size: 0.13, vertexColors: true, transparent: true,
    map: spriteTex, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sparks.frustumCulled = false;
  scene.add(sparks);

  function spawnSparks(pos, colorHex, count = 10, speed = 2.2, up = 1.6) {
    const col = new THREE.Color(colorHex);
    for (let i = 0; i < count; i++) {
      const s = sparkMeta[sparkCursor];
      const idx = sparkCursor * 3;
      sparkCursor = (sparkCursor + 1) % SPARKS;
      s.life = s.ttl = 0.5 + Math.random() * 0.45;
      s.vel.set((Math.random() - 0.5) * speed, Math.random() * up + 0.4, (Math.random() - 0.5) * speed);
      s.col.copy(col).multiplyScalar(0.7 + Math.random() * 0.9);
      sparkPos.set([pos.x, pos.y + 0.05, pos.z], idx);
    }
  }

  // --- bloom ----------------------------------------------------------------
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.75, 0.83);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // --- state + frame update -------------------------------------------------
  let rolling = 0; // eases 0..1
  let rollingTarget = 0;
  let framing = 0; // eases 0 (full) .. 1 (compact) — see setFraming()
  let framingTarget = 0;
  // Zoom scales the camera's distance from what it is looking at, so it
  // composes with framing instead of fighting it: framing decides WHERE the
  // camera sits, zoom decides how far along that line. Eased for the same
  // reason — a pinch that snapped would feel broken.
  let zoom = 1;
  let zoomTarget = 1;
  let bloomOn = quality !== 'low';
  let slowFrames = 0;
  let wispsOn = true;
  const pointer = { x: 0, y: 0 };
  window.addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width === Math.floor(w * renderer.getPixelRatio()) && canvas.height === Math.floor(h * renderer.getPixelRatio())) return;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  const _proj = new THREE.Vector3();

  function update(dt, t) {
    resize();
    rolling += (rollingTarget - rolling) * Math.min(1, dt * 4);
    framing += (framingTarget - framing) * Math.min(1, dt * 4);
    camBase.lerpVectors(camBaseFull, camBaseCompact, framing);
    zoom += (zoomTarget - zoom) * Math.min(1, dt * 6);

    // camera parallax, then zoom along the view ray. Dividing by zoom means
    // a bigger number is closer, which is what "zoom in" has to mean to the
    // slider and the pinch alike.
    camera.position.x = camBase.x + pointer.x * 1.05;
    camera.position.y = camBase.y - pointer.y * 0.55;
    camera.position.z = camBase.z;
    camera.position.sub(lookAt).divideScalar(zoom).add(lookAt);
    camera.lookAt(lookAt);

    // rune ring: breathe, spin, surge while rolling
    runeRing.rotation.z = t * 0.045;
    runeRing.material.opacity = 0.55 + Math.sin(t * 1.1) * 0.12 + rolling * 0.45;
    sigil.rotation.z = -t * 0.03;
    sigil.material.opacity = 0.1 + Math.sin(t * 0.7 + 1) * 0.04 + rolling * 0.22;

    // wisps
    if (wispsOn) {
      const wspeed = 1 + rolling * 2.2;
      for (const w of wisps) {
        const a = w.phase + t * w.speed * wspeed;
        w.group.position.set(
          Math.cos(a) * w.r,
          w.h + Math.sin(t * w.bob + w.phase) * 0.55,
          Math.sin(a) * w.r,
        );
        const flicker = 12 + Math.sin(t * 7 + w.phase * 9) * 2.5 + rolling * 8;
        w.group.children[0].intensity = flicker;
      }
    }

    // dust twinkle + rise
    for (let i = 0; i < DUST; i++) {
      const m = dustMeta[i];
      const b = 0.22 + 0.2 * (0.5 + 0.5 * Math.sin(t * m.tw + m.ph));
      dustCol[i * 3] = b * 0.82; dustCol[i * 3 + 1] = b * 0.85; dustCol[i * 3 + 2] = b;
      let y = dustPos[i * 3 + 1] + m.rise * dt;
      if (y > 6) y = 0.15;
      dustPos[i * 3 + 1] = y;
    }
    dustGeo.attributes.position.needsUpdate = true;
    dustGeo.attributes.color.needsUpdate = true;

    // sparks
    for (let i = 0; i < SPARKS; i++) {
      const s = sparkMeta[i];
      if (s.life <= 0) continue;
      s.life -= dt;
      const idx = i * 3;
      if (s.life <= 0) {
        sparkCol.set([0, 0, 0], idx);
        continue;
      }
      s.vel.y -= 2.2 * dt;
      sparkPos[idx] += s.vel.x * dt;
      sparkPos[idx + 1] += s.vel.y * dt;
      sparkPos[idx + 2] += s.vel.z * dt;
      const f = (s.life / s.ttl) ** 1.4;
      sparkCol[idx] = s.col.r * f;
      sparkCol[idx + 1] = s.col.g * f;
      sparkCol[idx + 2] = s.col.b * f;
    }
    sparkGeo.attributes.position.needsUpdate = true;
    sparkGeo.attributes.color.needsUpdate = true;

    // If the device sustains heavy frames, shed the bloom pass.
    if (bloomOn && dt > 0.055) {
      if (++slowFrames > 80) bloomOn = false;
    } else if (slowFrames > 0) {
      slowFrames -= 1;
    }

    if (bloomOn) composer.render();
    else renderer.render(scene, camera);
  }

  return {
    scene,
    camera,
    renderer,
    spawnSparks,
    burst(pos, colorHex) { spawnSparks(pos, colorHex, 26, 2.6, 2.6); },
    setRolling(b) { rollingTarget = b ? 1 : 0; },
    /** 'full' for free rolling, 'compact' once the game scoreboard has
     *  shrunk the canvas — eases the camera back/up so the tray and rune
     *  ring stay fully framed at the shorter viewport. Never snaps. */
    setFraming(mode) { framingTarget = mode === 'compact' ? 1 : 0; },
    /** 0.6 (far back) .. 2.0 (close in); 1 is the designed framing. */
    setZoom(z) { zoomTarget = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(z) || 1)); },
    getZoom() { return zoomTarget; },
    setWisps(on) {
      wispsOn = on;
      for (const w of wisps) w.group.visible = on;
    },
    update,
    resize,
    /** world position -> css pixel coords */
    project(v) {
      _proj.copy(v).project(camera);
      return {
        x: (_proj.x * 0.5 + 0.5) * canvas.clientWidth,
        y: (-_proj.y * 0.5 + 0.5) * canvas.clientHeight,
        behind: _proj.z > 1,
      };
    },
  };
}
