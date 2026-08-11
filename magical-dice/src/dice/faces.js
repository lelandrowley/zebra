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

// --- engraving motifs --------------------------------------------------------
// Small decorative glyphs painted below the numeral. Each draw(ctx, s) renders
// centred on the current transform origin, fitting roughly an s x s box, using
// the caller's current fillStyle/strokeStyle — never set a hardcoded color in
// here, or the motif paints the wrong ink and breaks the emissive/glass passes.
// Kept deliberately simple: these are seen ~30px on a tumbling die, so a bold
// silhouette reads far better than fine detail.

function crescent(ctx, cx, cy, r, dx, dy, r2) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.arc(cx + dx, cy + dy, r2, 0, Math.PI * 2);
  ctx.fill('evenodd');
}

function sparkle(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx + r * 0.2, cy - r * 0.2, cx + r, cy);
  ctx.quadraticCurveTo(cx + r * 0.2, cy + r * 0.2, cx, cy + r);
  ctx.quadraticCurveTo(cx - r * 0.2, cy + r * 0.2, cx - r, cy);
  ctx.quadraticCurveTo(cx - r * 0.2, cy - r * 0.2, cx, cy - r);
  ctx.closePath();
  ctx.fill();
}

function leaf(ctx, cx, cy, len, angle) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, -len * 0.5);
  ctx.quadraticCurveTo(len * 0.42, 0, 0, len * 0.5);
  ctx.quadraticCurveTo(-len * 0.42, 0, 0, -len * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export const MOTIFS = [
  { id: 'none', name: 'Unadorned', draw: null },
  {
    id: 'moonstar', name: 'Moon & Star',
    draw(ctx, s) {
      crescent(ctx, -s * 0.16, 0, s * 0.30, s * 0.19, -s * 0.05, s * 0.26);
      sparkle(ctx, s * 0.26, -s * 0.08, s * 0.16);
    },
  },
  {
    id: 'dragon', name: 'Dragon',
    // The spread wing carries the whole silhouette — a sinuous body on its own
    // just reads as a worm at this size.
    draw(ctx, s) {
      // Wing: a scalloped fan above the body.
      ctx.beginPath();
      ctx.moveTo(-s * 0.04, s * 0.02);
      ctx.lineTo(-s * 0.24, -s * 0.44);
      ctx.lineTo(-s * 0.10, -s * 0.20);
      ctx.lineTo(-s * 0.04, -s * 0.46);
      ctx.lineTo(s * 0.10, -s * 0.18);
      ctx.lineTo(s * 0.18, -s * 0.40);
      ctx.lineTo(s * 0.22, -s * 0.04);
      ctx.closePath();
      ctx.fill();

      // Body: tail sweeping up into a horned head at the right.
      ctx.beginPath();
      ctx.moveTo(-s * 0.48, s * 0.40);
      ctx.quadraticCurveTo(-s * 0.20, s * 0.34, -s * 0.10, s * 0.12);
      ctx.quadraticCurveTo(-s * 0.02, -s * 0.06, s * 0.18, s * 0.00);
      ctx.lineTo(s * 0.30, -s * 0.06);
      ctx.lineTo(s * 0.48, s * 0.02);   // snout
      ctx.lineTo(s * 0.30, s * 0.12);   // jaw
      ctx.quadraticCurveTo(s * 0.02, s * 0.18, -s * 0.12, s * 0.28);
      ctx.quadraticCurveTo(-s * 0.30, s * 0.44, -s * 0.48, s * 0.40);
      ctx.closePath();
      ctx.fill();

      // Horn.
      ctx.beginPath();
      ctx.moveTo(s * 0.30, -s * 0.06);
      ctx.lineTo(s * 0.40, -s * 0.24);
      ctx.lineTo(s * 0.38, -s * 0.02);
      ctx.closePath();
      ctx.fill();
    },
  },
  {
    id: 'dagger', name: 'Dagger',
    draw(ctx, s) {
      const w = s * 0.09;
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.46);
      ctx.lineTo(w, -s * 0.06);
      ctx.lineTo(-w, -s * 0.06);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(-s * 0.22, -s * 0.09, s * 0.44, s * 0.06);
      ctx.fillRect(-w * 0.65, -s * 0.03, w * 1.3, s * 0.28);
      ctx.beginPath();
      ctx.arc(0, s * 0.32, s * 0.07, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  {
    id: 'lightning', name: 'Lightning',
    draw(ctx, s) {
      ctx.beginPath();
      ctx.moveTo(s * 0.06, -s * 0.46);
      ctx.lineTo(-s * 0.20, s * 0.02);
      ctx.lineTo(-s * 0.02, s * 0.02);
      ctx.lineTo(-s * 0.09, s * 0.46);
      ctx.lineTo(s * 0.24, -s * 0.08);
      ctx.lineTo(s * 0.02, -s * 0.08);
      ctx.closePath();
      ctx.fill();
    },
  },
  {
    id: 'astrology', name: 'Astrology',
    draw(ctx, s) {
      const r = s * 0.15;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.lineWidth = s * 0.05;
      ctx.lineCap = 'round';
      const rIn = r * 1.6, rOut = s * 0.46;
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI / 4) * i;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * rIn, Math.sin(a) * rIn);
        ctx.lineTo(Math.cos(a) * rOut, Math.sin(a) * rOut);
        ctx.stroke();
      }
      ctx.restore();
    },
  },
  {
    id: 'cat', name: 'Cat',
    draw(ctx, s) {
      const r = s * 0.27;
      ctx.beginPath();
      ctx.arc(0, s * 0.05, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-r * 0.75, -r * 0.55);
      ctx.lineTo(-r * 1.15, -r * 1.55);
      ctx.lineTo(-r * 0.05, -r * 0.95);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(r * 0.75, -r * 0.55);
      ctx.lineTo(r * 1.15, -r * 1.55);
      ctx.lineTo(r * 0.05, -r * 0.95);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.lineWidth = s * 0.055;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(r * 0.85, r * 0.70);
      ctx.quadraticCurveTo(r * 1.55, r * 0.50, r * 1.25, r * 0.02);
      ctx.stroke();
      ctx.restore();
    },
  },
  {
    id: 'unicorn', name: 'Unicorn',
    // Head-and-neck in profile. A whole body at this size loses the horn,
    // which is the only thing distinguishing it from a horse.
    draw(ctx, s) {
      // Neck rising to the poll, then down the face to the muzzle.
      ctx.beginPath();
      ctx.moveTo(-s * 0.24, s * 0.48);
      ctx.lineTo(-s * 0.08, -s * 0.04);
      ctx.quadraticCurveTo(-s * 0.02, -s * 0.24, s * 0.14, -s * 0.22);
      ctx.quadraticCurveTo(s * 0.34, -s * 0.18, s * 0.42, s * 0.04);
      ctx.lineTo(s * 0.28, s * 0.12);   // muzzle underside
      ctx.quadraticCurveTo(s * 0.10, s * 0.06, s * 0.06, s * 0.20);
      ctx.lineTo(s * 0.16, s * 0.48);   // throat down to the neck base
      ctx.closePath();
      ctx.fill();

      // Horn — clearly the tallest thing on the head, and angled forward, or
      // it just reads as a second ear and the whole glyph becomes a horse.
      ctx.beginPath();
      ctx.moveTo(s * 0.12, -s * 0.24);
      ctx.lineTo(s * 0.34, -s * 0.62);
      ctx.lineTo(s * 0.26, -s * 0.20);
      ctx.closePath();
      ctx.fill();

      // Ear, set back and deliberately shorter than the horn.
      ctx.beginPath();
      ctx.moveTo(s * 0.02, -s * 0.20);
      ctx.lineTo(-s * 0.10, -s * 0.34);
      ctx.lineTo(s * 0.09, -s * 0.25);
      ctx.closePath();
      ctx.fill();

      // Mane sweeping down the back of the neck.
      ctx.beginPath();
      ctx.moveTo(-s * 0.02, -s * 0.16);
      ctx.quadraticCurveTo(-s * 0.28, s * 0.04, -s * 0.22, s * 0.36);
      ctx.quadraticCurveTo(-s * 0.10, s * 0.10, s * 0.00, s * 0.06);
      ctx.closePath();
      ctx.fill();
    },
  },
  {
    id: 'vine', name: 'Vine',
    // Leaves do the reading, not the stem — small leaves on a wavy line just
    // look like a squiggle.
    draw(ctx, s) {
      ctx.save();
      ctx.lineWidth = s * 0.075;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-s * 0.02, s * 0.48);
      ctx.bezierCurveTo(s * 0.16, s * 0.22, -s * 0.14, s * 0.04, s * 0.02, -s * 0.20);
      ctx.stroke();
      ctx.restore();
      leaf(ctx, s * 0.24, s * 0.18, s * 0.34, -0.8);
      leaf(ctx, -s * 0.24, s * 0.00, s * 0.32, 0.75);
      leaf(ctx, s * 0.14, -s * 0.34, s * 0.28, -0.35);
    },
  },
  {
    id: 'gear', name: 'Gear',
    draw(ctx, s) {
      const rOuter = s * 0.36, rInner = s * 0.24, rHole = s * 0.11;
      const teeth = 8;
      const step = Math.PI / teeth;
      ctx.beginPath();
      for (let i = 0; i < teeth * 2; i++) {
        const a = i * step;
        const r = i % 2 === 0 ? rOuter : rInner;
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.arc(0, 0, rHole, 0, Math.PI * 2, true);
      ctx.fill('evenodd');
    },
  },
];
export const motifById = (id) => MOTIFS.find((m) => m.id === id) ?? MOTIFS[0];

