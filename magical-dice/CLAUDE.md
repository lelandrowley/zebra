# Fatewoven — working notes

A magical 3D dice roller (Vite + three.js + cannon-es), packaged as an iOS app
via Capacitor. Web source in `src/`, native project in `ios/`.

## Commands

```bash
npm run dev         # dev server (localhost:5173)
npm run build       # single self-contained dist/index.html
npm run verify      # determinism + settle checks — run this after physics/RNG edits
npm run containment # dice-stay-in-the-tray check — also run this after physics edits
npm run audition    # render the table sounds to WAVs you can listen to (needs dev up)
npm run shots       # headless screenshot tour -> shots/
npm run icons       # re-render app icon + splash from scripts/icon.html
npm run ios         # build + sync + open Xcode (macOS only)
```

`verify` needs a browser; `containment` is physics-only and runs 300 rolls in
seconds, so reach for it first when tuning the tray.

Requires Node 20.19+ or 22+. The headless harness needs a Chromium once:
`npx playwright install chromium` (or set `CHROMIUM_PATH` to an existing one).

## Architecture

- `src/dice/geometry.js` — d4–d20 solids discovered from raw vertex sets by
  supporting-plane enumeration, so one code path builds all six (including the
  d10 trapezohedron). Faces get chamfered edges; opposite faces sum to n+1.
  Cached per (type, radius).
- `src/dice/materials.js` — 18 style presets (MeshPhysicalMaterial recipes +
  procedural canvas patterns). Face textures are cached by
  `style | dieType | typoKey`; call `clearMaterialCache()` when typography or
  style changes or you'll paint stale numerals.
- `src/dice/faces.js` — numeral painting and the typography options.
- `src/dice/die.js` — mesh + cannon body + `read()` (top face, or top vertex
  for the d4).
- `src/physics.js` — world, tray walls, and `applyFelt()`.
- `src/scene.js` — renderer, lighting, rune tray, wisps, particles, bloom.
- `src/rng.js` — the `Fate` seeded PRNG stream.
- `src/main.js` — owns the loop and wires everything together.
- `src/ui.js` — all DOM; `src/style.css` — all styles.

## Invariants — break these and the app quietly stops working

1. **Only roll mechanics draw from the `Fate` stream.** Cosmetic randomness
   (sparks, wisps, dust, stone patterns) must use `Math.random`. A single
   `fate.next()` in a visual effect desynchronizes every future roll, so the
   same three answers stop reproducing the same rolls.
2. **Physics steps at a fixed 1/120 s** through an accumulator, and the roll
   timeout counts *sim steps*, not wall-clock ms. Wall-clock anywhere in the
   roll path makes results frame-rate dependent.
3. **`npm run verify` must pass.** It rolls, reloads, re-rolls, and asserts the
   values are identical. That check is the whole point of the seed ritual.
4. **Dice need rolling resistance.** `applyFelt()` in `physics.js` is not
   decoration — rigid-body sims have none, so round dice orbit the tray
   forever without it. Tune carefully and re-run `verify`.
5. **Dice must not leave the tray, and the walls alone won't hold them.**
   Two things keep them in, both proven by `npm run containment`:
   * `throwFrom` takes ONE `baseAngle` per throw, drawn by the caller. Draw it
     per-die instead and the dice spawn interpenetrating (191 of 200 rolls),
     the solver ejects them at 4x throw speed, and they leave the dish.
   * `applyContainment()` in `physics.js`. cannon-es generates
     convex-polyhedron-vs-box contacts unreliably once dice stack against the
     wall, so they creep through it at ordinary speeds — no amount of wall
     height or thickness fixes that. Like `applyFelt`, it runs inside the
     fixed step, so it must stay free of wall-clock and `Math.random`.
6. **Impact sounds are modal.** `audio.js` builds each clack from damped
   sinusoids at inharmonic ratios, because that spread is what the ear reads
   as material. Broadband filtered noise reads as hiss and a falling sine
   reads as a drum — that was the first version, and it sounded cheap.
   `npm run audition` renders the sounds to WAV so you can check by ear.
7. **Sandboxed embeds are a supported target.** `localStorage` access must stay
   guarded (it throws on opaque origins) and the rAF watchdog in `main.js`
   must survive — some hosts park `requestAnimationFrame` entirely.
   `node scripts/probe-sandbox.mjs` reproduces that environment.

## iOS

Capacitor 8 with Swift Package Manager (no CocoaPods), iOS 15+ (WebGL2).
After changing web code: `npm run build && npx cap sync ios`. Native haptics
live in `src/haptics.js` and no-op outside the app. Bundle id and app name are
in `capacitor.config.json`; signing is set in Xcode.
