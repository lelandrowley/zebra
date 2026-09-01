// Rules verification for the dice games: Pig, Bank It, Chicago — now played by
// 1 to 6 players (see the contract block at the top of src/games.js).
//
// games.js takes no dice of its own — every roll here is fed in by hand, so
// this harness plays complete games by driving onRoll()/act() with chosen
// values, the same way main.js would after a real throw settles.
//
// No test framework: nothing is installed but Node itself. Expected values
// for the scripted sequences are computed BY HAND in the comments next to
// each step (or via a small closed-form formula whose correctness is
// evident by inspection), not by running the code first — a suite derived
// from the code's own output would just canonize its bugs.
//
//   node scripts/verify-games.mjs
//
// BUG FOUND — BankIt.playerActions(i) did not validate `i`, so calling it
// with an out-of-range index (e.g. 99) returned an ENABLED 'bank' action
// for a nonexistent player, even though act('bank', 99) correctly refuses
// it (out-of-range guard). That is exactly the inconsistency the contract
// forbids: "playerActions() must never offer an enabled button that act()
// ignores." Fixed in src/games.js by adding the same range/null check
// act() already used. See the "bank it: act()/playerActions() boundaries"
// section below, which proves the fix.

import { createGame, gameById, GAMES, MAX_PLAYERS } from '../src/games.js';

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

/** Compares only the keys present in `expected` against live fields on `game` (deep, so array fields like scores/banked work too). */
function checkState(name, game, expected) {
  const diffs = [];
  for (const k of Object.keys(expected)) {
    const actual = game[k];
    const want = expected[k];
    if (!deepEqual(actual, want)) diffs.push(`${k}: expected ${JSON.stringify(want)}, got ${JSON.stringify(actual)}`);
  }
  check(name, diffs.length === 0, diffs.join('; '));
}

function section(title) {
  console.log(`\n${title}`);
}

const sum = (vals) => vals.reduce((a, b) => a + b, 0);
const d6 = () => 1 + Math.floor(Math.random() * 6);

const NAME_POOL = ['Amy', 'Bo', 'Cal', 'Di', 'El', 'Fi'];
const namesFor = (n) => NAME_POOL.slice(0, n);

// ============================================================== registry

section('registry');
{
  checkDeepEqual('GAMES ids are exactly [pig, bank, chicago], in order', GAMES.map((g) => g.id), ['pig', 'bank', 'chicago']);
  checkEqual('MAX_PLAYERS is 6', MAX_PLAYERS, 6);
  for (const g of GAMES) {
    checkEqual(`${g.id}: players field advertises 1–6`, g.players, '1–6');
  }
  checkDeepEqual("createGame('pig').loadout is 1d6", createGame('pig').loadout, { d6: 1 });
  checkDeepEqual("createGame('bank').loadout is 2d6", createGame('bank').loadout, { d6: 2 });
  checkDeepEqual("createGame('chicago').loadout is 2d6", createGame('chicago').loadout, { d6: 2 });
  checkEqual("createGame('pig').turnModel", createGame('pig').turnModel, 'rotating');
  checkEqual("createGame('chicago').turnModel", createGame('chicago').turnModel, 'rotating');
  checkEqual("createGame('bank').turnModel", createGame('bank').turnModel, 'communal');

  let threw = false, msg = '';
  try { createGame('nope'); } catch (e) { threw = true; msg = e.message; }
  check("createGame('nope') throws 'unknown game'", threw && /unknown game/.test(msg), msg);

  checkEqual("gameById('bank').name", gameById('bank').name, 'Bank It');
  checkEqual("gameById('nope') is null", gameById('nope'), null);

  // No names given -> a single default player named 'You'.
  checkDeepEqual("createGame('pig') with no names -> ['You']", createGame('pig').names, ['You']);
  // Empty array is treated the same as no names.
  checkDeepEqual("createGame('pig', []) -> falls back to ['You']", createGame('pig', []).names, ['You']);
  // Names are trimmed; blank/whitespace-only names become 'Player N' using
  // the ORIGINAL 1-indexed position (String(42)='42', String(null??'')='').
  checkDeepEqual(
    "createGame('pig', ['Lee', 42, null, '   ']) trims/defaults per-slot",
    createGame('pig', ['Lee', 42, null, '   ']).names,
    ['Lee', '42', 'Player 3', 'Player 4'],
  );
  // More than MAX_PLAYERS names is sliced to the first 6.
  checkDeepEqual(
    'createGame(pig, 9 names) is sliced to the first 6',
    createGame('pig', Array.from({ length: 9 }, (_, i) => `P${i}`)).names,
    ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'],
  );
}

// ==================================================================== pig
//
// Rules: 1d6, rotating. Roll to build turnTotal; a 1 wipes turnTotal and
// passes the turn; hold banks turnTotal into the active player's score and
// passes the turn; round increments only when the turn wraps back to player
// 0; a score >= 100 ends the game IMMEDIATELY (no bonus turn for anyone
// still waiting in that round).

