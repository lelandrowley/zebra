// Dice material styles: glass, gemstone, metal, stone, opal, nebula…
// Each style is a MeshPhysicalMaterial recipe plus a procedural base pattern.
// Face textures are painted per (style, die type, typography) and cached.

import * as THREE from 'three';
import { drawNumerals, drawD4Corners, isLight } from './faces.js';

const TEX = 256;

/** Small deterministic PRNG so every die of a style shows the same stone. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seedOf = (s) => [...s].reduce((a, c) => (a * 33 + c.charCodeAt(0)) >>> 0, 5381);

// --- procedural pattern helpers (each drawn once per style) -----------------

function gradientBase(ctx, S, inner, outer) {
  const g = ctx.createRadialGradient(S * 0.42, S * 0.38, S * 0.08, S * 0.5, S * 0.5, S * 0.75);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
}

function streaks(ctx, S, rand, color, count, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  for (let i = 0; i < count; i++) {
    ctx.lineWidth = 1 + rand() * 2.5;
    ctx.beginPath();
    const x = rand() * S, y = rand() * S;
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(
      x + (rand() - 0.5) * S * 0.9, y + (rand() - 0.5) * S * 0.4,
      x + (rand() - 0.5) * S * 0.4, y + (rand() - 0.5) * S * 0.9,
      x + (rand() - 0.5) * S, y + (rand() - 0.5) * S);
    ctx.stroke();
  }
  ctx.restore();
}

function speckle(ctx, S, rand, colors, count, rmin, rmax, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    const r = rmin + rand() * (rmax - rmin);
    ctx.beginPath();
    ctx.arc(rand() * S, rand() * S, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function blobs(ctx, S, rand, colors, count, rmin, rmax, alpha) {
  ctx.save();
  for (let i = 0; i < count; i++) {
    const x = rand() * S, y = rand() * S, r = rmin + rand() * (rmax - rmin);
    const c = colors[Math.floor(rand() * colors.length)];
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, c);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha * (0.5 + rand() * 0.5);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function brushed(ctx, S, rand, color, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let i = 0; i < 90; i++) {
    const y = rand() * S;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(S, y + (rand() - 0.5) * 6);
    ctx.stroke();
  }
  ctx.restore();
}

function veins(ctx, S, rand, color, count, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    let x = rand() * S, y = -10;
    ctx.lineWidth = 0.8 + rand() * 2.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    while (y < S + 10) {
      x += (rand() - 0.5) * S * 0.22;
      y += S * (0.08 + rand() * 0.14);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function starfield(ctx, S, rand, count) {
  for (let i = 0; i < count; i++) {
    const a = 0.35 + rand() * 0.65;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.beginPath();
    ctx.arc(rand() * S, rand() * S, 0.5 + rand() * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Wavy vertical color bands — chatoyant stripes or mineral zoning. */
