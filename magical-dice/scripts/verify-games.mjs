// Rules verification for the dice games: Pig, Bank It, Chicago.
//
// games.js takes no dice of its own (see its header) — every roll here is
// fed in by hand, so this harness plays complete games by driving onRoll()
// and act() with chosen values, the same way main.js would after a real
// throw settles.
//
// No test framework: nothing is installed but Node itself. Expected values
// for the scripted sequences are computed BY HAND in the comments next to
// each step, from the rules in the task, not by running the code first —
// a suite derived from the code's own output would just canonize its bugs.
//
//   node scripts/verify-games.mjs

import { createGame, gameById, GAMES } from '../src/games.js';

// ---------------------------------------------------------------- helpers

let nChecks = 0;
let nFailed = 0;

function check(name, cond, detail) {
  nChecks++;
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    nFailed++;
    console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`);
  }
}

function checkEqual(name, actual, expected) {
  check(name, Object.is(actual, expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const ak = Object.keys(a), bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}

function checkDeepEqual(name, actual, expected) {
  check(name, deepEqual(actual, expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/** Compares only the keys present in `expected` against live fields on `game`. */
function checkState(name, game, expected) {
  const diffs = [];
  for (const k of Object.keys(expected)) {
    const actual = game[k];
    const want = expected[k];
    if (!Object.is(actual, want)) diffs.push(`${k}: expected ${JSON.stringify(want)}, got ${JSON.stringify(actual)}`);
  }
  check(name, diffs.length === 0, diffs.join('; '));
}

function section(title) {
  console.log(`\n${title}`);
}

const d6 = () => 1 + Math.floor(Math.random() * 6);

// ============================================================== registry

section('registry');
{
  checkDeepEqual('GAMES ids are exactly [pig, bank, chicago], in order', GAMES.map((g) => g.id), ['pig', 'bank', 'chicago']);
  checkDeepEqual("createGame('pig').loadout is 1d6", createGame('pig').loadout, { d6: 1 });
  checkDeepEqual("createGame('bank').loadout is 2d6", createGame('bank').loadout, { d6: 2 });
  checkDeepEqual("createGame('chicago').loadout is 2d6", createGame('chicago').loadout, { d6: 2 });

  let threw = false, msg = '';
  try { createGame('nope'); } catch (e) { threw = true; msg = e.message; }
  check("createGame('nope') throws 'unknown game'", threw && /unknown game/.test(msg), msg);

  checkEqual("gameById('bank').name", gameById('bank').name, 'Bank It');
  checkEqual("gameById('nope') is null", gameById('nope'), null);
}

// ==================================================================== pig
//
// Rules: 1d6. Roll to build turnTotal; a 1 wipes turnTotal and ends the
// turn; Hold banks turnTotal into score and ends the turn; score >= 100
// ends the game.

section('pig: scripted sequence (hand-computed)');
{
  const g = createGame('pig');
  checkState('P0: fresh game', g, { score: 0, turnTotal: 0, turns: 1, over: false });
  check('P0: canRoll() true, actions() hold disabled (turnTotal=0)', g.canRoll() === true && g.actions()[0].disabled === true);

  // P1: a 1 on the very first roll of the game. turnTotal was already 0, so
  // it stays 0; the turn still ends and turns advances 1 -> 2.
  g.onRoll([1]);
  checkState('P1: bust on the very first roll of the game', g, { score: 0, turnTotal: 0, turns: 2, over: false });

  // P2: holding at turnTotal=0 must be a no-op (nothing to bank).
  g.act('hold');
  checkState('P2: hold at turnTotal=0 is a no-op', g, { score: 0, turnTotal: 0, turns: 2, over: false });

  // P3-P4: 4, then 5 -> turnTotal = 4, then 9.
  g.onRoll([4]);
  checkState('P3: +4 -> turnTotal 4', g, { turnTotal: 4 });
  g.onRoll([5]);
  checkState('P4: +5 -> turnTotal 9', g, { turnTotal: 9 });

  // P5: hold banks 9. score 0+9=9 < 100, so turns advances 2 -> 3.
  g.act('hold');
  checkState('P5: hold banks 9 -> score 9, new turn 3', g, { score: 9, turnTotal: 0, turns: 3, over: false });

  // P6-P7: 6 (turnTotal=6), then a 1 busts it. Score unaffected (9), turns 3 -> 4.
  g.onRoll([6]);
  checkState('P6: +6 -> turnTotal 6', g, { turnTotal: 6 });
  g.onRoll([1]);
  checkState('P7: bust mid-turn wipes turnTotal, score untouched', g, { score: 9, turnTotal: 0, turns: 4, over: false });

  // P8-P17: ten rolls of 6 -> turnTotal = 60 (6*10).
  for (let i = 0; i < 10; i++) g.onRoll([6]);
  checkState('P8-P17: ten rolls of 6 -> turnTotal 60', g, { turnTotal: 60, score: 9, turns: 4 });

  // P18: hold banks 60. score 9+60=69 < 100 -> turns 4 -> 5.
  g.act('hold');
  checkState('P18: hold banks 60 -> score 69, new turn 5', g, { score: 69, turnTotal: 0, turns: 5, over: false });

  // P19-P24: 6,6,6,6,5,2 -> turnTotal = 6+6+6+6+5+2 = 31.
  for (const v of [6, 6, 6, 6, 5, 2]) g.onRoll([v]);
  checkState('P19-P24: 6+6+6+6+5+2 -> turnTotal 31', g, { turnTotal: 31, score: 69, over: false });

  // P25: hold banks 31. score 69+31 = 100 exactly -> game over. Because the
  // >=100 branch is taken, turns is NOT incremented; it stays 5, meaning
  // "reached 100 in 5 turns".
  g.act('hold');
  checkState('P25: hold banks 31 -> score EXACTLY 100, game over, turns stays 5', g, { score: 100, turnTotal: 0, turns: 5, over: true });
  check('P25: canRoll() now false', g.canRoll() === false);
  checkDeepEqual('P25: status()', g.status(), { headline: 'Complete', detail: 'A hundred, and the game is yours.', score: 100, sub: 'in 5 turns' });
  checkDeepEqual('P25: result()', g.result(), { title: '100 in 5 turns', detail: 'Fewer turns is a better run.' });

  // P26-P27: BUG FOUND — onRoll()/act() did not check `over`, so a finished
  // game could still be driven (see report). Fixed by guarding both. Prove
  // the fix: feeding more rolls/holds after game-over must not move score,
  // turnTotal or turns at all.
  g.onRoll([6]);
  checkState('P26: onRoll() after isOver() is a no-op (post-fix)', g, { score: 100, turnTotal: 0, turns: 5, over: true });
  g.act('hold');
  checkState('P27: act(hold) after isOver() is a no-op (post-fix)', g, { score: 100, turnTotal: 0, turns: 5, over: true });
}

section('pig: overshoot boundary + result() score bug');
{
  const g = createGame('pig');
  // 16 rolls of 6 -> turnTotal = 96.
  for (let i = 0; i < 16; i++) g.onRoll([6]);
  checkState('O1: 16 x 6 -> turnTotal 96', g, { turnTotal: 96 });
  // Hold banks 96. 96 < 100 -> not over, turns 1 -> 2.
  g.act('hold');
  checkState('O2: hold at 96 -> score 96, still short of 100', g, { score: 96, turnTotal: 0, turns: 2, over: false });
  // One more 6 -> turnTotal 6. Hold: score 96+6=102, OVERSHOOTS 100.
  g.onRoll([6]);
  g.act('hold');
  checkState('O3: hold at 102 -> overshoots 100, game over, turns stays 2', g, { score: 102, turnTotal: 0, turns: 2, over: true });

  // BUG FOUND: result().title was hardcoded to the literal "100", so an
  // overshoot win (score 102) still reported "100 in 2 turns" — wrong, and
  // inconsistent with Bank It/Chicago's result(), which both use the real
  // score. Fixed to interpolate this.score.
  checkDeepEqual("O4: result() reports the ACTUAL score (102), not a hardcoded 100", g.result(), { title: '102 in 2 turns', detail: 'Fewer turns is a better run.' });
}

// ================================================================ bank it
//
// Rules: 2d6, 10 rounds. Rolls 1-3 of a round: 7 pays 70 to the pot, else
// add face total. Roll 4+: 7 busts (wipes pot, ends round); doubles double
// the pot; else add face total. Bank adds pot to score and ends the round,
// any time. Round advances by 1 whenever a round ends (bust or bank),
// unless it was round 10, which ends the game instead.

section('bank it: scripted sequence (hand-computed)');
{
  const g = createGame('bank');
  checkState('B0: fresh game', g, { score: 0, round: 1, pot: 0, rollsThisRound: 0, over: false });

  // --- round 1 ---
  // Roll 1: [3,4]=7, safe (roll 1 <= 3) -> pays 70. pot 0+70=70.
  g.onRoll([3, 4]);
  checkState('B1: round1 roll1, seven in safe zone pays 70 -> pot 70', g, { pot: 70, rollsThisRound: 1, round: 1 });
  // Roll 2: [2,2]=4, a double, but still safe zone -> doubles do NOT apply
  // here, just add the face total. pot 70+4=74.
  g.onRoll([2, 2]);
  checkState('B2: round1 roll2, double in safe zone just adds total (no doubling)', g, { pot: 74, rollsThisRound: 2 });
  // Roll 3: [6,6]=12, a double, roll 3 is STILL safe (3 <= 3) -> just adds.
  // pot 74+12=86. This is the roll-3 boundary: doubles are inert here.
  g.onRoll([6, 6]);
  checkState('B3: round1 roll3 (boundary), double still in safe zone -> just adds, no doubling', g, { pot: 86, rollsThisRound: 3 });
  // Roll 4: [3,3]=6, a double, roll 4 is NOT safe (4 <= 3 is false) ->
  // doubles now apply: pot doubles. 86*2=172. This is the roll-4 boundary.
  g.onRoll([3, 3]);
  checkState('B4: round1 roll4 (boundary), double now DOUBLES the pot -> 172', g, { pot: 172, rollsThisRound: 4, over: false });
  // Roll 5: [5,1]=6, not safe, not a double, not 7 -> just adds. pot 172+6=178.
  g.onRoll([5, 1]);
  checkState('B5: round1 roll5, ordinary total just adds -> pot 178', g, { pot: 178, rollsThisRound: 5 });
  // Bank: score 0+178=178. round(1) < ROUNDS(10) -> round advances to 2.
  g.act('bank');
  checkState('B6: bank -> score 178, round advances 1 -> 2, pot resets', g, { score: 178, pot: 0, rollsThisRound: 0, round: 2, over: false });

  // --- round 2: three sevens in the safe zone, then a seven busts it ---
  g.onRoll([4, 3]); // roll1=7, safe -> pot 70
  g.onRoll([1, 6]); // roll2=7, safe -> pot 140
  g.onRoll([2, 5]); // roll3=7, safe (boundary) -> pot 210 — the "seven on roll 3 PAYS" case
  checkState('B7: round2 roll1-3, three sevens in the safe zone each pay 70 -> pot 210', g, { pot: 210, rollsThisRound: 3, round: 2 });
  // Roll 4: [4,3]=7, NOT safe -> BUSTS. pot wiped to 0, round ends (not
  // banked), round(2) < 10 -> round advances to 3. Score untouched (178) —
  // the 210 pot is lost. This is the "seven on roll 4 BUSTS" boundary case.
  g.onRoll([4, 3]);
  checkState('B8: round2 roll4 (boundary), seven BUSTS -> pot wiped, score untouched, round advances', g, { score: 178, pot: 0, rollsThisRound: 0, round: 3, over: false });
  check('B8: lastBust flag set on the busting roll', g.lastBust === true);

  // --- round 3: banking a 0 pot is a no-op, then a normal bank ---
  g.act('bank');
  checkState('B9: bank with pot=0 is a no-op', g, { score: 178, round: 3, pot: 0 });
  g.onRoll([6, 1]); // roll1=7, safe -> pot 70
  g.act('bank'); // score 178+70=248, round 3 -> 4
  checkState('B10: bank 70 -> score 248, round advances 3 -> 4', g, { score: 248, round: 4, pot: 0, rollsThisRound: 0 });

  // --- rounds 4-9: same one-roll-then-bank pattern, +70 each round ---
  // round4: score 248+70=318, round->5
  // round5: score 318+70=388, round->6
  // round6: score 388+70=458, round->7
  // round7: score 458+70=528, round->8
  // round8: score 528+70=598, round->9
  // round9: score 598+70=668, round->10
  for (let i = 0; i < 6; i++) {
    g.onRoll([3, 4]);
    g.act('bank');
  }
  checkState('B11: rounds 4-9 bank 70 each (6 rounds, +420) -> score 668, now round 10', g, { score: 668, round: 10, pot: 0, rollsThisRound: 0, over: false });
}

section('bank it: round 10 (final round) — bust still ends the game');
{
  // Rebuild the identical round-1..9 setup (see B0-B11 above; score 668,
  // round 10) via the same hand-verified sequence, then bust round 10.
  const g = createGame('bank');
  g.onRoll([3, 4]); g.onRoll([2, 2]); g.onRoll([6, 6]); g.onRoll([3, 3]); g.onRoll([5, 1]); g.act('bank'); // -> score 178, round 2
  g.onRoll([4, 3]); g.onRoll([1, 6]); g.onRoll([2, 5]); g.onRoll([4, 3]); // bust -> score 178, round 3
  g.act('bank'); // no-op, pot 0
  g.onRoll([6, 1]); g.act('bank'); // -> score 248, round 4
  for (let i = 0; i < 6; i++) { g.onRoll([3, 4]); g.act('bank'); } // -> score 668, round 10
  checkState('F0: reached round 10 with score 668 (shared setup)', g, { score: 668, round: 10, pot: 0, over: false });

  // Round 10: 7, 3, 11 (safe x3, pot 70+3+11=84), then a 7 on roll 4 busts.
  g.onRoll([3, 4]); // roll1=7 safe -> pot 70
  g.onRoll([1, 2]); // roll2=3 -> pot 73
  g.onRoll([5, 6]); // roll3=11 (boundary, still safe) -> pot 84
  checkState('F1: final round roll1-3 -> pot 84', g, { pot: 84, rollsThisRound: 3, over: false });
  g.onRoll([4, 3]); // roll4=7 -> BUSTS, and this was the LAST round
  checkState('F2: bust on round 10 still ends the GAME (not just the round)', g, { score: 668, pot: 0, round: 10, over: true });
  checkDeepEqual('F2: status()', g.status(), { headline: 'Complete', detail: 'The last round ends empty.', score: 668, sub: 'final' });
  checkDeepEqual('F2: result()', g.result(), { title: 'Banked 668', detail: 'Ten rounds of nerve.' });
}

section('bank it: round 10 (final round) — banking still ends the game, and post-over safety');
{
  const g = createGame('bank');
  g.onRoll([3, 4]); g.onRoll([2, 2]); g.onRoll([6, 6]); g.onRoll([3, 3]); g.onRoll([5, 1]); g.act('bank');
  g.onRoll([4, 3]); g.onRoll([1, 6]); g.onRoll([2, 5]); g.onRoll([4, 3]);
  g.act('bank');
  g.onRoll([6, 1]); g.act('bank');
  for (let i = 0; i < 6; i++) { g.onRoll([3, 4]); g.act('bank'); }
  checkState('K0: reached round 10 with score 668 (shared setup)', g, { score: 668, round: 10, pot: 0, over: false });

  // Roll1=7, safe -> pot 70. Bank -> score 668+70=738, and since this was
  // round 10, the GAME ends (not just the round).
  g.onRoll([3, 4]);
  g.act('bank');
  checkState('K1: banking on round 10 ends the GAME', g, { score: 738, pot: 0, round: 10, over: true });
  checkDeepEqual('K1: status()', g.status(), { headline: 'Complete', detail: 'Banked, and that was the last round.', score: 738, sub: 'final' });
  checkDeepEqual('K1: result()', g.result(), { title: 'Banked 738', detail: 'Ten rounds of nerve.' });

  // BUG FOUND — same class as Pig: onRoll()/act() did not check `over`.
  // A stray onRoll() after game-over silently re-armed the pot (rollsThisRound
  // 0->1 lands in the safe zone), and a stray act('bank') then banked it,
  // inflating score. Fixed by guarding both. Prove the fix:
  g.onRoll([3, 4]); // would pay 70 to the pot pre-fix
  checkState('K2: onRoll() after isOver() is a no-op (post-fix)', g, { pot: 0, rollsThisRound: 0, score: 738, over: true });
  g.act('bank');
  checkState('K3: act(bank) after isOver() is a no-op (post-fix)', g, { score: 738, over: true });
}

section('bank it: doubles on roll 4+ never coincide with a bust-seven');
{
  // Doubles sum to an even number (2,4,6,8,10,12); 7 is odd. So a double
  // can never also total 7 — confirm the code's isDouble branch (which
  // only runs once the total!==7 check has passed) is exercised for every
  // possible double, never the bust branch.
  checkEqual('math: no d6 double sums to 7', [1, 2, 3, 4, 5, 6].some((i) => 2 * i === 7), false);

  for (let i = 1; i <= 6; i++) {
    const g = createGame('bank');
    // Three safe filler rolls of [2,3]=5 each -> pot 5+5+5=15, rollsThisRound=3.
    g.onRoll([2, 3]); g.onRoll([2, 3]); g.onRoll([2, 3]);
    checkState(`D${i}.0: three safe rolls of 5 -> pot 15`, g, { pot: 15, rollsThisRound: 3 });
    // Roll 4: double (i,i), sum 2i (never 7) -> pot doubles: 15*2=30.
    g.onRoll([i, i]);
    checkState(`D${i}: double (${i},${i}) at roll 4 doubles the pot, does not bust`, g, { pot: 30, rollsThisRound: 4, round: 1, over: false });
  }
}

// ================================================================ chicago
//
// Rules: 2d6, targets 2..12 in order, one roll each (11 rolls total). A hit
// (roll total === target) adds the target's value to score. After target 12
// the game is over.

section('chicago: scripted sequence (hand-computed)');
{
  const g = createGame('chicago');
  checkState('C0: fresh game, target starts at 2', g, { score: 0, target: 2, hits: 0, over: false });

  // Roll totals chosen by hand to mix hits and misses across all 11 targets.
  // target: 2  3  4  5  6  7  8  9  10 11 12
  // roll:   2  3  2  5  3  7  8  8  10 11 12
  // result: HIT HIT miss HIT miss HIT HIT miss HIT HIT HIT
  const steps = [
    { dice: [1, 1], target: 2, total: 2, hit: true },
    { dice: [1, 2], target: 3, total: 3, hit: true },
    { dice: [1, 1], target: 4, total: 2, hit: false },
    { dice: [2, 3], target: 5, total: 5, hit: true },
    { dice: [1, 2], target: 6, total: 3, hit: false },
    { dice: [3, 4], target: 7, total: 7, hit: true },
    { dice: [4, 4], target: 8, total: 8, hit: true }, // also a double; Chicago ignores that
    { dice: [3, 5], target: 9, total: 8, hit: false },
    { dice: [5, 5], target: 10, total: 10, hit: true },
    { dice: [5, 6], target: 11, total: 11, hit: true },
    { dice: [6, 6], target: 12, total: 12, hit: true },
  ];
  // Hit targets: 2,3,5,7,8,10,11,12 -> score = 2+3+5+7+8+10+11+12 = 58.
  // hits = 8. Missed: 4,6,9 (3 misses). 8+3 = 11 rolls total, matching the
  // eleven targets 2..12 exactly, no skips or repeats.
  let expectedScore = 0, expectedHits = 0;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    checkEqual(`Ch${i}: target before roll ${i + 1} is ${s.target}`, g.target, s.target);
    g.onRoll(s.dice);
    if (s.hit) { expectedScore += s.target; expectedHits += 1; }
    const isLast = i === steps.length - 1;
    checkState(`Ch${i}: roll ${i + 1} (${s.dice.join('+')}=${s.total}) vs target ${s.target} -> ${s.hit ? 'HIT' : 'miss'}`, g, {
      score: expectedScore,
      hits: expectedHits,
      target: isLast ? 12 : s.target + 1,
      over: isLast,
    });
  }
  checkEqual('C11: score is exactly the sum of hit targets (2+3+5+7+8+10+11+12=58)', g.score, 58);
  checkEqual('C11: exactly 11 rolls played (targets 2..12, no skips/repeats)', steps.length, 11);
  checkDeepEqual('C11: status()', g.status(), { headline: 'Complete', detail: 'Eleven targets, 8 hit.', score: 58, sub: '8 of 11 hit' });
  checkDeepEqual('C11: result()', g.result(), { title: '58 points', detail: '8 of eleven targets.' });

  // BUG FOUND — onRoll() did not check `over`. Because target sticks at 12
  // once the game ends, feeding more rolls that total 12 kept scoring
  // forever (verified empirically: 12 -> 36 after two stray rolls, pre-fix).
  // Fixed by guarding onRoll(). Prove the fix:
  g.onRoll([6, 6]); // totals 12, matches the stuck target — would have hit again pre-fix
  checkState('C12: onRoll() after isOver() is a no-op even when it "would hit" (post-fix)', g, { score: 58, hits: 8, target: 12, over: true });
  g.onRoll([2, 2]);
  checkState('C13: onRoll() after isOver() stays a no-op on a second stray roll', g, { score: 58, hits: 8, target: 12, over: true });
}

section('chicago: every target missed (zero-score edge case)');
{
  const g = createGame('chicago');
  // Roll [1,2]=3 against target 2 (miss), and [1,1]=2 against every other
  // target 3..12 (always a miss, since none of them equal 2). 11 misses.
  g.onRoll([1, 2]); // target 2, total 3 -> miss
  for (let t = 3; t <= 12; t++) g.onRoll([1, 1]); // total 2, never equals t
  checkState('M0: every one of the 11 targets missed -> score and hits stay 0', g, { score: 0, hits: 0, target: 12, over: true });
  check('M0: score never negative', g.score >= 0);
}

// ============================================================ reset() + act()/actions() consistency

section('reset() restores a truly fresh game');
{
  for (const id of ['pig', 'bank', 'chicago']) {
    const fresh = createGame(id);
    const played = createGame(id);
    if (id === 'pig') { played.onRoll([4]); played.onRoll([5]); played.act('hold'); played.onRoll([1]); }
    if (id === 'bank') { played.onRoll([3, 4]); played.onRoll([2, 2]); played.act('bank'); played.onRoll([1, 6]); }
    if (id === 'chicago') { played.onRoll([1, 1]); played.onRoll([6, 6]); }
    played.reset();
    checkDeepEqual(`${id}: reset() after play matches a brand-new game field-for-field`, played, fresh);
  }
}

section('actions()/act() consistency: an enabled action is never ignored');
{
  {
    const g = createGame('pig');
    g.onRoll([5]); // turnTotal=5
    const a = g.actions().find((x) => x.id === 'hold');
    check('pig: hold is enabled once turnTotal>0', a.disabled === false);
    const before = { score: g.score, turnTotal: g.turnTotal };
    g.act(a.id);
    check('pig: enabled hold actually banks turnTotal (not ignored)', g.score === before.score + before.turnTotal && g.turnTotal === 0);
  }
  {
    const g = createGame('bank');
    g.onRoll([2, 3]); // pot=5
    const a = g.actions().find((x) => x.id === 'bank');
    check('bank: bank is enabled once pot>0', a.disabled === false);
    const before = { score: g.score, pot: g.pot };
    g.act(a.id);
    check('bank: enabled bank actually banks the pot (not ignored)', g.score === before.score + before.pot && g.pot === 0);
  }
  {
    const g = createGame('chicago');
    check('chicago: actions() is always empty (no player decisions)', g.actions().length === 0);
    g.act('anything');
    check('chicago: act() on a no-decision game never throws or changes score', g.score === 0);
  }
}

// ======================================================= randomised soak

const SOAK_N = 3000;

section(`randomised soak (${SOAK_N} games each)`);

function soakPig(n) {
  const ROLL_CAP = 2000;
  const turns = [];
  const issues = [];
  for (let i = 0; i < n; i++) {
    const g = createGame('pig');
    let rolls = 0;
    while (!g.isOver() && rolls < ROLL_CAP) {
      if (g.canRoll() === g.isOver()) issues.push(`#${i}: canRoll()===isOver() (both ${g.canRoll()})`);
      if (g.score < 0) issues.push(`#${i}: negative score ${g.score}`);
      if (g.turnTotal > 0 && (g.turnTotal >= 20 || Math.random() < 0.15)) {
        const a = g.actions().find((x) => x.id === 'hold');
        if (a.disabled) { issues.push(`#${i}: hold reported disabled while turnTotal=${g.turnTotal}`); break; }
        const before = { score: g.score, turnTotal: g.turnTotal };
        g.act('hold');
        if (g.score !== before.score + before.turnTotal || g.turnTotal !== 0) issues.push(`#${i}: enabled hold ignored/miscalculated`);
      } else {
        g.onRoll([d6()]);
        rolls++;
      }
    }
    if (!g.isOver()) { issues.push(`#${i}: hit roll cap (${ROLL_CAP}) without ending`); continue; }
    turns.push(g.turns);

    // post-over robustness, re-checked across many different end-states
    const before = { score: g.score, turns: g.turns, turnTotal: g.turnTotal };
    g.onRoll([d6()]); g.onRoll([d6()]); g.act('hold');
    if (g.score !== before.score || g.turns !== before.turns || g.turnTotal !== before.turnTotal) {
      issues.push(`#${i}: post-over state changed (score ${before.score} -> ${g.score})`);
    }

    if (i % 250 === 0) {
      const fresh = createGame('pig');
      g.reset();
      if (!deepEqual(g, fresh)) issues.push(`#${i}: reset() did not restore a fresh state`);
    }
  }
  check(`pig: ${n} games — no negative score, canRoll/isOver stay opposite, post-over safe, reset clean, all under ${ROLL_CAP} rolls`, issues.length === 0, issues.slice(0, 3).join(' | '));
  if (turns.length) {
    const avg = turns.reduce((a, b) => a + b, 0) / turns.length;
    console.log(`    turns to 100 — min ${Math.min(...turns)}, max ${Math.max(...turns)}, avg ${avg.toFixed(1)} (policy: hold at turnTotal>=20, or 15% chance each roll)`);
  }
}