section('pig: 3-player rotation — bust passes, hold passes, round wraps only at player 0');
{
  const g = createGame('pig', ['Amy', 'Bo', 'Cal']);
  checkState('fresh 3p game', g, { scores: [0, 0, 0], turnTotal: 0, current: 0, round: 1, over: false });

  // Turn 1 (Amy, current=0): 3+4=7, hold. 7<100 -> pass. current (0+1)%3=1,
  // not a wrap (1!==0) -> round stays 1.
  g.onRoll([3]); g.onRoll([4]);
  checkState('Amy: 3+4 -> turnTotal 7', g, { turnTotal: 7 });
  g.act('hold', 0);
  checkState('Amy holds 7 -> scores [7,0,0], turn passes to Bo, round stays 1 (no wrap)', g, { scores: [7, 0, 0], turnTotal: 0, current: 1, round: 1 });

  // Turn 2 (Bo, current=1): rolls a 1 -> bust, turnTotal stays 0, turn
  // passes. current (1+1)%3=2, not a wrap -> round stays 1.
  g.onRoll([1]);
  checkState('Bo busts on a 1 -> scores unchanged, turn passes to Cal, round stays 1', g, { scores: [7, 0, 0], turnTotal: 0, current: 2, round: 1 });

  // Turn 3 (Cal, current=2): rolls 5, holds. current (2+1)%3=0 -> WRAP ->
  // round becomes 2.
  g.onRoll([5]);
  g.act('hold', 2);
  checkState('Cal holds 5 -> scores [7,0,5], turn wraps to Amy -> round becomes 2', g, { scores: [7, 0, 5], turnTotal: 0, current: 0, round: 2 });

  // Turn 4 (Amy): 6+6+6=18, then a 1 busts it. Scores untouched. current
  // (0+1)%3=1, not a wrap -> round stays 2.
  g.onRoll([6]); g.onRoll([6]); g.onRoll([6]);
  checkState('Amy: 6+6+6 -> turnTotal 18', g, { turnTotal: 18 });
  g.onRoll([1]);
  checkState('Amy busts mid-turn -> scores still [7,0,5], turn passes to Bo, round stays 2', g, { scores: [7, 0, 5], turnTotal: 0, current: 1, round: 2 });

  // Turn 5 (Bo): ten rolls of 6 -> turnTotal 60, hold -> scores[1]=60.
  // 60<100 -> pass. current (1+1)%3=2, not a wrap -> round stays 2.
  for (let i = 0; i < 10; i++) g.onRoll([6]);
  checkState('Bo: ten 6s -> turnTotal 60', g, { turnTotal: 60 });
  g.act('hold', 1);
  checkState('Bo holds 60 -> scores [7,60,5], turn passes to Cal, round stays 2', g, { scores: [7, 60, 5], turnTotal: 0, current: 2, round: 2 });

  // Turn 6 (Cal): rolls 2, holds -> scores[2] = 5+2=7. current (2+1)%3=0 ->
  // WRAP -> round becomes 3.
  g.onRoll([2]);
  g.act('hold', 2);
  checkState('Cal holds 2 -> scores [7,60,7], turn wraps to Amy -> round becomes 3', g, { scores: [7, 60, 7], turnTotal: 0, current: 0, round: 3 });

  // Turn 7 (Amy): rolls 3, holds -> scores[0]=7+3=10. Pass, no wrap
  // (current 0->1), round stays 3.
  g.onRoll([3]);
  g.act('hold', 0);
  checkState('Amy holds 3 -> scores [10,60,7], round stays 3', g, { scores: [10, 60, 7], current: 1, round: 3 });

  // Turn 8 (Bo, score 60): seven rolls of 6 -> turnTotal 42. Hold ->
  // scores[1] = 60+42 = 102 >= 100 -> GAME OVER instantly. No pass, so
  // `current` and `round` stay exactly where they were (1 and 3) — proving
  // Cal (who was next in line this round) never gets a bonus turn.
  for (let i = 0; i < 7; i++) g.onRoll([6]);
  checkState('Bo: seven 6s -> turnTotal 42', g, { turnTotal: 42 });
  g.act('hold', 1);
  checkState('Bo holds 42 -> scores [10,102,7], OVER, current/round frozen (no bonus turn for Cal)', g, { scores: [10, 102, 7], turnTotal: 0, over: true, current: 1, round: 3 });
  check('game ends the instant a player crosses 100 — canRoll() is now false', g.canRoll() === false);
  check("Cal's score is untouched — the round never wrapped back to her", g.scores[2] === 7);
  check("players()[2] (Cal) is not active — she never got that turn", g.players()[2].active === false);

  checkDeepEqual('players() reflects final state', g.players(), [
    { index: 0, name: 'Amy', score: 10, active: false, out: false, note: '' },
    { index: 1, name: 'Bo', score: 102, active: false, out: false, note: '' },
    { index: 2, name: 'Cal', score: 7, active: false, out: false, note: '' },
  ]);
  checkDeepEqual('status() on game-over', g.status(), { headline: 'Complete', detail: 'Bo reaches 102.', sub: 'final' });
  checkDeepEqual('result() ranks Bo first, unique winner', g.result(), {
    title: 'Bo wins with 102',
    detail: 'Race to 100.',
    standings: [
      { name: 'Bo', score: 102, rank: 1 },
      { name: 'Amy', score: 10, rank: 2 },
      { name: 'Cal', score: 7, rank: 3 },
    ],
  });

  // onRoll()/act() after isOver() must be complete no-ops.
  g.onRoll([6]);
  checkState('onRoll() after isOver() is a no-op', g, { scores: [10, 102, 7], turnTotal: 0, over: true });
  g.act('hold', 1);
  checkState('act(hold) after isOver() is a no-op, even for the winner', g, { scores: [10, 102, 7], over: true });
}

section('pig: a tie for first place is structurally impossible');
{
  // The game ends the INSTANT a hold crosses 100, so at most one player can
  // ever be at/above TARGET when over() becomes true — there is no way for
  // a second player to also reach 100 in the same frozen instant. Confirm
  // via the result() of the sequence above (already asserted exactly), plus
  // a second, different sequence for extra confidence.
  const g = createGame('pig', ['Amy', 'Bo']);
  g.onRoll([6]); g.onRoll([6]); g.onRoll([6]); g.onRoll([6]); g.onRoll([6]); g.onRoll([6]); g.onRoll([6]); g.onRoll([6]); g.onRoll([6]); g.onRoll([6]);
  g.onRoll([6]); g.onRoll([6]); g.onRoll([6]); g.onRoll([6]); g.onRoll([6]); g.onRoll([6]); g.onRoll([6]); // 17 sixes -> turnTotal 102
  checkState('Amy: seventeen 6s -> turnTotal 102', g, { turnTotal: 102 });
  g.act('hold', 0);
  checkEqual('exactly one player (Amy) is at/above TARGET at game end', g.scores.filter((s) => s >= g.TARGET).length, 1);
  checkEqual('Bo (never took a turn) is still at 0', g.scores[1], 0);
}

section('pig: boundaries — wrong/out-of-range index is a no-op, playerActions()/act() agree');
{
  const g = createGame('pig', ['Amy', 'Bo', 'Cal']);
  g.onRoll([5]); // Amy (current=0): turnTotal=5
  checkDeepEqual('playerActions(1) (not her turn) is empty', g.playerActions(1), []);
  checkDeepEqual('playerActions(99) (out of range) is empty', g.playerActions(99), []);
  checkDeepEqual("playerActions(0) offers an enabled 'hold'", g.playerActions(0), [{ id: 'hold', label: 'Hold 5', primary: true, disabled: false }]);

  g.act('hold', 1);  // wrong player
  g.act('hold', 99); // out of range
  g.act('hold', -1); // negative
  g.act('roll', 0);  // wrong action id, right player
  checkState('none of those touched state — turnTotal still 5, nobody scored', g, { turnTotal: 5, scores: [0, 0, 0], current: 0 });

  const before = { score: g.scores[0], turnTotal: g.turnTotal };
  g.act('hold', 0); // the one legitimate call
  check('the enabled action, correctly addressed, is never ignored', g.scores[0] === before.score + before.turnTotal && g.turnTotal === 0);

  // Pig's act() defaults an omitted index to the current player — there is
  // only ever ONE legal actor in a rotating turn, so this is unambiguous
  // (and main.js's current call site, `game.act(id)` with no index at all,
  // depends on exactly this). Confirm the default explicitly so it stays
  // intentional, not accidental.
  const g2 = createGame('pig', ['Amy', 'Bo']);
  g2.onRoll([4]);
  const before2 = { score: g2.scores[0], turnTotal: g2.turnTotal };
  g2.act('hold'); // no index at all
  check('act(id) with the index omitted acts for the current player (documented convenience, not a "wrong index" case)', g2.scores[0] === before2.score + before2.turnTotal && g2.turnTotal === 0);
}

section('pig: reset() restores a genuinely fresh game');
{
  for (const n of [1, 2, 3, 6]) {
    const fresh = createGame('pig', namesFor(n));
    const played = createGame('pig', namesFor(n));
    played.onRoll([4]); played.onRoll([5]); played.act('hold', 0); played.onRoll([1]);
    played.reset();
    checkDeepEqual(`pig ${n}p: reset() after play matches a brand-new game field-for-field`, played, fresh);
  }
}

