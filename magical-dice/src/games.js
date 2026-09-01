// Dice games played with the tray's real dice, for one player or a table of
// them passing the phone around.
//
// Rules only: no DOM, no THREE, no audio, and — deliberately — no randomness.
// A game never rolls anything. main.js rolls the physical dice, reads the
// settled faces, and hands the values here, so every game inherits the fate
// stream and stays as reproducible as a plain roll. Anything in this file
// calling Math.random would quietly break that.
//
// Two turn models, because the games genuinely differ:
//   'rotating'  one player acts at a time, then the turn passes (Pig, Chicago)
//   'communal'  everyone shares one running pot and each decides for
//               themselves when to get out (Bank It) — which is the whole
//               social point of that game, so it is worth the extra shape.
//
// Contract, for the UI:
//   game.loadout            dice the game needs, e.g. { d6: 2 }
//   game.turnModel          'rotating' | 'communal'
//   game.players()          [{ index, name, score, active, out, note }]
//   game.whoRolls()         index of whoever should physically roll now
//   game.canRoll()          may a roll happen right now?
//   game.onRoll(values)     feed settled faces (array of numbers)
//   game.playerActions(i)   [{ id, label, primary, disabled }] for that player
//   game.act(id, i)         run player i's button
//   game.status()           { headline, detail, sub, stake }
//                           stake: { value, label } | null — the amount
//                           currently at risk, shown big on the board
//   game.isOver()
//   game.result()           { title, detail, standings: [{ name, score, rank }] }
//   game.reset()

const sum = (vals) => vals.reduce((a, b) => a + b, 0);

/** Standings, highest first, with ties sharing a rank. */
function rank(names, scores) {
  const rows = names.map((name, i) => ({ name, score: scores[i] }));
  rows.sort((a, b) => b.score - a.score);
  let place = 0, prev = null;
  return rows.map((r, i) => {
    if (r.score !== prev) { place = i + 1; prev = r.score; }
    return { ...r, rank: place };
  });
}

const winnerLine = (standings) => {
  const top = standings.filter((s) => s.rank === 1);
  if (standings.length === 1) return `${standings[0].score} points`;
  return top.length > 1
    ? `${top.map((t) => t.name).join(' and ')} tie on ${top[0].score}`
    : `${top[0].name} wins with ${top[0].score}`;
};

/** Shared bookkeeping for the rotating games. */
class Rotating {
  constructor(names) {
    this.names = names.slice();
    this.turnModel = 'rotating';
  }

  get count() { return this.names.length; }
  whoRolls() { return this.current; }
  isOver() { return this.over; }

  /** Pass the turn on; returns true if that wrapped back to the first player. */
  _pass() {
    this.current = (this.current + 1) % this.count;
    return this.current === 0;
  }
}

/**
 * Pig — build a turn total, or lose it to a single pip. First past 100 wins,
 * so a trailing player is right to keep rolling when the leader banks.
 */
class Pig extends Rotating {
  constructor(names) {
    super(names);
    this.id = 'pig';
    this.name = 'Pig';
    this.loadout = { d6: 1 };
    this.TARGET = 100;
    this.reset();
  }

  reset() {
    this.scores = this.names.map(() => 0);
    this.turnTotal = 0;
    this.current = 0;
    this.round = 1;
    this.over = false;
    this.msg = `Roll to build a turn. A 1 loses it.`;
  }

  canRoll() { return !this.over; }

  onRoll(values) {
    if (this.over) return;
    const v = values[0];
    if (v === 1) {
      this.turnTotal = 0;
      this.msg = `${this.names[this.current]} rolls a single pip — the turn is lost.`;
      if (this._pass()) this.round += 1;
      return;
    }
    this.turnTotal += v;
    this.msg = `+${v}. Hold to keep ${this.turnTotal}.`;
  }

  playerActions(i) {
    if (this.over || i !== this.current || this.turnTotal === 0) return [];
    return [{ id: 'hold', label: `Hold ${this.turnTotal}`, primary: true, disabled: false }];
  }

  act(id, i = this.current) {
    if (this.over || id !== 'hold' || i !== this.current || this.turnTotal === 0) return;
    this.scores[i] += this.turnTotal;
    const kept = this.turnTotal;
    this.turnTotal = 0;
    if (this.scores[i] >= this.TARGET) {
      this.over = true;
      this.msg = `${this.names[i]} reaches ${this.scores[i]}.`;
      return;
    }
    this.msg = `${this.names[i]} keeps ${kept}.`;
    if (this._pass()) this.round += 1;
  }