export function typoKeyOf(typo) {
  return [typo.font, typo.size, typo.bold ? 'b' : 'r', typo.ink, typo.glow ? 'g' : '-', typo.underline ? 'u' : '-', typo.motif].join('|');
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

/** Standard face: one centered numeral, plus an optional engraved motif below it. */
export function drawNumerals(ctx, S, fp, typo, color) {
  const text = String(fp.value);
  const inr = fp.uvInradius * S;
  const scale = (typo.size ?? 92) / 100;
  const mark = typo.underline && (fp.value === 6 || fp.value === 9) && fp.sides >= 10;
  const motif = motifById(typo.motif);
  const hasMotif = !!motif.draw;

  // A numeral alone fills most of the incircle, so a motif has to be paid for:
  // the numeral shrinks and rides up, and the glyph takes the space below.
  // Drawn at a fifth the numeral's size it just reads as a speck of dirt.
  const fitPx = inr * (hasMotif ? 1.12 : 1.5) * scale;
  const maxW = inr * (hasMotif ? 1.5 : 1.9);
  const lift = hasMotif ? -inr * 0.30 : 0;

  ctx.save();
  ctx.translate(fp.uvCenter[0] * S, (1 - fp.uvCenter[1]) * S);
  ctx.save();
  ctx.translate(0, lift);
  glyph(ctx, S, text, typo, color, fitPx, maxW, mark, typo.bolder);
  ctx.restore();

  // The motif sits below the numeral. inr is the guaranteed-safe radius from
  // centre to the nearest face edge, so anything kept inside that circle can
  // never spill past the polygon boundary however a face is wound.
  if (hasMotif) {
    const motifS = inr * (mark ? 0.50 : 0.58);
    const motifY = lift + fitPx * (mark ? 0.56 : 0.42) + inr * 0.07 + motifS / 2;
    ctx.save();
    ctx.translate(0, motifY);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, motifS * 0.1);
    motif.draw(ctx, motifS);
    ctx.restore();
  }
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