section('pig: 6-player rotation — round wraps only after the 6th player (formula-derived)');
{
  // Every player rolls a harmless 2 and holds immediately (2 < 100, so the
  // game never ends here). After player k's hold, current = (k+1) % 6 and
  // round increments (1 -> 2) ONLY when k is the last index (5) — i.e. only
  // once all 6 players have taken exactly one turn.
  const g = createGame('pig', namesFor(6));
  for (let k = 0; k < 6; k++) {
    g.onRoll([2]);
    g.act('hold', k);
    checkEqual(`6p: after player ${k} holds, current is ${(k + 1) % 6}`, g.current, (k + 1) % 6);
    checkEqual(`6p: after player ${k} holds, round is ${k === 5 ? 2 : 1}`, g.round, k === 5 ? 2 : 1);
  }
  checkDeepEqual('6p: every player banked exactly 2', g.scores, [2, 2, 2, 2, 2, 2]);
}

section('pig: single player reproduces the classic solo game exactly');
{
  const g = createGame('pig'); // default name 'You'
  checkState('fresh solo game', g, { scores: [0], turnTotal: 0, current: 0, round: 1, over: false });

  // A single player's "current" is always 0, so _pass() wraps EVERY turn —
  // round therefore increments on every single turn, exactly like the old
  // solo suite's `turns` counter did.
  g.onRoll([1]); // bust on the very first roll
  checkState('bust on turn 1 -> round 2 (every solo turn wraps)', g, { scores: [0], turnTotal: 0, round: 2 });
  g.act('hold', 0); // nothing to hold (turnTotal 0) -> no-op
  checkState('hold at turnTotal 0 is a no-op', g, { scores: [0], turnTotal: 0, round: 2 });

  g.onRoll([4]); g.onRoll([5]); // turnTotal 9
  g.act('hold', 0); // scores [9], round 3
  checkState('hold banks 9', g, { scores: [9], round: 3 });

  g.onRoll([6]); g.onRoll([1]); // 6 then bust
  checkState('bust after a partial turn leaves score untouched', g, { scores: [9], turnTotal: 0, round: 4 });

  for (let i = 0; i < 10; i++) g.onRoll([6]); // turnTotal 60
  g.act('hold', 0); // scores [69], round 5
  checkState('hold banks 60 -> 69', g, { scores: [69], round: 5 });

  for (const v of [6, 6, 6, 6, 5, 2]) g.onRoll([v]); // turnTotal 31
  checkState('6+6+6+6+5+2 -> turnTotal 31', g, { turnTotal: 31 });
  g.act('hold', 0); // scores 69+31 = 100 exactly -> over. round frozen at 5 (no pass on a win).
  checkState('hold banks 31 -> EXACTLY 100, game over, round stays 5', g, { scores: [100], turnTotal: 0, over: true, round: 5 });
  checkDeepEqual('solo status()', g.status(), { headline: 'Complete', detail: 'You reaches 100.', sub: 'final' });
  checkDeepEqual('solo result() — unified format, "N points" (no per-turn count like the old solo-only suite)', g.result(), {
    title: '100 points',
    detail: 'Race to 100.',
    standings: [{ name: 'You', score: 100, rank: 1 }],
  });
}

// ================================================================ chicago
//
// Rules: 2d6, rotating. Eleven fixed targets 2..12. EVERY player rolls once
// at the current target before it advances; a hit (total === target) scores
// the target's value. Game ends after the LAST player's roll at target 12.

section('chicago: 3-player — target advances only after all 3 have rolled it (33 rolls, exactly)');
{
  // hitPair(t) always sums to exactly t (self-evident: t<=7 -> 1+(t-1)=t;
  // t>7 -> (t-6)+6=t). Sanity-check that claim before relying on it below.
  function hitPair(t) { return t <= 7 ? [1, t - 1] : [t - 6, 6]; }
  for (let t = 2; t <= 12; t++) checkEqual(`meta: hitPair(${t}) sums to ${t}`, sum(hitPair(t)), t);

  // Amy always hits (rolls exactly the target) -> her score is the sum of
  // every target 2..12 = 77 (arithmetic series (2+12)*11/2).
  // Bo's roll always totals missTotal(t) = t===2 ? 3 : t-1, which by
  // construction never equals t -> Bo always misses -> score 0.
  // Cal hits ONLY odd targets: calTotal(t) = t if odd, else (t===2 ? 3 :
  // t-2) — both branches are guaranteed != t, so Cal misses every even
  // target and hits every odd one -> score 3+5+7+9+11 = 35.
  const missTotal = (t) => (t === 2 ? 3 : t - 1);
  const calTotal = (t) => (t % 2 === 1 ? t : (t === 2 ? 3 : t - 2));
  for (let t = 2; t <= 12; t++) {
    check(`meta: missTotal(${t}) != ${t}`, missTotal(t) !== t);
    check(`meta: calTotal(${t}) matches parity rule and != ${t} when even`, t % 2 === 1 ? calTotal(t) === t : calTotal(t) !== t);
  }

  const g = createGame('chicago', ['Amy', 'Bo', 'Cal']);
  checkState('fresh 3p game', g, { scores: [0, 0, 0], current: 0, target: 2, over: false });

  let rolls = 0;
  let expected = [0, 0, 0];
  for (let t = 2; t <= 12; t++) {
    checkEqual(`target is ${t} before this triplet of rolls`, g.target, t);

    g.onRoll(hitPair(t)); rolls++; // Amy, always a hit
    expected[0] += t;
    checkEqual(`after Amy's roll (1 of 3 at target ${t}), target has NOT advanced yet`, g.target, t);

    g.onRoll(hitPair(missTotal(t))); rolls++; // Bo, always a miss
    checkEqual(`after Bo's roll (2 of 3 at target ${t}), target has STILL not advanced`, g.target, t);

    const calHits = t % 2 === 1;
    g.onRoll(hitPair(calTotal(t))); rolls++; // Cal, odd targets only
    if (calHits) expected[2] += t;

    if (t < 12) {
      checkEqual(`after all 3 have rolled at target ${t}, it advances to ${t + 1}`, g.target, t + 1);
      checkEqual(`over() is still false mid-sequence (target ${t})`, g.over, false);
    }
    checkDeepEqual(`scores after target ${t}`, g.scores, expected);
  }
  checkEqual('exactly 33 rolls played for 3 players x 11 targets', rolls, 33);
  checkState('game ends exactly after the LAST player\'s roll at target 12 (not before)', g, { over: true, target: 12, scores: [77, 0, 35] });

  checkDeepEqual('players() reflects final scores', g.players(), [
    { index: 0, name: 'Amy', score: 77, active: false, out: false, note: '' },
    { index: 1, name: 'Bo', score: 0, active: false, out: false, note: '' },
    { index: 2, name: 'Cal', score: 35, active: false, out: false, note: '' },
  ]);
  checkDeepEqual('result() ranks Amy 1st, Cal 2nd, Bo 3rd', g.result(), {
    title: 'Amy wins with 77',
    detail: 'Eleven targets.',
    standings: [
      { name: 'Amy', score: 77, rank: 1 },
      { name: 'Cal', score: 35, rank: 2 },
      { name: 'Bo', score: 0, rank: 3 },
    ],
  });

  // A 34th roll must be rejected outright.
  g.onRoll([6, 6]); // would hit the stuck target 12 again, pre-guard
  checkState('onRoll() after isOver() is a no-op, even one that "would hit"', g, { scores: [77, 0, 35], target: 12, over: true });
}

