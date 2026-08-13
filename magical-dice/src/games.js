// Dice games played with the tray's real dice.
//
// Rules only: no DOM, no THREE, no audio, and — deliberately — no randomness.
// A game never rolls anything. main.js rolls the physical dice, reads the
// settled faces, and hands the values here, so every game inherits the fate
// stream and stays as reproducible as a plain roll. Anything in this file
// calling Math.random would quietly break that.
//
// Contract, for the UI:
//   game.loadout          dice the game needs, e.g. { d6: 2 }
//   game.status()         { headline, detail, score, sub } for the HUD
//   game.actions()        [{ id, label, primary, disabled }] buttons to show
//   game.canRoll()        may the player roll right now?
//   game.onRoll(values)   feed settled faces (array of numbers)
//   game.act(id)          run a button
//   game.isOver()         finished?
//   game.result()         { title, detail } once over
//   game.reset()          start again

const sum = (vals) => vals.reduce((a, b) => a + b, 0);

/**
 * Pig — the classic push-your-luck game, and the simplest thing that teaches
 * the shape of all of them: bank a modest sure thing, or roll again.
 */
class Pig {
  constructor() { this.loadout = { d6: 1 }; this.reset(); }

  reset() {
    this.score = 0;
    this.turnTotal = 0;
    this.turns = 1;
    this.over = false;
    this.msg = 'Roll to build a turn. A 1 loses it all.';
    this.lastBust = false;
  }

  canRoll() { return !this.over; }

  onRoll(values) {
    if (this.over) return;
    const v = values[0];
    this.lastBust = false;
    if (v === 1) {
      this.turnTotal = 0;
      this.turns += 1;
      this.lastBust = true;
      this.msg = 'A single pip. The turn is lost.';
      return;
    }
    this.turnTotal += v;
    this.msg = `+${v}. Hold to keep ${this.turnTotal}.`;
  }

  actions() {
    return [{ id: 'hold', label: `Hold ${this.turnTotal || ''}`.trim(), primary: true, disabled: this.turnTotal === 0 || this.over }];
  }

  act(id) {
    if (id !== 'hold' || this.turnTotal === 0 || this.over) return;
    this.score += this.turnTotal;
    this.turnTotal = 0;
    if (this.score >= 100) {
      this.over = true;
      this.msg = 'A hundred, and the game is yours.';
    } else {
      this.turns += 1;
      this.msg = 'Banked. A new turn begins.';
    }
  }

  status() {
    return {
      headline: this.over ? 'Complete' : `Turn ${this.turns}`,
      detail: this.msg,
      score: this.score,
      sub: this.over ? `in ${this.turns} turns` : `holding ${this.turnTotal}`,
    };
  }

  isOver() { return this.over; }
  result() { return { title: `${this.score} in ${this.turns} turns`, detail: 'Fewer turns is a better run.' }; }
}

/**
 * Bank It — pot builds across the round; a 7 is a gift early and ruin later,
 * doubles double the pot, and you may bank whenever nerve fails.
 */
class BankIt {
  constructor() { this.loadout = { d6: 2 }; this.ROUNDS = 10; this.reset(); }

  reset() {
    this.score = 0;
    this.round = 1;
    this.pot = 0;
    this.rollsThisRound = 0;
    this.over = false;
    this.msg = 'Sevens pay 70 for the first three rolls. After that they ruin you.';
    this.lastBust = false;
  }

  canRoll() { return !this.over; }

  get safeRolls() { return 3; }

  onRoll(values) {
    if (this.over) return;
    const total = sum(values);
    const isDouble = values.length === 2 && values[0] === values[1];
    this.rollsThisRound += 1;
    this.lastBust = false;

    if (this.rollsThisRound <= this.safeRolls) {
      if (total === 7) {
        this.pot += 70;
        this.msg = 'Seven — seventy to the pot.';
      } else {
        this.pot += total;
        this.msg = `+${total} to the pot.`;
      }
      return;
    }
    if (total === 7) {
      this.pot = 0;
      this.lastBust = true;
      this.msg = 'Seven, and the pot is gone.';
      this._endRound(false);
      return;
    }
    if (isDouble) {
      this.pot *= 2;
      this.msg = `Doubles — the pot doubles to ${this.pot}.`;
      return;
    }
    this.pot += total;
    this.msg = `+${total} to the pot.`;
  }

