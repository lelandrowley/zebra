// Numeral painting for die faces — typography lives here.
//
// UV convention from geometry.js: face textures are square, face centroid at
// (0.5, 0.5), "up" (+v) points toward the polygon's apex corner. Canvas y is
// flipped relative to v.

export const FONTS = [
  { id: 'cinzel', name: 'Cinzel — engraved', css: "'Cinzel', 'Times New Roman', serif" },
  { id: 'uncial', name: 'Uncial — ancient', css: "'Uncial Antiqua', 'Palatino Linotype', Palatino, serif" },
  { id: 'serif', name: 'Georgia — classic', css: "Georgia, 'Times New Roman', serif" },
  { id: 'sans', name: 'Sans — modern', css: "system-ui, 'Segoe UI', Helvetica, Arial, sans-serif" },
  { id: 'mono', name: 'Mono — scribe', css: "'Courier New', Courier, monospace" },
];
export const fontById = (id) => FONTS.find((f) => f.id === id) ?? FONTS[0];

export const INKS = [
  { id: 'auto', name: 'Stone’s choice', color: null },
  { id: 'ivory', name: 'Ivory', color: '#f5efdf' },
  { id: 'obsidian', name: 'Obsidian', color: '#191423' },
  { id: 'gold', name: 'Gold', color: '#f2c860' },
  { id: 'blood', name: 'Blood', color: '#c22f45' },
  { id: 'teal', name: 'Glacier', color: '#7de0d3' },
  { id: 'violet', name: 'Violet', color: '#b58ff2' },
];

export function typoKeyOf(typo) {
  return [typo.font, typo.size, typo.bold ? 'b' : 'r', typo.ink, typo.glow ? 'g' : '-', typo.underline ? 'u' : '-'].join('|');
}

/** Is a luminance-light color? Used to pick a contrasting halo stroke. */
export function isLight(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140;
}

function fontSpec(typo, px) {
  const f = fontById(typo.font);
  const weight = typo.bold ? 700 : 400;
  return `${weight} ${px}px ${f.css}`;
}

/**
 * Draw one glyph (value + optional 6/9 mark) centered at (0,0) of the current
 * transform, sized to fit `fitPx` height / `maxW` width.
 */
function glyph(ctx, S, text, typo, color, fitPx, maxW, mark, bolder) {
  let px = fitPx;
  ctx.font = fontSpec(typo, px);
  let w = ctx.measureText(text).width;
  if (w > maxW) {
    px *= maxW / w;
    ctx.font = fontSpec(typo, px);
    w = ctx.measureText(text).width;
  }
  const m = ctx.measureText(text);
  const asc = m.actualBoundingBoxAscent ?? px * 0.72;
  const desc = m.actualBoundingBoxDescent ?? px * 0.05;
  const yOff = (asc - desc) / 2;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // Soft halo of the opposite tone keeps numerals readable on busy stone.
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = isLight(color) ? 'rgba(10,8,20,0.55)' : 'rgba(255,250,235,0.5)';
  ctx.lineWidth = Math.max(2, px * 0.075);
  ctx.strokeText(text, 0, yOff);
  ctx.restore();

  ctx.fillStyle = color;
  ctx.fillText(text, 0, yOff);
  if (bolder) {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, px * 0.05);
    ctx.strokeText(text, 0, yOff);
  }

  if (mark) {
    const bw = Math.max(w * 0.6, px * 0.4);
    ctx.fillRect(-bw / 2, yOff + desc + px * 0.08, bw, Math.max(2.5, px * 0.07));
  }
}

/** Standard face: one centered numeral. */
export function drawNumerals(ctx, S, fp, typo, color) {
  const text = String(fp.value);
  const inr = fp.uvInradius * S;
  const scale = (typo.size ?? 92) / 100;
  const fitPx = inr * 1.5 * scale;
  const maxW = inr * 1.9;
  const mark = typo.underline && (fp.value === 6 || fp.value === 9) && fp.sides >= 10;

  ctx.save();
  ctx.translate(fp.uvCenter[0] * S, (1 - fp.uvCenter[1]) * S);
  glyph(ctx, S, text, typo, color, fitPx, maxW, mark, typo.bolder);
  ctx.restore();
}

/**
 * d4 face: three corner numerals, each rotated so it reads upright when its
 * corner points up — the classic tetrahedron layout (read the top corner).
 */
export function drawD4Corners(ctx, S, fp, typo, color) {
  const [cu, cv] = fp.uvCenter;
  const scale = (typo.size ?? 92) / 100;
  const px = fp.uvInradius * S * 1.05 * scale;

  fp.uvPoly.forEach(([u, v], i) => {
    const value = fp.cornerValues[i];
    const du = u - cu, dv = v - cv;
    const t = 0.6; // sit numerals between centroid and corner
    const gx = (cu + du * t) * S;
    const gy = (1 - (cv + dv * t)) * S;
    const theta = Math.atan2(du, dv); // maps glyph-up onto the corner direction
    ctx.save();
    ctx.translate(gx, gy);
    ctx.rotate(theta);
    glyph(ctx, S, String(value), typo, color, px, px * 1.2, false, typo.bolder);
    ctx.restore();
  });
}