section('chicago: a 2-way tie for first is possible and rank()/winnerLine() report it correctly');
{
  function hitPair(t) { return t <= 7 ? [1, t - 1] : [t - 6, 6]; }
  const g = createGame('chicago', ['Amy', 'Bo']);
  for (let t = 2; t <= 12; t++) { g.onRoll(hitPair(t)); g.onRoll(hitPair(t)); } // both always hit -> both 77
  checkState('both players hit every target -> tied at 77', g, { scores: [77, 77], over: true });
  checkDeepEqual('result() reports a tie for first, both rank 1', g.result(), {
    title: 'Amy and Bo tie on 77',
    detail: 'Eleven targets.',
    standings: [
      { name: 'Amy', score: 77, rank: 1 },
      { name: 'Bo', score: 77, rank: 1 },
    ],
  });
}

section('chicago: every target missed — zero-score edge case');
{
  const g = createGame('chicago', ['Amy']);
  g.onRoll([1, 2]); // target 2, total 3 -> miss
  for (let t = 3; t <= 12; t++) g.onRoll([1, 1]); // total 2, never equals t -> miss
  checkState('all 11 targets missed -> score stays 0', g, { scores: [0], over: true, target: 12 });
  check('score never negative', g.scores[0] >= 0);
  checkDeepEqual('solo result() with a zero score', g.result(), {
    title: '0 points',
    detail: 'Eleven targets.',
    standings: [{ name: 'Amy', score: 0, rank: 1 }],
  });
}

section('chicago: boundaries — no player ever has an action, act() never throws or scores');
{
  const g = createGame('chicago', ['Amy', 'Bo']);
  checkDeepEqual('playerActions() (no args) is empty', g.playerActions(), []);
  checkDeepEqual('playerActions(0) is empty', g.playerActions(0), []);
  checkDeepEqual('playerActions(99) is empty', g.playerActions(99), []);
  const before = g.scores.slice();
  g.act('anything', 0);
  g.act();
  check('act() never throws and never changes scores', deepEqual(g.scores, before));
}

section('chicago: 6-player roll count (formula: 11 x players)');
{
  const g = createGame('chicago', namesFor(6));
  let rolls = 0;
  while (!g.isOver()) { g.onRoll([d6(), d6()]); rolls++; if (rolls > 100) break; }
  checkEqual('6p: exactly 66 rolls (11 targets x 6 players)', rolls, 66);
  check('6p: standings has all 6 players', g.result().standings.length === 6);
}

section('chicago: single player reproduces the classic solo game exactly');
{
  const g = createGame('chicago'); // default name 'You'
  // Same hand-picked hit/miss table as the pre-rewrite solo suite: hits at
  // targets 2,3,5,7,8,10,11,12 (score 2+3+5+7+8+10+11+12=58), misses at
  // 4,6,9.
  const steps = [
    { dice: [1, 1], target: 2, hit: true },
    { dice: [1, 2], target: 3, hit: true },
    { dice: [1, 1], target: 4, hit: false },
    { dice: [2, 3], target: 5, hit: true },
    { dice: [1, 2], target: 6, hit: false },
    { dice: [3, 4], target: 7, hit: true },
    { dice: [4, 4], target: 8, hit: true },
    { dice: [3, 5], target: 9, hit: false },
    { dice: [5, 5], target: 10, hit: true },
    { dice: [5, 6], target: 11, hit: true },
    { dice: [6, 6], target: 12, hit: true },
  ];
  let expected = 0;
  for (const s of steps) {
    g.onRoll(s.dice);
    if (s.hit) expected += s.target;
  }
  checkEqual('solo score is the sum of hit targets (58)', g.scores[0], 58);
  checkState('solo game over after 11 rolls, target stuck at 12', g, { over: true, target: 12, scores: [58] });
  checkDeepEqual('solo status()', g.status(), { headline: 'Complete', detail: 'Eleven targets, all done.', sub: 'final' });
  checkDeepEqual('solo result() — unified format', g.result(), {
    title: '58 points',
    detail: 'Eleven targets.',
    standings: [{ name: 'You', score: 58, rank: 1 }],
  });
}

// ================================================================ bank it
//
// Rules: 2d6, communal, 10 rounds. Rolls 1-3 of a round: total 7 pays 70,
// anything else adds its total. Roll 4+: 7 wipes the pot and ends the round
// for everyone still in; doubles double the pot; anything else adds its
// total. act('bank', i) gives player i the pot AS IT STANDS and sits them
// out for the rest of the round — the pot is NOT reduced and carries on for
// whoever is still in. The round ends when a 7 lands post-safe-zone or when
// everyone has banked; after round 10 ends, the game is over. The roller
// rotates among players still in; a banked player never rolls.

section('bank it: 3-player narrative — roller skip, same-pot double-bank, bust costs only those still in');
{
  const g = createGame('bank', ['Amy', 'Bo', 'Cal']);
  checkState('fresh 3p game', g, { scores: [0, 0, 0], banked: [false, false, false], round: 1, pot: 0, rolls: 0, roller: 0, over: false });

  // --- round 1: safe rolls 1-3, then two players bank the SAME pot value ---
  g.onRoll([3, 4]); // roll1=7, safe -> pays 70. pot 70. roller 0->1.
  checkState('roll1: seven in the safe zone pays 70', g, { pot: 70, rolls: 1, roller: 1 });
  g.onRoll([2, 3]); // roll2=5, safe -> +5. pot 75. roller 1->2.
  checkState('roll2: +5 -> pot 75', g, { pot: 75, rolls: 2, roller: 2 });
  g.onRoll([6, 6]); // roll3=12, double but STILL safe (boundary) -> just adds, no doubling. pot 87. roller 2->0.
  checkState('roll3 (boundary): double in the safe zone just adds, no doubling', g, { pot: 87, rolls: 3, roller: 0 });

  // Bo (not the roller) banks first.
  g.act('bank', 1);
  checkState('Bo (not the roller) banks 87 -> pot untouched, roller unchanged (still Amy)', g, { scores: [0, 87, 0], banked: [false, true, false], pot: 87, roller: 0 });

  // Amy (who IS the roller) banks next, at the SAME pot value — proves both
  // "the pot is not reduced by a bank" and "two players banking the same
  // pot both get the full amount".
  g.act('bank', 0);
  checkState('Amy (the roller) banks the SAME 87 -> both get the full pot; roller skips banked Bo, lands on Cal', g, { scores: [87, 87, 0], banked: [true, true, false], pot: 87, roller: 2 });
  check('pot is genuinely unchanged by either bank', g.pot === 87);

  // Only Cal is left in. Roll 4 (not safe): a double that isn't 7 -> doubles the pot.
  g.onRoll([2, 2]); // total 4, rolls=4 (not safe), double -> pot 87*2=174.
  checkState('roll4 (not safe): double doubles the pot to 174', g, { pot: 174, rolls: 4, over: false });
  check('roller loops back to Cal — she is the only one still in', g.roller === 2);

  // Cal is the LAST player still in — banking her should end the round and
  // reset cleanly, rotating the next round's opener.
  g.act('bank', 2);
  checkState("Cal banks 174 (the LAST player in) -> round ends, resets, round 2 opens with Bo (not Amy)", g, {
    scores: [87, 87, 174], banked: [false, false, false], pot: 0, rolls: 0, round: 2, roller: 1, over: false,
  });

  // --- round 2: three safe rolls, one out-of-turn bank, then a bust that
  // must cost only the players still in (Cal already banked and is safe) ---
  g.onRoll([1, 6]); // roll1=7 safe -> pot 70. roller 1->2.
  g.onRoll([2, 2]); // roll2=4, double but safe -> just adds. pot 74. roller 2->0.
  g.onRoll([5, 5]); // roll3=10, double but safe (boundary) -> just adds. pot 84. roller 0->1.
  checkState('round2 roll1-3 -> pot 84', g, { pot: 84, rolls: 3, roller: 1 });

  g.act('bank', 2); // Cal banks 84 out of turn (roller is Bo, not her).
  checkState('Cal banks 84 -> scores[2] 174+84=258, roller untouched (still Bo)', g, { scores: [87, 87, 258], banked: [false, false, true], roller: 1 });

  g.onRoll([4, 3]); // roll4=7, rolls=4 (not safe) -> BUST. Amy and Bo still in (2 players) -> the "everyone still in" message.
  checkState('a 7 on roll 4 busts — Amy and Bo (still in) get nothing; Cal keeps her banked 258 either way', g, {
    scores: [87, 87, 258], banked: [false, false, false], pot: 0, round: 3, over: false,
  });
  checkEqual('roller for round 3 opens with Cal (rotation continues)', g.roller, 2);
}