  players() {
    return this.names.map((name, i) => ({
      index: i,
      name,
      score: this.scores[i],
      active: !this.over && i === this.current,
      out: false,
      note: !this.over && i === this.current && this.turnTotal > 0 ? `holding ${this.turnTotal}` : '',
    }));
  }

  status() {
    return {
      headline: this.over ? 'Complete' : `${this.names[this.current]} to roll`,
      detail: this.msg,
      sub: this.over ? 'final' : `first to ${this.TARGET} · turn ${this.round}`,
      // The number the decision is actually about — shown big, so nobody has
      // to read it off a button to decide whether to push their luck.
      stake: this.over ? null : { value: this.turnTotal, label: 'this turn' },
    };
  }

  result() {
    const standings = rank(this.names, this.scores);
    return { title: winnerLine(standings), detail: `Race to ${this.TARGET}.`, standings };
  }
}

/**
 * Chicago — eleven fixed targets, two through twelve. Everyone rolls at the
 * same target before it moves on, so nobody is chasing a different number.
 */
class Chicago extends Rotating {
  constructor(names) {
    super(names);
    this.id = 'chicago';
    this.name = 'Chicago';
    this.loadout = { d6: 2 };
    this.reset();
  }

  reset() {
    this.scores = this.names.map(() => 0);
    this.current = 0;
    this.target = 2;
    this.over = false;
    this.msg = 'One roll each per target, two through twelve.';
  }

  canRoll() { return !this.over; }

  onRoll(values) {
    if (this.over) return;
    const total = sum(values);
    const who = this.names[this.current];
    if (total === this.target) {
      this.scores[this.current] += this.target;
      this.msg = `${total} — ${who} takes ${this.target}.`;
    } else {
      this.msg = `${total}. ${who} wanted ${this.target}.`;
    }
    // The target only moves once every player has had their roll at it.
    if (this._pass()) {
      if (this.target >= 12) {
        this.over = true;
        this.msg = 'Eleven targets, all done.';
      } else {
        this.target += 1;
      }
    }
  }

  playerActions() { return []; } // Chicago offers no choices — that is the game
  act() { /* nothing to decide */ }

  players() {
    return this.names.map((name, i) => ({
      index: i, name, score: this.scores[i],
      active: !this.over && i === this.current, out: false, note: '',
    }));
  }

  status() {
    return {
      headline: this.over ? 'Complete' : `${this.names[this.current]} chases ${this.target}`,
      detail: this.msg,
      sub: this.over ? 'final' : `target ${this.target} of 12`,
      stake: null,   // nothing accumulates in Chicago; the target is the story
    };
  }

  result() {
    const standings = rank(this.names, this.scores);
    return { title: winnerLine(standings), detail: 'Eleven targets.', standings };
  }
}

/**
 * Bank It — one pot for the whole table. Sevens pay 70 for three rolls and
 * then ruin everyone still in; doubles double the pot. Banking takes the pot
 * as it stands and sits you out for the rest of the round — the pot carries
 * on without you, which is exactly the moment the game is played in.
 */
class BankIt {
  constructor(names) {
    this.id = 'bank';
    this.name = 'Bank It';
    this.turnModel = 'communal';
    this.loadout = { d6: 2 };
    this.names = names.slice();
    this.ROUNDS = 10;
    this.SAFE_ROLLS = 3;
    this.reset();
  }

  get count() { return this.names.length; }

  reset() {
    this.scores = this.names.map(() => 0);
    this.banked = this.names.map(() => false);
    this.round = 1;
    this.pot = 0;
    this.rolls = 0;
    this.roller = 0;
    this.over = false;
    this.msg = 'Sevens pay 70 for three rolls. After that they take the pot.';
  }

  /** Indices of players still in this round. */
  get inPlay() { return this.banked.map((b, i) => (b ? -1 : i)).filter((i) => i >= 0); }

  whoRolls() { return this.roller; }
  canRoll() { return !this.over && this.inPlay.length > 0; }
  isOver() { return this.over; }

  _advanceRoller() {
    if (this.inPlay.length === 0) return;
    let i = this.roller;
    do { i = (i + 1) % this.count; } while (this.banked[i]);
    this.roller = i;
  }