function soakBankIt(n) {
  const ROLL_CAP = 1000;
  const scores = [];
  const issues = [];
  for (let i = 0; i < n; i++) {
    const g = createGame('bank');
    let rolls = 0;
    while (!g.isOver() && rolls < ROLL_CAP) {
      if (g.canRoll() === g.isOver()) issues.push(`#${i}: canRoll()===isOver() (both ${g.canRoll()})`);
      if (g.score < 0) issues.push(`#${i}: negative score ${g.score}`);
      if (g.round > g.ROUNDS) issues.push(`#${i}: round ${g.round} exceeds ROUNDS ${g.ROUNDS}`);
      if (g.pot > 0 && (g.pot >= 150 || Math.random() < 0.2)) {
        const a = g.actions().find((x) => x.id === 'bank');
        if (a.disabled) { issues.push(`#${i}: bank reported disabled while pot=${g.pot}`); break; }
        const before = { score: g.score, pot: g.pot };
        g.act('bank');
        if (g.score !== before.score + before.pot || g.pot !== 0) issues.push(`#${i}: enabled bank ignored/miscalculated`);
      } else {
        g.onRoll([d6(), d6()]);
        rolls++;
      }
    }
    if (!g.isOver()) { issues.push(`#${i}: hit roll cap (${ROLL_CAP}) without ending`); continue; }
    scores.push(g.score);

    const before = { score: g.score, round: g.round, pot: g.pot };
    g.onRoll([d6(), d6()]); g.onRoll([d6(), d6()]); g.act('bank');
    if (g.score !== before.score || g.round !== before.round || g.pot !== before.pot) {
      issues.push(`#${i}: post-over state changed (score ${before.score} -> ${g.score})`);
    }

    if (i % 250 === 0) {
      const fresh = createGame('bank');
      g.reset();
      if (!deepEqual(g, fresh)) issues.push(`#${i}: reset() did not restore a fresh state`);
    }
  }
  check(`bank it: ${n} games — no negative score, round<=10, canRoll/isOver stay opposite, post-over safe, reset clean, all under ${ROLL_CAP} rolls`, issues.length === 0, issues.slice(0, 3).join(' | '));
  if (scores.length) {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    console.log(`    final score — min ${Math.min(...scores)}, max ${Math.max(...scores)}, avg ${avg.toFixed(1)} (policy: bank at pot>=150, or 20% chance each roll)`);
  }
}