function reach3pRound10() {
  // Replays the round1-round2 sequence above (Amy/Bo/Cal end round 2 at
  // scores [87, 87, 258], round 3, roller 2) and then fills rounds 3-9 with
  // a simple repeating pattern: one safe roll of 7 (pot 70), then everyone
  // banks in turn. Since the pot is never reduced by a bank, EVERY one of
  // the 3 players gets the full 70 each of those 7 rounds (rounds 3..9),
  // regardless of who the nominal roller is (onRoll/act don't care who
  // "physically" rolled). +490 each (7 x 70) ->
  //   Amy/Bo: 87 + 490 = 577
  //   Cal:    258 + 490 = 748
  const g = createGame('bank', ['Amy', 'Bo', 'Cal']);
  g.onRoll([3, 4]); g.onRoll([2, 3]); g.onRoll([6, 6]);
  g.act('bank', 1); g.act('bank', 0);
  g.onRoll([2, 2]);
  g.act('bank', 2);
  g.onRoll([1, 6]); g.onRoll([2, 2]); g.onRoll([5, 5]);
  g.act('bank', 2);
  g.onRoll([4, 3]); // bust ends round 2 -> round 3, scores [87, 87, 258]
  for (let r = 0; r < 7; r++) {
    g.onRoll([3, 4]); // total 7, roll1 of the round (safe) -> pot 70
    g.act('bank', 0); g.act('bank', 1); g.act('bank', 2); // all three take the same 70; last bank ends the round
  }
  return g;
}

section('bank it: round 10 — shared setup sanity check');
{
  const g = reach3pRound10();
  checkState('reaches round 10 with scores [577, 577, 748] (hand-derived, see reach3pRound10 comment)', g, {
    scores: [577, 577, 748], round: 10, pot: 0, rolls: 0, banked: [false, false, false], over: false,
  });
}

section('bank it: round 10 — a bust still ends the GAME (not just the round)');
{
  const g = reach3pRound10();
  g.onRoll([1, 1]); // roll1=2, safe -> pot 2
  g.onRoll([1, 1]); // roll2=2, safe -> pot 4
  g.onRoll([1, 1]); // roll3=2, safe (boundary) -> pot 6
  checkState('final round roll1-3 -> pot 6', g, { pot: 6, rolls: 3, over: false });
  g.onRoll([3, 4]); // roll4=7 -> BUST, and round(10) >= ROUNDS(10)
  checkState('bust on round 10 ends the GAME; scores untouched (nobody had banked this round)', g, {
    scores: [577, 577, 748], pot: 0, round: 10, over: true,
  });
  // The bust message ("Seven. Everyone still in loses the pot.") is
  // overwritten by _endRound's final-round message — confirm the ACTUAL
  // final text, not the intermediate one.
  checkDeepEqual('status() on a busted final round', g.status(), { headline: 'Complete', detail: 'The last round ends with the pot lost.', sub: 'final' });
  checkDeepEqual('result() — a 2-way tie for first (Amy/Bo at 577), Cal alone at 748 wins', g.result(), {
    title: 'Cal wins with 748',
    detail: '10 rounds of nerve.',
    standings: [
      { name: 'Cal', score: 748, rank: 1 },
      { name: 'Amy', score: 577, rank: 2 },
      { name: 'Bo', score: 577, rank: 2 },
    ],
  });

  g.onRoll([3, 4]); // would pay 70 to the pot pre-guard
  checkState('onRoll() after isOver() is a no-op', g, { pot: 0, rolls: 0, over: true });
  g.act('bank', 0);
  checkState('act(bank) after isOver() is a no-op', g, { scores: [577, 577, 748], over: true });
}

section('bank it: round 10 — banking still ends the GAME, and a double-bank never pays twice');
{
  const g = reach3pRound10();
  g.onRoll([3, 4]); // roll1=7, safe -> pot 70
  g.act('bank', 0); // Amy banks 70 -> 647; round continues (Bo, Cal still in)
  checkState('Amy banks on round 10 -> 647, game NOT yet over (2 still in)', g, { scores: [647, 577, 748], banked: [true, false, false], over: false });
  checkDeepEqual("Amy is locked out — playerActions(0) is now empty", g.playerActions(0), []);

  g.act('bank', 0); // duplicate bank attempt for the same player, same pot
  checkState('banking Amy again is a no-op — must not pay twice', g, { scores: [647, 577, 748], round: 10 });

  g.act('bank', 1); // Bo banks the SAME pot (unchanged) -> 647; 1 left (Cal)
  checkState('Bo banks the same 70 -> 647', g, { scores: [647, 647, 748], banked: [true, true, false], over: false });

  g.act('bank', 2); // Cal, the last one in, banks -> round ends -> round(10)>=ROUNDS -> GAME OVER
  checkState('Cal (last in) banks -> 818, round 10 complete -> GAME OVER', g, { scores: [647, 647, 818], round: 10, pot: 0, over: true });
  checkDeepEqual('status() on a banked-out final round', g.status(), { headline: 'Complete', detail: 'That was the last round.', sub: 'final' });
  checkDeepEqual('result() — Cal wins outright', g.result(), {
    title: 'Cal wins with 818',
    detail: '10 rounds of nerve.',
    standings: [
      { name: 'Cal', score: 818, rank: 1 },
      { name: 'Amy', score: 647, rank: 2 },
      { name: 'Bo', score: 647, rank: 2 },
    ],
  });
}