function wavyBands(ctx, S, rand, colors, count, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const bw = S / count;
  for (let i = 0; i < count; i++) {
    ctx.strokeStyle = colors[i % colors.length];
    ctx.lineWidth = bw * (0.7 + rand() * 0.5);
    const amp = S * (0.05 + rand() * 0.06);
    const phase = rand() * Math.PI * 2;
    ctx.beginPath();
    for (let y = -10; y <= S + 10; y += 8) {
      const x = (i + 0.5) * bw + Math.sin((y / S) * Math.PI * 2 + phase) * amp;
      if (y === -10) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Concentric rings around an off-center point — polished-slice banding. */
function concentricArcs(ctx, S, rand, colors, cx, cy, count, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  let r = S * 0.04;
  for (let i = 0; i < count; i++) {
    ctx.strokeStyle = colors[i % colors.length];
    ctx.lineWidth = S * (0.025 + rand() * 0.03);
    r += ctx.lineWidth * (0.9 + rand() * 0.6);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

// --- style presets ----------------------------------------------------------
// mat: MeshPhysicalMaterial params. pattern: albedo tile. emissivePattern: glow tile.
// ink/glow: default numeral colors chosen for contrast on this stone.

const gem = (over) => ({
  metalness: 0, roughness: 0.06, transmission: 0.96, ior: 1.85, thickness: 1.45,
  attenuationDistance: 2.4, clearcoat: 0.35, clearcoatRoughness: 0.18,
  envMapIntensity: 1.0, dispersion: 0.16, ...over,
});
// streakAlpha/blobAlpha default to the original gem look; classic gems pass fainter values
// so the interior reads as clear colored glass instead of a painted surface.
const gemPattern = (inner, outer, streakColor, streakAlpha = 0.09, blobAlpha = 0.06) => (ctx, S, r) => {
  gradientBase(ctx, S, inner, outer);
  streaks(ctx, S, r, streakColor, 7, streakAlpha);
  blobs(ctx, S, r, ['#ffffff'], 4, 10, 34, blobAlpha);
};

export const STYLES = [
  {
    id: 'amethyst', name: 'Amethyst', kind: 'gem', swatch: ['#c9a2f7', '#5b2d9e'],
    ink: '#f6eeff', glow: '#dfc2ff', emissiveBase: '#2a1650',
    mat: gem({ color: '#9a63e8', attenuationColor: '#5c24b8' }),
    pattern: gemPattern('#eaddfa', '#9d5eec', '#ffffff', 0.06, 0.04),
  },
  {
    id: 'ruby', name: 'Ruby', kind: 'gem', swatch: ['#ff7d96', '#8e0b2b'],
    ink: '#fff0f2', glow: '#ffb8c6', emissiveBase: '#48091c',
    mat: gem({ color: '#e0234f', attenuationColor: '#900c2c' }),
    pattern: gemPattern('#ffd9df', '#f23d5e', '#ffffff', 0.06, 0.04),
  },
  {
    id: 'emerald', name: 'Emerald', kind: 'gem', swatch: ['#5fe3a1', '#0b6b3d'],
    ink: '#eefff6', glow: '#a9f5cd', emissiveBase: '#0a3c25',
    mat: gem({ color: '#17b26a', attenuationColor: '#07733f' }),
    pattern: gemPattern('#d9f7e6', '#2bc47f', '#ffffff', 0.06, 0.04),
  },
  {
    id: 'sapphire', name: 'Sapphire', kind: 'gem', swatch: ['#6f9bff', '#123a94'],
    ink: '#eef3ff', glow: '#b7ccff', emissiveBase: '#101f52',
    mat: gem({ color: '#2e63d8', attenuationColor: '#162f8e' }),
    pattern: gemPattern('#dbe6fb', '#3f74e8', '#ffffff', 0.06, 0.04),
  },
  {
    id: 'seaglass', name: 'Sea Glass', kind: 'gem', swatch: ['#b8efe3', '#3f9c8c'],
    ink: '#0b4a42', glow: '#d8fff6', emissiveBase: '#12352d',
    mat: gem({ color: '#8fd8c8', roughness: 0.3, transmission: 0.85, ior: 1.5, thickness: 1.25, clearcoat: 0.3, dispersion: 0.03, attenuationColor: '#5cb2a2', attenuationDistance: 1.6 }),
    pattern: gemPattern('#eafff9', '#a5ded2', '#ffffff'),
  },
  {
    id: 'obsidian', name: 'Obsidian', kind: 'gem', swatch: ['#4d4360', '#0e0a16'],
    ink: '#f2e9ff', glow: '#b9a5e8', emissiveBase: '#170d2b',
    mat: gem({ color: '#191223', transmission: 0.3, roughness: 0.05, ior: 1.5, thickness: 1.25, clearcoat: 1, attenuationColor: '#0c0813', attenuationDistance: 0.8, dispersion: 0.05 }),
    pattern: (ctx, S, r) => { gradientBase(ctx, S, '#3a2f4e', '#120c1e'); streaks(ctx, S, r, '#8f7bb8', 6, 0.12); },
  },
  {
    id: 'dichroic', name: 'Dichroic', kind: 'gem', swatch: ['#8ff0e0', '#c060e0'],
    ink: '#26264a', glow: '#c9f7ff', emissiveBase: '#123044',
    // Dichroic glass reads as lit from within. The vault is dark, so a die at
    // 0.96 transmission just transmits the darkness — hence the moderated
    // transmission, the emissive rainbow film, and the lifted env intensity.
    mat: {
      color: '#dff4f2', metalness: 0, roughness: 0.05, transmission: 0.72, ior: 1.6, thickness: 0.9,
      clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 1.0, iridescenceIOR: 1.8,
      iridescenceThicknessRange: [140, 800], dispersion: 0.2, envMapIntensity: 2.0,
      attenuationColor: '#d99ae8', attenuationDistance: 6.0, emissiveIntensity: 0.9,
    },
    pattern: (ctx, S, r) => {
      gradientBase(ctx, S, '#fbfffe', '#dcefee');
      blobs(ctx, S, r, ['#ff8fe0', '#7fe8e0', '#ffe08a', '#9fb0ff'], 24, 14, 48, 0.3);
    },
    emissivePattern: (ctx, S, r) => {
      blobs(ctx, S, r, ['#7a1f6a', '#125a56', '#6a4a12', '#243a7a'], 22, 16, 54, 0.55);
    },
  },
  {
    id: 'clearquartz', name: 'Clear Quartz', kind: 'gem', swatch: ['#eafcff', '#a8c4cc'],
    ink: '#232733', glow: '#eafdff', emissiveBase: '#2b3742',
    mat: {
      color: '#f4fbfc', metalness: 0, roughness: 0.04, transmission: 0.82, ior: 1.55, thickness: 0.9,
      clearcoat: 0.5, clearcoatRoughness: 0.08, attenuationColor: '#eaf7f9', attenuationDistance: 8,
      dispersion: 0.12, envMapIntensity: 1.9, emissiveIntensity: 0.75,
    },
    pattern: (ctx, S, r) => {
      gradientBase(ctx, S, '#ffffff', '#eef7f8');
      streaks(ctx, S, r, '#ffffff', 5, 0.06);
      streaks(ctx, S, r, '#cfe6ea', 4, 0.05);
    },
  },
  {
    id: 'rosequartz', name: 'Rose Quartz', kind: 'gem', swatch: ['#ffb3cf', '#c25c7e'],
    ink: '#5c2038', glow: '#ffd9e8', emissiveBase: '#4a1f30',
    mat: {
      color: '#f3c7d6', metalness: 0, roughness: 0.2, transmission: 0.7, ior: 1.54, thickness: 0.9,
      attenuationColor: '#f0b8c8', attenuationDistance: 4.0, clearcoat: 0.4, clearcoatRoughness: 0.25,
      envMapIntensity: 1.6, dispersion: 0.08, emissiveIntensity: 0.7,
    },
    pattern: (ctx, S, r) => {
      gradientBase(ctx, S, '#ffe9f1', '#f0b8cc');
      blobs(ctx, S, r, ['#ffffff', '#ffcfe0'], 16, 16, 50, 0.3);
    },
  },
  {
    id: 'fluorite', name: 'Fluorite', kind: 'gem', swatch: ['#7fe0a8', '#8a6fd8'],
    ink: '#1c3626', glow: '#e6d9ff', emissiveBase: '#1d3a3a',
    mat: {
      color: '#bfe8cf', metalness: 0, roughness: 0.14, transmission: 0.74, ior: 1.43, thickness: 0.9,
      attenuationColor: '#b79ce0', attenuationDistance: 4.5, clearcoat: 0.4, clearcoatRoughness: 0.15,
      envMapIntensity: 1.7, dispersion: 0.1, emissiveIntensity: 0.7,
    },
    pattern: (ctx, S, r) => {
      gradientBase(ctx, S, '#e2fbe8', '#e6def8');
      wavyBands(ctx, S, r, ['#8fe0b0', '#b79cf0', '#a8ecc4', '#9678d9'], 9, 0.4);
    },
  },
  {
    id: 'opal', name: 'Opal', kind: 'magic', swatch: ['#fdf6ef', '#a9d8d0'],
    ink: '#3c2f52', glow: '#ffe8fb',
    mat: {
      color: '#f4ede6', metalness: 0, roughness: 0.16, transmission: 0.35, ior: 1.45, thickness: 0.8,
      clearcoat: 0.9, clearcoatRoughness: 0.1, iridescence: 1.0, iridescenceIOR: 1.32,
      iridescenceThicknessRange: [120, 520], envMapIntensity: 1.15,
    },
    pattern: (ctx, S, r) => {
      gradientBase(ctx, S, '#fffdf9', '#efe4da');
      blobs(ctx, S, r, ['#ffc4ec', '#b8f3ff', '#d2ffc4', '#ffe9b0', '#d5c4ff'], 42, 5, 26, 0.4);
    },
  },
  {
    id: 'moonstone', name: 'Moonstone', kind: 'magic', swatch: ['#eef3ff', '#93a8d8'],
    ink: '#22315e', glow: '#dfe9ff',
    mat: {
      color: '#dfe7f6', metalness: 0, roughness: 0.35, transmission: 0.55, ior: 1.52, thickness: 1.1,
      clearcoat: 0.5, iridescence: 0.55, iridescenceIOR: 1.28, iridescenceThicknessRange: [180, 420],
      attenuationColor: '#9fb4e8', attenuationDistance: 2.6, envMapIntensity: 1.0,
    },
    pattern: (ctx, S, r) => { gradientBase(ctx, S, '#ffffff', '#ccd8f2'); blobs(ctx, S, r, ['#ffffff', '#c4d4ff'], 14, 12, 48, 0.35); },
  },
  {
    id: 'labradorite', name: 'Labradorite', kind: 'magic', swatch: ['#9fb8d8', '#232838'],
    ink: '#e7f0ff', glow: '#a8d8ff',
    mat: {
      color: '#333c4c', metalness: 0.05, roughness: 0.32, transmission: 0.15, ior: 1.55, thickness: 0.6,
      clearcoat: 0.7, clearcoatRoughness: 0.12, iridescence: 0.9, iridescenceIOR: 1.6,
      iridescenceThicknessRange: [280, 620], attenuationColor: '#232a38', attenuationDistance: 1.2,
      envMapIntensity: 1.1,
    },
    pattern: (ctx, S, r) => {
      gradientBase(ctx, S, '#4a5568', '#1c222c');
      streaks(ctx, S, r, '#bcdcff', 8, 0.22);
      streaks(ctx, S, r, '#eaf4ff', 3, 0.15);
    },
  },
  {
    id: 'pearl', name: 'Pearl', kind: 'magic', swatch: ['#fff8ee', '#d8c2b4'],
    ink: '#5a3d63', glow: '#ffeed8',
    mat: {
      color: '#f6eee2', metalness: 0.05, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.18,
      iridescence: 0.5, iridescenceIOR: 1.22, iridescenceThicknessRange: [100, 360], envMapIntensity: 1.1,
    },
    pattern: (ctx, S, r) => { gradientBase(ctx, S, '#fffaf2', '#eaddcd'); blobs(ctx, S, r, ['#ffd8e8', '#d8ecff', '#fff2c4'], 10, 20, 60, 0.16); },
  },
  {
    id: 'nebula', name: 'Nebula', kind: 'magic', swatch: ['#7a3fd0', '#0a0618'],
    ink: '#ffffff', glow: '#9fd8ff',
    mat: {
      color: '#161022', metalness: 0.1, roughness: 0.22, clearcoat: 0.8, clearcoatRoughness: 0.15,
      emissive: '#ffffff', emissiveIntensity: 1.0, envMapIntensity: 0.9,
    },
    pattern: (ctx, S, r) => {
      ctx.fillStyle = '#0c0818';
      ctx.fillRect(0, 0, S, S);
      blobs(ctx, S, r, ['#31175e', '#0e2c5e', '#4d1348'], 16, 26, 80, 0.5);
    },
    emissivePattern: (ctx, S, r) => {
      blobs(ctx, S, r, ['#31175e', '#0e2c5e'], 10, 26, 70, 0.35);
      starfield(ctx, S, r, 130);
    },
  },
  {
    id: 'marble', name: 'Marble', kind: 'stone', swatch: ['#f8f5f0', '#b8b2a6'],
    ink: '#2c2536', glow: '#fff6d8',
    mat: { color: '#f2efe8', metalness: 0, roughness: 0.28, clearcoat: 0.55, clearcoatRoughness: 0.2, envMapIntensity: 0.8 },
    pattern: (ctx, S, r) => {
      gradientBase(ctx, S, '#fbf9f5', '#e4dfd4');
      veins(ctx, S, r, '#9a938a', 5, 0.35);
      veins(ctx, S, r, '#c8a96a', 2, 0.22);
    },
  },
  {
    id: 'granite', name: 'Granite', kind: 'stone', swatch: ['#9b9aa0', '#4a4850'],
    ink: '#f2ede4', glow: '#ffe9c4',
    mat: { color: '#8d8b92', metalness: 0, roughness: 0.5, clearcoat: 0.25, envMapIntensity: 0.6 },
    pattern: (ctx, S, r) => {
      gradientBase(ctx, S, '#a3a1a8', '#6e6c74');
      speckle(ctx, S, r, ['#33313a', '#d8d5dc', '#8a8790', '#565460'], 900, 0.6, 2.4, 0.7);
    },
  },
  {
    id: 'lapis', name: 'Lapis', kind: 'stone', swatch: ['#2b55c8', '#122052'],
    ink: '#ffe9a8', glow: '#ffd86a',
    mat: { color: '#1e3f9e', metalness: 0.08, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2, envMapIntensity: 0.9 },
    pattern: (ctx, S, r) => {
      gradientBase(ctx, S, '#2d55c2', '#14245e');
      blobs(ctx, S, r, ['#0d1840', '#3e6ad8'], 12, 16, 60, 0.4);
      speckle(ctx, S, r, ['#f2cf6a', '#ffe9a0'], 90, 0.5, 1.8, 0.8);
    },
  },
  {
    id: 'tigereye', name: "Tiger's Eye", kind: 'stone', swatch: ['#e0b25a', '#4a2f10'],
    ink: '#2e1c08', glow: '#ffdf9c',
    mat: { color: '#a97a34', metalness: 0.15, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.12, envMapIntensity: 1.3 },
    pattern: (ctx, S, r) => {
      gradientBase(ctx, S, '#c99a4a', '#5c3814');
      wavyBands(ctx, S, r, ['#3a2410', '#a97a2e', '#7a5220', '#c99a42'], 12, 0.55);
      wavyBands(ctx, S, r, ['#ffe9a8'], 1, 0.42);
    },
  },
  {
    id: 'malachite', name: 'Malachite', kind: 'stone', swatch: ['#4fd08a', '#0a3a22'],
    ink: '#eafff2', glow: '#bfffd8',
    mat: { color: '#0f5c34', metalness: 0, roughness: 0.18, clearcoat: 0.9, clearcoatRoughness: 0.08, envMapIntensity: 1.0 },
    pattern: (ctx, S, r) => {
      gradientBase(ctx, S, '#1c6b3e', '#082c1a');
      concentricArcs(ctx, S, r, ['#083d22', '#2fae72', '#0e5c37', '#7be3ad', '#155c34'], S * 0.34, S * 0.4, 18, 0.9);
    },
  },
  {
    id: 'turquoise', name: 'Turquoise', kind: 'stone', swatch: ['#5fd6d0', '#1f6b62'],
    ink: '#2a1a10', glow: '#eafffb',
    mat: { color: '#3fb8ae', metalness: 0, roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.2, envMapIntensity: 0.9 },
    pattern: (ctx, S, r) => {
      gradientBase(ctx, S, '#6fe0d4', '#1f7a70');
      blobs(ctx, S, r, ['#8ef0e6', '#2f9a90', '#57c9bd'], 14, 14, 46, 0.35);
      veins(ctx, S, r, '#2b1c10', 5, 0.5);
    },
  },
  {
    id: 'jade', name: 'Jade', kind: 'stone', swatch: ['#7cd8a8', '#1e6e48'],
    ink: '#0d3324', glow: '#d8ffe8', emissiveBase: '#0d2c1d',
    mat: {
      color: '#4fae7e', metalness: 0, roughness: 0.35, transmission: 0.45, ior: 1.55, thickness: 1.2,
      attenuationColor: '#2e8258', attenuationDistance: 1.6, clearcoat: 0.6, envMapIntensity: 0.9,
    },
    pattern: (ctx, S, r) => { gradientBase(ctx, S, '#d2f2e0', '#63b88c'); blobs(ctx, S, r, ['#ffffff', '#2e7a52'], 12, 14, 50, 0.25); },
  },
  {
    id: 'gold', name: 'Gold', kind: 'metal', swatch: ['#ffe08a', '#8a6114'],
    ink: '#3d2a08', glow: '#fff2c4',
    mat: { color: '#f0c25e', metalness: 1, roughness: 0.26, envMapIntensity: 1.7 },
    pattern: (ctx, S, r) => { gradientBase(ctx, S, '#fff3d2', '#e2b34e'); brushed(ctx, S, r, '#a87b22', 0.18); },
  },
  {
    id: 'silver', name: 'Silver', kind: 'metal', swatch: ['#f2f5fa', '#8a92a2'],
    ink: '#242b38', glow: '#e2ecff',
    mat: { color: '#dfe4ec', metalness: 1, roughness: 0.22, envMapIntensity: 1.7 },
    pattern: (ctx, S, r) => { gradientBase(ctx, S, '#ffffff', '#c2c9d6'); brushed(ctx, S, r, '#8a92a4', 0.2); },
  },
  {
    id: 'copper', name: 'Copper', kind: 'metal', swatch: ['#ffb083', '#7e3c1a'],
    ink: '#38180a', glow: '#ffd8b8',
    mat: { color: '#d88a56', metalness: 1, roughness: 0.28, envMapIntensity: 1.6 },
    pattern: (ctx, S, r) => { gradientBase(ctx, S, '#ffd9bd', '#c2703c'); brushed(ctx, S, r, '#8a4520', 0.2); blobs(ctx, S, r, ['#3f9c8c'], 4, 8, 26, 0.12); },
  },
  {
    id: 'bone', name: 'Bone', kind: 'stone', swatch: ['#f6efdd', '#c2b490'],
    ink: '#463a28', glow: '#fff2cc',
    mat: { color: '#efe6cf', metalness: 0, roughness: 0.5, clearcoat: 0.15, envMapIntensity: 0.6 },
    pattern: (ctx, S, r) => { gradientBase(ctx, S, '#faf5e6', '#dfd2b2'); streaks(ctx, S, r, '#b8a780', 8, 0.15); },
  },
];

export const styleById = (id) => STYLES.find((s) => s.id === id) ?? STYLES[0];

// --- texture + material factory --------------------------------------------

function makeCanvas(S) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  return c;
}

function basePatternCanvas(style, emissive = false) {
  const c = makeCanvas(TEX);
  const ctx = c.getContext('2d');
  if (emissive) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, TEX, TEX);
    style.emissivePattern?.(ctx, TEX, mulberry32(seedOf(style.id + ':e')));
  } else {
    style.pattern(ctx, TEX, mulberry32(seedOf(style.id)));
  }
  return c;
}

function tex(canvas, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const isGlassy = (style) => (style.mat.transmission ?? 0) > 0.2;

/**
 * Paint one face's texture set.
 * faceInfo === null paints the blank (bevel) texture set.
 */
function paintFace(style, typo, faceInfo, dieType) {
  const base = basePatternCanvas(style);
  const out = {};

  const map = makeCanvas(TEX);
  const mctx = map.getContext('2d');
  mctx.drawImage(base, 0, 0);
  if (faceInfo) {
    const ink = typo.ink === 'auto' ? style.ink : typo.ink;
    if (dieType === 'd4') drawD4Corners(mctx, TEX, faceInfo, typo, ink);
    else drawNumerals(mctx, TEX, faceInfo, typo, ink);
  }
  out.map = map;

  if (style.emissivePattern || style.emissiveBase || (typo.glow && faceInfo)) {
    const em = makeCanvas(TEX);
    const ectx = em.getContext('2d');
    // emissiveBase is the stone's "inner fire" — a faint glow from within.
    ectx.fillStyle = style.emissiveBase ?? '#000';
    ectx.fillRect(0, 0, TEX, TEX);
    if (style.emissivePattern) ectx.drawImage(basePatternCanvas(style, true), 0, 0);
    // Dark "engraved" numerals must not emit — glowing would fill them in.
    const inkResolved = typo.ink === 'auto' ? style.ink : typo.ink;
    if (typo.glow && faceInfo && isLight(inkResolved)) {
      const glowColor = typo.ink === 'auto' ? style.glow : typo.ink;
      if (dieType === 'd4') drawD4Corners(ectx, TEX, faceInfo, typo, glowColor);
      else drawNumerals(ectx, TEX, faceInfo, typo, glowColor);
    }
    out.emissive = em;
  }

  if (isGlassy(style)) {
    // White = transmissive glass, black = opaque painted numeral.
    const tr = makeCanvas(TEX);
    const tctx = tr.getContext('2d');
    tctx.fillStyle = '#fff';
    tctx.fillRect(0, 0, TEX, TEX);
    if (faceInfo) {
      const opts = { ...typo, bolder: true };
      if (dieType === 'd4') drawD4Corners(tctx, TEX, faceInfo, opts, '#000');
      else drawNumerals(tctx, TEX, faceInfo, opts, '#000');
    }
    out.transmission = tr;
  }
  return out;
}

function materialFor(style, typo, faceInfo, dieType) {
  const painted = paintFace(style, typo, faceInfo, dieType);
  const p = { ...style.mat };
  const params = {
    color: new THREE.Color(p.color ?? '#ffffff'),
    metalness: p.metalness ?? 0,
    roughness: p.roughness ?? 0.3,
    map: tex(painted.map),
  };
  for (const k of ['transmission', 'ior', 'thickness', 'attenuationDistance', 'clearcoat',
    'clearcoatRoughness', 'iridescence', 'iridescenceIOR', 'envMapIntensity', 'specularIntensity']) {
    if (p[k] !== undefined) params[k] = p[k];
  }
  if (p.attenuationColor) params.attenuationColor = new THREE.Color(p.attenuationColor);
  if (p.iridescenceThicknessRange) params.iridescenceThicknessRange = p.iridescenceThicknessRange;
  if (painted.emissive) {
    params.emissive = new THREE.Color('#ffffff');
    params.emissiveIntensity = p.emissiveIntensity ?? (style.emissivePattern ? 1.0 : 1.3);
    params.emissiveMap = tex(painted.emissive);
  }
  if (painted.transmission) params.transmissionMap = tex(painted.transmission, false);

  const m = new THREE.MeshPhysicalMaterial(params);
  if (p.dispersion !== undefined && 'dispersion' in m) m.dispersion = p.dispersion;
  return m;
}

const matCache = new Map();

/** Materials array for a die: one per face plus the bevel blank (last). */
export function getDieMaterials(def, style, typo, typoKey) {
  const key = `${style.id}|${def.type}|${typoKey}`;
  if (matCache.has(key)) return matCache.get(key);
  const mats = def.facePaint.map((fp) => materialFor(style, typo, fp, def.type));
  mats.push(materialFor(style, typo, null, def.type));
  matCache.set(key, mats);
  return mats;
}

export function clearMaterialCache() {
  for (const mats of matCache.values()) {
    for (const m of mats) {
      m.map?.dispose();
      m.emissiveMap?.dispose();
      m.transmissionMap?.dispose();
      m.dispose();
    }
  }
  matCache.clear();
}

/** Small canvas swatch of a style's stone, for UI buttons. */
export function styleSwatchURL(style, size = 56) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const full = basePatternCanvas(style);
  ctx.drawImage(full, 0, 0, size, size);
  const g = ctx.createRadialGradient(size * 0.35, size * 0.3, 2, size * 0.5, size * 0.5, size * 0.75);
  g.addColorStop(0, 'rgba(255,255,255,0.28)');
  g.addColorStop(0.4, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.38)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c.toDataURL();
}
