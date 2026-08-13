// DOM wiring: loadout, style swatches, typography, the ritual of seeds,
// verdict, chips, chronicle, toast. Pure view layer — main.js owns the loop.

import { STYLES, styleById, styleSwatchURL } from './dice/materials.js';
import { FONTS, INKS, fontById, MOTIFS, motifById } from './dice/faces.js';
import { DIE_TYPES } from './dice/geometry.js';

const $ = (sel) => document.querySelector(sel);

export const MAX_DICE = 12;

const DIE_ICONS = {
  d4: 'M50 8 L92 82 L8 82 Z',
  d6: 'M14 14 H86 V86 H14 Z',
  d8: 'M50 6 L92 50 L50 94 L8 50 Z',
  d10: 'M50 5 L88 42 L50 95 L12 42 Z',
  d12: 'M50 6 L90 36 L74 90 L26 90 L10 36 Z',
  d20: 'M50 5 L89 27 L89 73 L50 95 L11 73 L11 27 Z',
};

const PRESETS = [
  { name: 'Seer’s Six', loadout: { d4: 1, d6: 1, d8: 1, d10: 1, d12: 1, d20: 1 } },
  { name: 'Hero’s d20', loadout: { d20: 1 } },
  { name: 'Fireball · 8d6', loadout: { d6: 8 } },
  { name: 'Bones · 2d6', loadout: { d6: 2 } },
];