section('bank it: act()/playerActions() boundaries (proves the playerActions() range-check fix)');
{
  const g = createGame('bank', ['Amy', 'Bo', 'Cal']);
  g.onRoll([3, 4]); // pot 70, safe
  const before = { scores: g.scores.slice(), banked: g.banked.slice(), pot: g.pot, roller: g.roller };

  // BUG FOUND (now fixed): playerActions(99) used to return an ENABLED
  // 'bank' action for a nonexistent player because it never range-checked
  // `i`, even though act('bank', 99) already correctly refused it. That
  // directly violated "playerActions() must never offer an enabled button
  // that act() ignores." Fixed in src/games.js by adding the same
  // i==null||i<0||i>=count guard act() already had.
  checkDeepEqual('playerActions(99) is empty (fix)', g.playerActions(99), []);
  checkDeepEqual('playerActions(-1) is empty (fix)', g.playerActions(-1), []);
  checkDeepEqual('playerActions(null) is empty (fix)', g.playerActions(null), []);
  checkDeepEqual('playerActions(undefined) is empty (fix)', g.playerActions(undefined), []);

  g.act('bank', 99);       // out of range
  g.act('bank', -1);       // negative
  g.act('bank', null);     // absent
  g.act('bank', undefined);
  g.act('roll', 0);        // wrong action id, otherwise-valid player
  checkState('none of the bad calls above touched pot/round', g, { pot: before.pot, roller: before.roller });
  check('scores untouched by bad act() calls', deepEqual(g.scores, before.scores));
  check('banked flags untouched by bad act() calls', deepEqual(g.banked, before.banked));

  // Bank It's act() requires an EXPLICIT index (unlike Pig's rotating
  // act(), there is no single "current" actor — any non-banked player may
  // bank at any time, which is the whole point of the communal model) — an
  // omitted index is correctly a no-op, not a default-to-someone call.
  g.act('bank'); // no index supplied at all
  checkState("act('bank') with NO index is a no-op (communal model has no single implicit actor)", g, { scores: before.scores, banked: before.banked, pot: before.pot });

  // Confirm the guards above are not just globally broken — a genuinely
  // valid call still works.
  g.act('bank', 0);
  check('a genuinely valid bank call still works after all those no-ops', g.scores[0] === before.scores[0] + before.pot);
}

section('bank it: reset() restores a genuinely fresh game');
{
  for (const n of [1, 2, 3, 6]) {
    const fresh = createGame('bank', namesFor(n));
    const played = createGame('bank', namesFor(n));
    played.onRoll([3, 4]); played.onRoll([2, 2]); played.act('bank', 0); played.onRoll([1, 6]);
    played.reset();
    checkDeepEqual(`bank ${n}p: reset() after play matches a brand-new game field-for-field`, played, fresh);
  }
}

section('bank it: doubles on roll 4+ never coincide with a bust-seven (dice math)');
{
  // Doubles sum to an even number (2,4,6,8,10,12); 7 is odd, so a double can
  // never also total 7 — confirm the isDouble branch (which only runs once
  // total!==7 has already been checked) is exercised for every possible
  // double, never the bust branch.
  checkEqual('math: no d6 double sums to 7', [1, 2, 3, 4, 5, 6].some((i) => 2 * i === 7), false);
  for (let i = 1; i <= 6; i++) {
    const g = createGame('bank', ['Amy']);
    g.onRoll([2, 3]); g.onRoll([2, 3]); g.onRoll([2, 3]); // three safe 5s -> pot 15
    checkState(`D${i}.0: three safe rolls of 5 -> pot 15`, g, { pot: 15, rolls: 3 });
    g.onRoll([i, i]); // roll 4: double (i,i), sum 2i (never 7) -> doubles the pot
    checkState(`D${i}: double (${i},${i}) at roll 4 doubles the pot, never busts`, g, { pot: 30, rolls: 4, round: 1, over: false });
  }
}

section('bank it: single player reproduces the classic solo game exactly');
{
  const g = createGame('bank'); // default name 'You'
  checkState('fresh solo game', g, { scores: [0], round: 1, pot: 0, rolls: 0, over: false });

  // Round 1 — identical dice/arithmetic to the pre-rewrite solo suite.
  g.onRoll([3, 4]); // roll1=7 safe -> pot 70
  g.onRoll([2, 2]); // roll2=4, double but safe -> just adds -> pot 74
  g.onRoll([6, 6]); // roll3=12, double, safe boundary -> just adds -> pot 86
  g.onRoll([3, 3]); // roll4=6, double, NOT safe -> doubles -> pot 172
  g.onRoll([5, 1]); // roll5=6, not safe, not double -> +6 -> pot 178
  g.act('bank', 0); // scores [178], round 1<10 -> round 2
  checkState('round1: hand-computed pot walk -> bank 178', g, { scores: [178], pot: 0, round: 2 });

  // Round 2 — three safe sevens, then a seven busts on roll 4.
  g.onRoll([4, 3]); g.onRoll([1, 6]); g.onRoll([2, 5]); // 7,7,7 safe -> pot 70+70+70=210
  checkState('round2: three safe sevens -> pot 210', g, { pot: 210, rolls: 3 });
  g.onRoll([4, 3]); // roll4=7, not safe -> BUST. Solo -> inPlay.length always 1 here -> the "and the pot is gone" message.
  checkState('round2: bust on roll 4 wipes the pot, score untouched', g, { scores: [178], pot: 0, round: 3 });

  // Round 3 — banking a zero pot is a no-op, then a normal bank.
  g.act('bank', 0);
  checkState('bank at pot=0 is a no-op', g, { scores: [178], round: 3, pot: 0 });
  g.onRoll([6, 1]); // roll1=7 safe -> pot 70
  g.act('bank', 0); // scores 178+70=248, round 3->4
  checkState('bank 70 -> 248', g, { scores: [248], round: 4 });

  // Rounds 4-9: one safe seven then bank, +70 each -> 248+420=668, round 10.
  for (let i = 0; i < 6; i++) { g.onRoll([3, 4]); g.act('bank', 0); }
  checkState('rounds 4-9 bank 70 each (+420) -> 668, round 10', g, { scores: [668], round: 10, pot: 0, over: false });

  // Round 10: three safe rolls (70+3+11=84), then a bust — solo, so this
  // ends the GAME, not just the round.
  g.onRoll([3, 4]); g.onRoll([1, 2]); g.onRoll([5, 6]); // 7,3,11 safe -> pot 70+3+11=84
  checkState('final round roll1-3 -> pot 84', g, { pot: 84, rolls: 3, over: false });
  g.onRoll([4, 3]); // roll4=7 -> bust, AND round 10 >= ROUNDS -> GAME OVER
  checkState('bust on round 10 ends the GAME', g, { scores: [668], pot: 0, round: 10, over: true });
  checkDeepEqual('solo status() on a busted final round', g.status(), { headline: 'Complete', detail: 'The last round ends with the pot lost.', sub: 'final' });
  checkDeepEqual('solo result() — unified "N points" format', g.result(), {
    title: '668 points',
    detail: '10 rounds of nerve.',
    standings: [{ name: 'You', score: 668, rank: 1 }],
  });
}