function soakChicago(n) {
  const scores = [];
  const issues = [];
  for (let i = 0; i < n; i++) {
    const g = createGame('chicago');
    let rolls = 0;
    while (!g.isOver() && rolls <= 20) {
      if (g.canRoll() === g.isOver()) issues.push(`#${i}: canRoll()===isOver() (both ${g.canRoll()})`);
      if (g.score < 0) issues.push(`#${i}: negative score ${g.score}`);
      if (g.actions().length !== 0) issues.push(`#${i}: chicago actions() should always be empty`);
      g.onRoll([d6(), d6()]);
      rolls++;
    }
    if (rolls !== 11) issues.push(`#${i}: took ${rolls} rolls, expected exactly 11`);
    scores.push(g.score);

    const before = { score: g.score, hits: g.hits, target: g.target };
    g.onRoll([6, 6]); g.onRoll([6, 6]);
    if (g.score !== before.score || g.hits !== before.hits || g.target !== before.target) {
      issues.push(`#${i}: post-over state changed (score ${before.score} -> ${g.score})`);
    }

    if (i % 250 === 0) {
      const fresh = createGame('chicago');
      g.reset();
      if (!deepEqual(g, fresh)) issues.push(`#${i}: reset() did not restore a fresh state`);
    }
  }
  check(`chicago: ${n} games — always exactly 11 rolls, no negative score, post-over safe, reset clean`, issues.length === 0, issues.slice(0, 3).join(' | '));
  if (scores.length) {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    console.log(`    final score — min ${Math.min(...scores)}, max ${Math.max(...scores)}, avg ${avg.toFixed(1)}`);
  }
}

soakPig(SOAK_N);
soakBankIt(SOAK_N);
soakChicago(SOAK_N);

// ======================================================================

console.log(`\n${nChecks} checks, ${nChecks - nFailed} passed, ${nFailed} failed`);
console.log('GAMES:', nFailed === 0 ? 'PASS' : 'FAIL');
process.exit(nFailed === 0 ? 0 : 1);