  _endRound(busted) {
    this.pot = 0;
    this.rolls = 0;
    this.banked = this.names.map(() => false);
    if (this.round >= this.ROUNDS) {
      this.over = true;
      this.msg = busted ? 'The last round ends with the pot lost.' : 'That was the last round.';
      return;
    }
    this.round += 1;
    // A fresh round starts with whoever follows the previous round's opener,
    // so the same player is not always first to face a seven.
    this.roller = (this.round - 1) % this.count;
  }

  onRoll(values) {
    if (this.over) return;
    const total = sum(values);
    const isDouble = values.length === 2 && values[0] === values[1];
    this.rolls += 1;

    if (this.rolls <= this.SAFE_ROLLS) {
      if (total === 7) { this.pot += 70; this.msg = 'Seven — seventy to the pot.'; }
      else { this.pot += total; this.msg = `+${total} to the pot.`; }
      this._advanceRoller();
      return;
    }
    if (total === 7) {
      this.msg = this.inPlay.length > 1
        ? 'Seven. Everyone still in loses the pot.'
        : 'Seven, and the pot is gone.';
      this._endRound(true);
      return;
    }
    if (isDouble) {
      this.pot *= 2;
      this.msg = `Doubles — the pot doubles to ${this.pot}.`;
    } else {
      this.pot += total;
      this.msg = `+${total} to the pot.`;
    }
    this._advanceRoller();
  }

  playerActions(i) {
    if (this.over || i == null || i < 0 || i >= this.count || this.banked[i] || this.pot === 0) return [];
    return [{ id: 'bank', label: `Bank ${this.pot}`, primary: true, disabled: false }];
  }

  act(id, i) {
    if (this.over || id !== 'bank') return;
    if (i == null || i < 0 || i >= this.count) return;
    if (this.banked[i] || this.pot === 0) return;
    const taken = this.pot;
    this.scores[i] += taken;
    this.banked[i] = true;
    this.msg = `${this.names[i]} banks ${taken}.`;
    if (this.inPlay.length === 0) this._endRound(false);
    else if (this.roller === i) this._advanceRoller();
  }

  players() {
    return this.names.map((name, i) => ({
      index: i,
      name,
      score: this.scores[i],
      active: !this.over && !this.banked[i] && i === this.roller,
      out: this.banked[i],
      note: this.banked[i] ? 'banked' : '',
    }));
  }

  status() {
    const safe = this.rolls < this.SAFE_ROLLS;
    return {
      headline: this.over ? 'Complete' : `${this.names[this.roller]} to roll`,
      detail: this.msg,
      sub: this.over ? 'final' : `round ${this.round} of ${this.ROUNDS}${safe ? ' · sevens pay' : ''}`,
      stake: this.over ? null : { value: this.pot, label: 'in the pot' },
    };
  }

  result() {
    const standings = rank(this.names, this.scores);
    return { title: winnerLine(standings), detail: `${this.ROUNDS} rounds of nerve.`, standings };
  }
}

export const MAX_PLAYERS = 6;

export const GAMES = [
  {
    id: 'pig', name: 'Pig', dice: '1d6', players: '1–6', turnModel: 'rotating',
    blurb: 'Roll to build a turn, hold to keep it, and lose the lot to a single pip. First past 100 wins.',
  },
  {
    id: 'bank', name: 'Bank It', dice: '2d6', players: '1–6', turnModel: 'communal',
    blurb: 'One pot for the whole table. Sevens pay 70 for three rolls, then ruin everyone still in. Bank alone, and the pot rolls on without you.',
  },
  {
    id: 'chicago', name: 'Chicago', dice: '2d6', players: '1–6', turnModel: 'rotating',
    blurb: 'Eleven targets, two through twelve. Everyone rolls at the same number before it moves on.',
  },
];

const BUILDERS = { pig: Pig, bank: BankIt, chicago: Chicago };

/** names: array of 1..MAX_PLAYERS display names. */
export function createGame(id, names = ['You']) {
  const Builder = BUILDERS[id];
  if (!Builder) throw new Error(`unknown game: ${id}`);
  const list = (Array.isArray(names) ? names : [names])
    .map((n, i) => (String(n ?? '').trim() || `Player ${i + 1}`))
    .slice(0, MAX_PLAYERS);
  return new Builder(list.length ? list : ['You']);
}

export const gameById = (id) => GAMES.find((g) => g.id === id) ?? null;