section('bank it: single player — banking (not busting) also ends the game at round 10');
{
  const g = createGame('bank');
  g.onRoll([3, 4]); g.onRoll([2, 2]); g.onRoll([6, 6]); g.onRoll([3, 3]); g.onRoll([5, 1]); g.act('bank', 0);
  g.onRoll([4, 3]); g.onRoll([1, 6]); g.onRoll([2, 5]); g.onRoll([4, 3]);
  g.act('bank', 0);
  g.onRoll([6, 1]); g.act('bank', 0);
  for (let i = 0; i < 6; i++) { g.onRoll([3, 4]); g.act('bank', 0); }
  checkState('reaches round 10 at 668 (same setup as the bust test)', g, { scores: [668], round: 10, pot: 0, over: false });

  g.onRoll([3, 4]); // roll1=7 safe -> pot 70
  g.act('bank', 0); // 668+70=738, and since round 10 -> GAME ends
  checkState('banking on round 10 ends the GAME', g, { scores: [738], pot: 0, round: 10, over: true });
  checkDeepEqual('solo status() on a banked-out final round', g.status(), { headline: 'Complete', detail: 'That was the last round.', sub: 'final' });

  g.onRoll([3, 4]); // would re-arm the pot pre-guard
  checkState('onRoll() after isOver() is a no-op', g, { pot: 0, rolls: 0, scores: [738], over: true });
  g.act('bank', 0);
  checkState('act(bank) after isOver() is a no-op', g, { scores: [738], over: true });
}

// ================================================== player-count sweep
//
// Bullet 5: run all three games at 1, 2, 3 and 6 players. Exact arithmetic
// for solo play is already locked down above; this sweep checks STRUCTURE
// (termination, standings shape, no negative scores) at every count with a
// fixed, non-random, deterministic policy — reusing Math.random here would
// blur "did the rules change" with "did the dice happen to cooperate".

section('player-count sweep: pig at 1, 2, 3, 6 players');
{
  for (const n of [1, 2, 3, 6]) {
    const g = createGame('pig', namesFor(n));
    // Deterministic, bust-free policy: always roll a 4, hold once
    // turnTotal reaches exactly 20 (5 rolls). Every turn is identically
    // 5 rolls + 1 hold, so player 0 is guaranteed to be first to 100 (on
    // their 5th held turn) and the game provably terminates.
    let steps = 0;
    while (!g.isOver() && steps < 5000) {
      const i = g.whoRolls();
      if (g.turnTotal >= 20) g.act('hold', i);
      else g.onRoll([4]);
      steps++;
    }
    check(`pig ${n}p: terminates (policy: roll 4s, hold at turnTotal>=20)`, g.isOver(), `stalled after ${steps} steps`);
    checkEqual(`pig ${n}p: standings has ${n} player(s)`, g.result().standings.length, n);
    check(`pig ${n}p: exactly one player reached TARGET`, g.scores.filter((s) => s >= g.TARGET).length === 1);
    check(`pig ${n}p: no negative scores`, g.scores.every((s) => s >= 0));
  }
}

section('player-count sweep: chicago at 1, 2, 3, 6 players (roll count is exactly 11 x n regardless of dice)');
{
  for (const n of [1, 2, 3, 6]) {
    const g = createGame('chicago', namesFor(n));
    let rolls = 0;
    while (!g.isOver() && rolls < 200) { g.onRoll([d6(), d6()]); rolls++; }
    checkEqual(`chicago ${n}p: exactly ${11 * n} rolls`, rolls, 11 * n);
    checkEqual(`chicago ${n}p: standings has ${n} player(s)`, g.result().standings.length, n);
    check(`chicago ${n}p: every score is between 0 and 77`, g.scores.every((s) => s >= 0 && s <= 77));
  }
}

section('player-count sweep: bank it at 1, 2, 3, 6 players (bank-everyone-immediately -> everyone ends on exactly 700)');
{
  // Deterministic policy: roll one guaranteed-safe seven ([3,4]) at the top
  // of every round, then have every player bank it in order 0..n-1. Since
  // the pot is never reduced by a bank, EVERY player gets the SAME full 70
  // each round, for all 10 rounds -> 700 each, regardless of player count.
  for (const n of [1, 2, 3, 6]) {
    const g = createGame('bank', namesFor(n));
    let roundsPlayed = 0;
    while (!g.isOver() && roundsPlayed < 20) {
      g.onRoll([3, 4]); // roll1 of the round, safe, total 7 -> pot 70
      for (let i = 0; i < n; i++) g.act('bank', i);
      roundsPlayed++;
    }
    checkEqual(`bank ${n}p: took exactly 10 rounds`, roundsPlayed, 10);
    check(`bank ${n}p: game is over`, g.isOver());
    check(`bank ${n}p: every player ends on exactly 700 (70 x 10 rounds, pot never reduced)`, g.scores.every((s) => s === 700));
    checkEqual(`bank ${n}p: standings has ${n} player(s)`, g.result().standings.length, n);
    if (n > 1) {
      checkEqual(`bank ${n}p: an all-equal outcome is an n-way tie for first`, g.result().standings.filter((s) => s.rank === 1).length, n);
    }
  }
}

// ======================================================= randomised soak

const SOAK_N = 3000;
const randCount = () => 1 + Math.floor(Math.random() * 6);

/** Universal invariants checked every step, for every game. Returns players(). */
function invariantsCommon(g, tag, issues) {
  if (g.canRoll() === g.isOver()) issues.push(`${tag}: canRoll()===isOver() (both ${g.canRoll()})`);
  const ps = g.players();
  for (const p of ps) if (p.score < 0) issues.push(`${tag}: ${p.name} has negative score ${p.score}`);
  const activeCount = ps.filter((p) => p.active).length;
  if (!g.isOver() && activeCount !== 1) issues.push(`${tag}: expected exactly 1 active player, got ${activeCount}`);
  if (g.isOver() && activeCount !== 0) issues.push(`${tag}: game over but ${activeCount} players still marked active`);
  if (!g.isOver()) {
    const roller = g.whoRolls();
    const rp = ps[roller];
    if (!rp) issues.push(`${tag}: whoRolls() ${roller} is out of range`);
    else if (rp.out) issues.push(`${tag}: whoRolls() points at an out/banked player (${rp.name})`);
  }
  return ps;
}

section(`randomised soak (${SOAK_N} games each, players 1-6 chosen at random per game)`);