  _endRound(banked) {
    if (banked) this.score += this.pot;
    this.pot = 0;
    this.rollsThisRound = 0;
    if (this.round >= this.ROUNDS) {
      this.over = true;
      this.msg = banked ? 'Banked, and that was the last round.' : 'The last round ends empty.';
    } else {
      this.round += 1;
    }
  }

  actions() {
    return [{ id: 'bank', label: `Bank ${this.pot || ''}`.trim(), primary: true, disabled: this.pot === 0 || this.over }];
  }

  act(id) {
    if (id !== 'bank' || this.pot === 0 || this.over) return;
    const taken = this.pot;
    this._endRound(true);
    if (!this.over) this.msg = `Banked ${taken}.`;
  }

  status() {
    const safe = this.rollsThisRound < this.safeRolls;
    return {
      headline: this.over ? 'Complete' : `Round ${this.round} of ${this.ROUNDS}`,
      detail: this.msg,
      score: this.score,
      sub: this.over ? 'final' : `pot ${this.pot}${safe ? ' · sevens still pay' : ''}`,
    };
  }

  isOver() { return this.over; }
  result() { return { title: `Banked ${this.score}`, detail: 'Ten rounds of nerve.' }; }
}

/**
 * Chicago — eleven fixed targets, two dice, one roll each. No decisions, just
 * the pleasure of chasing a number the dice owe you.
 */
class Chicago {
  constructor() { this.loadout = { d6: 2 }; this.reset(); }

  reset() {
    this.score = 0;
    this.target = 2;
    this.hits = 0;
    this.over = false;
    this.msg = 'One roll per target, two through twelve.';
    this.lastBust = false;
  }

  canRoll() { return !this.over; }

  onRoll(values) {
    if (this.over) return;
    const total = sum(values);
    const hit = total === this.target;
    this.lastBust = !hit;
    if (hit) {
      this.score += this.target;
      this.hits += 1;
      this.msg = `${total} — the target, and ${this.target} points.`;
    } else {
      this.msg = `${total}. The target was ${this.target}.`;
    }
    if (this.target >= 12) {
      this.over = true;
      this.msg = `Eleven targets, ${this.hits} hit.`;
    } else {
      this.target += 1;
    }
  }

  actions() { return []; }
  act() { /* Chicago offers no choices — that is the game */ }

  status() {
    return {
      headline: this.over ? 'Complete' : `Chasing ${this.target}`,
      detail: this.msg,
      score: this.score,
      sub: this.over ? `${this.hits} of 11 hit` : `${this.hits} hit so far`,
    };
  }

  isOver() { return this.over; }
  result() { return { title: `${this.score} points`, detail: `${this.hits} of eleven targets.` }; }
}

export const GAMES = [
  { id: 'pig', name: 'Pig', blurb: 'One die. Roll to build a turn, hold to keep it, and lose it all to a single pip. First to 100.', dice: '1d6' },
  { id: 'bank', name: 'Bank It', blurb: 'Ten rounds. Sevens pay 70 for three rolls, then ruin you. Doubles double the pot. Bank before your nerve breaks.', dice: '2d6' },
  { id: 'chicago', name: 'Chicago', blurb: 'Eleven targets, two through twelve, one roll each. Hit the number and take its points.', dice: '2d6' },
];

const BUILDERS = { pig: Pig, bank: BankIt, chicago: Chicago };

export function createGame(id) {
  const Builder = BUILDERS[id];
  if (!Builder) throw new Error(`unknown game: ${id}`);
  return new Builder();
}

export const gameById = (id) => GAMES.find((g) => g.id === id) ?? null;