export function initUI(state, handlers) {
  const els = {
    rollBtn: $('#roll-btn'),
    summary: $('#loadout-summary'),
    verdict: $('#verdict'),
    verdictTotal: $('#verdict-total'),
    verdictLabel: $('#verdict-label'),
    verdictFlourish: $('#verdict-flourish'),
    chips: $('#chips'),
    chronicle: $('#chronicle-list'),
    panel: $('#panel'),
    panelToggle: $('#panel-toggle'),
    loadout: $('#loadout'),
    presets: $('#presets'),
    capHint: $('#dice-cap-hint'),
    styles: $('#styles'),
    motley: $('#opt-motley'),
    wisps: $('#opt-wisps'),
    font: $('#opt-font'),
    motif: $('#opt-motif'),
    size: $('#opt-size'),
    bold: $('#opt-bold'),
    glow: $('#opt-glow'),
    underline: $('#opt-underline'),
    inks: $('#ink-swatches'),
    preview: $('#type-preview'),
    seeds: [$('#seed-1'), $('#seed-2'), $('#seed-3')],
    weave: $('#weave-btn'),
    sigil: $('#sigil'),
    sound: $('#opt-sound'),
    toast: $('#toast'),
  };

  let toastTimer = null;
  function toast(msg, ms = 3400) {
    els.toast.textContent = msg;
    els.toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.add('hidden'), ms);
  }

  // ---- panel & tabs --------------------------------------------------------

  els.panelToggle.addEventListener('click', () => {
    const closed = els.panel.classList.toggle('closed');
    els.panelToggle.setAttribute('aria-expanded', String(!closed));
  });
  if (window.innerWidth < 760) {
    els.panel.classList.add('closed');
    els.panelToggle.setAttribute('aria-expanded', 'false');
  }

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => {
        t.classList.toggle('active', t === tab);
        t.setAttribute('aria-selected', String(t === tab));
      });
      document.querySelectorAll('.tab-page').forEach((p) =>
        p.classList.toggle('active', p.id === `page-${tab.dataset.tab}`));
    });
  });

  // ---- loadout -------------------------------------------------------------

  const totalDice = () => Object.values(state.loadout).reduce((a, b) => a + b, 0);

  function renderLoadout() {
    els.loadout.innerHTML = '';
    for (const type of DIE_TYPES) {
      const row = document.createElement('div');
      row.className = 'die-row' + (state.loadout[type] > 0 ? ' has-dice' : '');
      row.innerHTML = `
        <svg viewBox="0 0 100 100" aria-hidden="true"><path class="shape" d="${DIE_ICONS[type]}"/></svg>
        <span class="name">${type}</span>
        <span class="count">${state.loadout[type]}</span>
        <button class="minus" aria-label="remove a ${type}" ${state.loadout[type] === 0 ? 'disabled' : ''}>−</button>
        <button class="plus" aria-label="add a ${type}" ${totalDice() >= MAX_DICE ? 'disabled' : ''}>+</button>`;
      row.querySelector('.minus').addEventListener('click', () => bump(type, -1));
      row.querySelector('.plus').addEventListener('click', () => bump(type, +1));
      els.loadout.appendChild(row);
    }
    els.capHint.textContent = totalDice() >= MAX_DICE
      ? `The tray holds ${MAX_DICE} dice at most.`
      : '';
    renderSummary();
  }

  function bump(type, delta) {
    const next = Math.max(0, state.loadout[type] + delta);
    if (delta > 0 && totalDice() >= MAX_DICE) return;
    state.loadout[type] = next;
    renderLoadout();
    handlers.onLoadoutChange();
  }

  els.presets.innerHTML = '';
  for (const preset of PRESETS) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = preset.name;
    b.addEventListener('click', () => {
      for (const t of DIE_TYPES) state.loadout[t] = preset.loadout[t] ?? 0;
      renderLoadout();
      handlers.onLoadoutChange();
    });
    els.presets.appendChild(b);
  }

  function renderSummary() {
    const parts = DIE_TYPES.filter((t) => state.loadout[t] > 0)
      .map((t) => (state.loadout[t] > 1 ? `${state.loadout[t]}${t}` : t));
    const styleName = state.motley ? 'Motley' : styleById(state.styleId).name;
    els.summary.textContent = parts.length
      ? `${parts.join(' + ')} — ${styleName}`
      : 'choose your dice';
  }

  // ---- styles --------------------------------------------------------------

  function renderStyles() {
    els.styles.innerHTML = '';
    for (const style of STYLES) {
      const b = document.createElement('button');
      b.className = 'swatch' + (style.id === state.styleId ? ' active' : '');
      b.title = style.name;
      b.style.backgroundImage = `url(${styleSwatchURL(style)})`;
      b.innerHTML = `<span class="label">${style.name}</span>`;
      b.addEventListener('click', () => {
        state.styleId = style.id;
        renderStyles();
        renderSummary();
        handlers.onStyleChange();
      });
      els.styles.appendChild(b);
    }
  }

  els.motley.checked = state.motley;
  els.motley.addEventListener('change', () => {
    state.motley = els.motley.checked;
    renderSummary();
    handlers.onStyleChange();
  });

  els.wisps.checked = state.wisps;
  els.wisps.addEventListener('change', () => {
    state.wisps = els.wisps.checked;
    handlers.onWispsToggle();
  });

  // ---- typography ----------------------------------------------------------

  els.font.innerHTML = FONTS.map((f) => `<option value="${f.id}">${f.name}</option>`).join('');
  els.font.value = state.typo.font;
  els.motif.innerHTML = MOTIFS.map((m) => `<option value="${m.id}">${m.name}</option>`).join('');
  els.motif.value = state.typo.motif;
  els.size.value = state.typo.size;
  els.bold.checked = state.typo.bold;
  els.glow.checked = state.typo.glow;
  els.underline.checked = state.typo.underline;

  function renderInks() {
    els.inks.innerHTML = '';
    for (const ink of INKS) {
      const b = document.createElement('button');
      b.className = 'ink-swatch' + (ink.id === 'auto' ? ' auto' : '') + (ink.id === state.typo.ink ? ' active' : '');
      b.title = ink.name;
      if (ink.color) b.style.background = ink.color;
      b.addEventListener('click', () => {
        state.typo.ink = ink.id;
        renderInks();
        typoChanged();
      });
      els.inks.appendChild(b);
    }
  }

  function drawTypePreview() {
    const c = els.preview;
    const ctx = c.getContext('2d');
    const { width: W, height: H } = c;
    ctx.clearRect(0, 0, W, H);
    const style = styleById(state.styleId);
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#221a40');
    g.addColorStop(1, '#120d24');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const ink = state.typo.ink === 'auto'
      ? style.ink
      : (INKS.find((i) => i.id === state.typo.ink)?.color ?? '#fff');
    const px = 52 * (state.typo.size / 100);
    ctx.font = `${state.typo.bold ? 700 : 400} ${px}px ${fontById(state.typo.font).css}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (state.typo.glow) {
      ctx.shadowColor = state.typo.ink === 'auto' ? style.glow : ink;
      ctx.shadowBlur = 16;
    }
    ctx.fillStyle = ink;
    const y = H / 2 - 4;
    ctx.fillText('3', W * 0.2, y);
    ctx.fillText('20', W * 0.52, y);
    ctx.fillText('6', W * 0.84, y);
    ctx.shadowBlur = 0;
    if (state.typo.underline) {
      const w = ctx.measureText('6').width;
      ctx.fillRect(W * 0.84 - w * 0.4, y + px * 0.46, w * 0.8, Math.max(2, px * 0.06));
    }

    const motif = motifById(state.typo.motif);
    if (motif.draw) {
      const ms = 24 * Math.min(1.15, state.typo.size / 100);
      const my = Math.min(H - ms * 0.5 - 6, y + px * 0.58 + 12);
      ctx.save();
      ctx.translate(W * 0.52, my);
      if (state.typo.glow) {
        ctx.shadowColor = state.typo.ink === 'auto' ? style.glow : ink;
        ctx.shadowBlur = 12;
      }
      ctx.fillStyle = ink;
      ctx.strokeStyle = ink;
      ctx.lineWidth = Math.max(1, ms * 0.1);
      motif.draw(ctx, ms);
      ctx.restore();
    }
  }

  let typoTimer = null;
  function typoChanged(immediate = false) {
    drawTypePreview();
    clearTimeout(typoTimer);
    // Repainting every face texture is heavier than a preview — debounce.
    typoTimer = setTimeout(() => handlers.onTypoChange(), immediate ? 0 : 220);
  }

  els.font.addEventListener('change', () => { state.typo.font = els.font.value; typoChanged(true); });
  els.motif.addEventListener('change', () => { state.typo.motif = els.motif.value; typoChanged(true); });
  els.size.addEventListener('input', () => { state.typo.size = Number(els.size.value); typoChanged(); });
  els.bold.addEventListener('change', () => { state.typo.bold = els.bold.checked; typoChanged(true); });
  els.glow.addEventListener('change', () => { state.typo.glow = els.glow.checked; typoChanged(true); });
  els.underline.addEventListener('change', () => { state.typo.underline = els.underline.checked; typoChanged(true); });

  // ---- fate ----------------------------------------------------------------

  els.seeds.forEach((input, i) => { input.value = state.seeds[i]; });
  els.weave.addEventListener('click', () => {
    state.seeds = els.seeds.map((s) => s.value);
    handlers.onWeave();
  });
  els.seeds.forEach((input) => input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') els.weave.click();
    e.stopPropagation();
  }));

  els.sound.checked = state.sound;
  els.sound.addEventListener('change', () => {
    state.sound = els.sound.checked;
    handlers.onSoundToggle();
  });

  function setSigil({ runes, hue }) {
    els.sigil.textContent = runes;
    els.sigil.style.setProperty('--sigil-color', `hsl(${hue} 72% 72%)`);
  }

  // ---- roll / verdict / chips / chronicle ----------------------------------

  els.rollBtn.addEventListener('click', handlers.onRoll);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      handlers.onRoll();
    }
  });
  $('#scene').addEventListener('pointerdown', (e) => {
    if (e.isPrimary) handlers.onRoll();
  });

  function setRolling(rolling) {
    els.rollBtn.classList.toggle('rolling', rolling);
    els.rollBtn.querySelector('.roll-label').textContent = rolling ? '…' : 'Roll';
  }

  let countUpRaf = null;
  function showVerdict({ total, single, crit, fumble, doubles }) {
    els.verdict.classList.remove('hidden', 'crit', 'fumble', 'doubles');
    if (crit) els.verdict.classList.add('crit');
    else if (fumble) els.verdict.classList.add('fumble');
    else if (doubles) els.verdict.classList.add('doubles');
    els.verdictLabel.textContent = single ? 'the die speaks' : 'total';
    els.verdictFlourish.textContent = crit && fumble ? 'a twist of fate'
      : crit ? (doubles ? '✦ twin crowns ✦' : '✦ critical ✦')
        : fumble ? (doubles ? 'twin sorrows' : 'the fates frown')
          : doubles ? '✦ doubles ✦'
            : '';
    // count-up
    cancelAnimationFrame(countUpRaf);
    const t0 = performance.now();
    const dur = Math.min(700, 220 + total * 14);
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const eased = 1 - (1 - k) ** 3;
      els.verdictTotal.textContent = String(Math.round(total * eased));
      if (k < 1) countUpRaf = requestAnimationFrame(tick);
    };
    countUpRaf = requestAnimationFrame(tick);
  }

  function hideVerdict() {
    els.verdict.classList.add('hidden');
  }

  const liveChips = [];
  function clearChips() {
    liveChips.length = 0;
    els.chips.innerHTML = '';
  }

  function addChip({ value, type, color, crit, fumble }) {
    const el = document.createElement('div');
    el.className = 'die-chip' + (crit ? ' crit' : '') + (fumble ? ' fumble' : '');
    el.style.setProperty('--chip-color', color);
    el.innerHTML = `<span class="v">${value}</span><span class="t">${type}</span>`;
    els.chips.appendChild(el);
    const chip = { el };
    liveChips.push(chip);
    return chip;
  }

  function positionChip(chip, { x, y, behind }) {
    chip.el.style.display = behind ? 'none' : '';
    chip.el.style.left = `${x}px`;
    chip.el.style.top = `${y}px`;
  }

  function addChronicle({ total, parts, label }) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="total">${total}</span><span class="detail">${label}${parts ? ` · ${parts}` : ''}</span>`;
    els.chronicle.prepend(li);
    while (els.chronicle.children.length > 7) els.chronicle.lastChild.remove();
  }

  renderLoadout();
  renderStyles();
  renderInks();
  drawTypePreview();

  return {
    toast,
    setRolling,
    showVerdict,
    hideVerdict,
    clearChips,
    addChip,
    positionChip,
    addChronicle,
    setSigil,
    renderSummary,
    drawTypePreview,
    totalDice,
  };
}