function soakPig(n) {
  const ROLL_CAP = 4000;
  const winners = [];
  const issues = [];
  for (let i = 0; i < n; i++) {
    const count = randCount();
    const g = createGame('pig', namesFor(count));
    let prevScores = g.scores.slice();
    let rolls = 0;
    while (!g.isOver() && rolls < ROLL_CAP) {
      const ps = invariantsCommon(g, `pig#${i}(${count}p)`, issues);
      ps.forEach((p, idx) => { if (p.score < prevScores[idx]) issues.push(`pig#${i}: ${p.name}'s score decreased ${prevScores[idx]}->${p.score}`); });
      prevScores = ps.map((p) => p.score);

      const cur = g.whoRolls();
      const a = g.playerActions(cur).find((x) => x.id === 'hold');
      if (a && (g.turnTotal >= 20 || Math.random() < 0.2)) {
        if (a.disabled) { issues.push(`pig#${i}: hold reported disabled while turnTotal=${g.turnTotal}`); break; }
        const before = { score: g.scores[cur], turnTotal: g.turnTotal };
        g.act('hold', cur);
        if (g.scores[cur] !== before.score + before.turnTotal || g.turnTotal !== 0) issues.push(`pig#${i}: enabled hold ignored/miscalculated`);
      } else {
        g.onRoll([d6()]);
        rolls++;
      }
    }
    if (!g.isOver()) { issues.push(`pig#${i}: hit roll cap (${ROLL_CAP}) at ${count}p without ending`); continue; }
    const atTarget = g.scores.filter((s) => s >= g.TARGET).length;
    if (atTarget !== 1) issues.push(`pig#${i}: expected exactly 1 player at/above TARGET, got ${atTarget}`);
    if (g.result().standings.length !== count) issues.push(`pig#${i}: standings length mismatch`);
    winners.push(Math.max(...g.scores));

    const before = g.scores.slice();
    g.onRoll([d6()]); g.act('hold', 0);
    if (!deepEqual(g.scores, before)) issues.push(`pig#${i}: post-over state changed`);

    if (i % 200 === 0) {
      const fresh = createGame('pig', namesFor(count));
      g.reset();
      if (!deepEqual(g, fresh)) issues.push(`pig#${i}: reset() did not restore a fresh state`);
    }
  }
  check(`pig: ${n} games at 1-6 players — no negative/decreasing scores, exactly 1 active player, roller never out, exactly 1 winner >=TARGET, standings match player count, post-over safe, reset clean, all under ${ROLL_CAP} rolls`, issues.length === 0, issues.slice(0, 5).join(' | '));
  if (winners.length) console.log(`    winning score — min ${Math.min(...winners)}, max ${Math.max(...winners)} (TARGET 100, policy: hold at turnTotal>=20 or 20% chance)`);
}

function soakChicago(n) {
  const finals = [];
  const issues = [];
  for (let i = 0; i < n; i++) {
    const count = randCount();
    const g = createGame('chicago', namesFor(count));
    const EXPECT = 11 * count;
    let prevScores = g.scores.slice();
    let rolls = 0;
    while (!g.isOver() && rolls <= EXPECT + 2) {
      const ps = invariantsCommon(g, `chicago#${i}(${count}p)`, issues);
      ps.forEach((p, idx) => { if (p.score < prevScores[idx]) issues.push(`chicago#${i}: ${p.name}'s score decreased`); });
      prevScores = ps.map((p) => p.score);
      if (g.playerActions(g.whoRolls()).length !== 0) issues.push(`chicago#${i}: playerActions() should always be empty`);
      g.onRoll([d6(), d6()]);
      rolls++;
    }
    if (rolls !== EXPECT) issues.push(`chicago#${i}: took ${rolls} rolls at ${count}p, expected exactly ${EXPECT}`);
    if (!g.isOver()) { issues.push(`chicago#${i}: did not end after ${rolls} rolls`); continue; }
    if (g.result().standings.length !== count) issues.push(`chicago#${i}: standings length mismatch`);
    finals.push(...g.scores);

    const before = g.scores.slice();
    g.onRoll([6, 6]); g.onRoll([6, 6]);
    if (!deepEqual(g.scores, before)) issues.push(`chicago#${i}: post-over state changed`);

    if (i % 200 === 0) {
      const fresh = createGame('chicago', namesFor(count));
      g.reset();
      if (!deepEqual(g, fresh)) issues.push(`chicago#${i}: reset() did not restore a fresh state`);
    }
  }
  check(`chicago: ${n} games at 1-6 players — always exactly 11xplayers rolls, no negative/decreasing scores, no player ever has an action, post-over safe, reset clean`, issues.length === 0, issues.slice(0, 5).join(' | '));
  if (finals.length) {
    const avg = finals.reduce((a, b) => a + b, 0) / finals.length;
    console.log(`    per-player final score — min ${Math.min(...finals)}, max ${Math.max(...finals)}, avg ${avg.toFixed(1)} (max possible 77)`);
  }
}

function soakBankIt(n) {
  const ROLL_CAP = 3000;
  const finals = [];
  const issues = [];
  for (let i = 0; i < n; i++) {
    const count = randCount();
    const g = createGame('bank', namesFor(count));
    let prevScores = g.scores.slice();
    let rolls = 0;
    while (!g.isOver() && rolls < ROLL_CAP) {
      const ps = invariantsCommon(g, `bank#${i}(${count}p)`, issues);
      ps.forEach((p, idx) => { if (p.score < prevScores[idx]) issues.push(`bank#${i}: ${p.name}'s score decreased`); });
      prevScores = ps.map((p) => p.score);
      if (g.round > g.ROUNDS) issues.push(`bank#${i}: round ${g.round} exceeds ROUNDS ${g.ROUNDS}`);
      if (g.pot < 0) issues.push(`bank#${i}: negative pot ${g.pot}`);

      // Any in-play player with an enabled bank action might bank,
      // independent of whose turn it is to roll — that's the whole point
      // of the 'communal' turn model.
      for (const p of ps) {
        if (p.out) continue;
        const a = g.playerActions(p.index).find((x) => x.id === 'bank');
        if (!a) continue;
        if (a.disabled) { issues.push(`bank#${i}: bank reported disabled while pot=${g.pot} for ${p.name}`); continue; }
        if (g.pot >= 120 || Math.random() < 0.12) {
          const before = { score: g.scores[p.index], pot: g.pot };
          g.act('bank', p.index);
          if (g.scores[p.index] !== before.score + before.pot) issues.push(`bank#${i}: enabled bank ignored/miscalculated for ${p.name}`);
        }
      }
      if (g.isOver()) break;
      g.onRoll([d6(), d6()]);
      rolls++;
    }
    if (!g.isOver()) { issues.push(`bank#${i}: hit roll cap (${ROLL_CAP}) at ${count}p without ending`); continue; }
    if (g.result().standings.length !== count) issues.push(`bank#${i}: standings length mismatch`);
    if (g.round !== g.ROUNDS) issues.push(`bank#${i}: ended on round ${g.round}, expected exactly ${g.ROUNDS}`);
    finals.push(...g.scores);

    const before = g.scores.slice();
    g.onRoll([d6(), d6()]); g.act('bank', 0);
    if (!deepEqual(g.scores, before)) issues.push(`bank#${i}: post-over state changed`);

    if (i % 200 === 0) {
      const fresh = createGame('bank', namesFor(count));
      g.reset();
      if (!deepEqual(g, fresh)) issues.push(`bank#${i}: reset() did not restore a fresh state`);
    }
  }
  check(`bank it: ${n} games at 1-6 players — round never exceeds 10, pot never negative, no negative/decreasing scores, roller never a banked player, exactly 1 active player, post-over safe, reset clean, all under ${ROLL_CAP} rolls`, issues.length === 0, issues.slice(0, 5).join(' | '));
  if (finals.length) {
    const avg = finals.reduce((a, b) => a + b, 0) / finals.length;
    console.log(`    per-player final score — min ${Math.min(...finals)}, max ${Math.max(...finals)}, avg ${avg.toFixed(1)} (policy: bank at pot>=120, or 12% chance per opportunity)`);
  }
}

soakPig(SOAK_N);
soakChicago(SOAK_N);
soakBankIt(SOAK_N);

// ======================================================================

console.log(`\n${nChecks} checks, ${nChecks - nFailed} passed, ${nFailed} failed`);
console.log('GAMES:', nFailed === 0 ? 'PASS' : 'FAIL');
process.exit(nFailed === 0 ? 0 : 1);
