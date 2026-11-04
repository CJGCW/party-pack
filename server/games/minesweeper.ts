import {
  BOOM,
  COLS,
  FLAGGED,
  HIDDEN,
  MINES,
  MINESWEEPER,
  MINE_LOCK_MS,
  ROUND_MS,
  ROWS,
  neighbours,
  type MineInput,
  type MineState,
} from '../../shared/games/minesweeper';
import { BoardsGame } from './boards';
import { createMineTurns } from './mineTurns';
import type { GameContext, MiniGameDefinition } from './MiniGame';
import { seededRandom } from './spiralShot/board';

export interface Minefield {
  mines: boolean[];
  /** Mines touching each square. */
  counts: number[];
  /** The square everyone starts with uncovered (it has no mines touching it). */
  opening: number;
}

/** The round's field: mines scattered from the seed, with an opening near the middle (made again until there is one). */
export function makeMinefield(seed: number, count = MINES): Minefield {
  const random = seededRandom(seed);
  for (;;) {
    const mines = new Array(COLS * ROWS).fill(false);
    for (let placed = 0; placed < count; ) {
      const c = Math.floor(random() * mines.length);
      if (!mines[c]) {
        mines[c] = true;
        placed++;
      }
    }
    const counts = mines.map((_, c) => neighbours(c).filter((n) => mines[n]).length);
    const middle = Math.floor(ROWS / 2) * COLS + Math.floor(COLS / 2);
    const zeros = counts.flatMap((n, c) => (n === 0 && !mines[c] ? [c] : []));
    if (!zeros.length) continue;
    const dist = (c: number) => Math.abs(Math.floor(c / COLS) - Math.floor(middle / COLS)) + Math.abs((c % COLS) - (middle % COLS));
    const opening = zeros.reduce((best, c) => (dist(c) < dist(best) ? c : best));
    return { mines, counts, opening };
  }
}

export interface Sweeper {
  field: Minefield;
  uncovered: boolean[];
  flagged: boolean[];
  boomed: boolean[];
  count: number;
  booms: number;
  /** Locked after a mine until this time (ms into the round). */
  lockedUntil: number;
}

const SAFE = COLS * ROWS - MINES;

/** Uncovers a square; a square with no mines touching it uncovers all round it too. */
export function uncover(s: Sweeper, cell: number) {
  const stack = [cell];
  while (stack.length) {
    const c = stack.pop()!;
    if (s.uncovered[c] || s.field.mines[c]) continue;
    s.uncovered[c] = true;
    s.flagged[c] = false;
    s.count++;
    if (s.field.counts[c] === 0) stack.push(...neighbours(c));
  }
}

export function newSweeper(seed: number, mines = MINES): Sweeper {
  const field = makeMinefield(seed, mines);
  const n = COLS * ROWS;
  const s: Sweeper = { field, uncovered: new Array(n).fill(false), flagged: new Array(n).fill(false), boomed: new Array(n).fill(false), count: 0, booms: 0, lockedUntil: 0 };
  uncover(s, field.opening);
  return s;
}

/** A tap to uncover, `ms` into the round. Returns 'done' when every safe square's uncovered, true if anything changed. */
export function reveal(s: Sweeper, cell: number, ms: number): 'done' | boolean {
  if (ms < s.lockedUntil || s.uncovered[cell] || s.flagged[cell] || s.boomed[cell]) return false;
  if (s.field.mines[cell]) {
    s.boomed[cell] = true;
    s.booms++;
    s.lockedUntil = ms + MINE_LOCK_MS;
    return true;
  }
  uncover(s, cell);
  return s.count === SAFE ? 'done' : true;
}

class Minesweeper extends BoardsGame<Sweeper, MineState, MineState> {
  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'race', tickHz: 0 });
  }

  protected newBoard(seed: number) {
    return newSweeper(seed);
  }

  protected boardInput(s: Sweeper, raw: unknown) {
    const input = raw as MineInput;
    if (this.phase !== 'play' || !Number.isInteger(input.cell) || input.cell < 0 || input.cell >= COLS * ROWS) return false;
    if (input.type === 'flag') {
      if (s.uncovered[input.cell] || s.boomed[input.cell]) return false;
      s.flagged[input.cell] = !s.flagged[input.cell];
      return true;
    }
    if (input.type !== 'reveal') return false;
    const result = reveal(s, input.cell, this.roundMs());
    return result === 'done' ? 'ended' : result;
  }

  protected boardProgress(s: Sweeper) {
    return s.count / SAFE;
  }

  protected boardScore(s: Sweeper) {
    return Math.round((100 * s.count) / SAFE);
  }

  private state(s: Sweeper): MineState {
    // Once the round's over, every mine shows.
    const over = this.phase === 'result' || this.phase === 'gameEnd';
    const squares = s.uncovered.map((up, c) =>
      up ? s.field.counts[c] : s.boomed[c] || (over && s.field.mines[c]) ? BOOM : s.flagged[c] ? FLAGGED : HIDDEN,
    );
    return { squares, lockedMs: Math.max(0, s.lockedUntil - this.roundMs()), uncovered: s.count, safe: SAFE, booms: s.booms };
  }

  protected hostState(s: Sweeper) {
    return this.state(s);
  }

  protected playerState(s: Sweeper) {
    return this.state(s);
  }
}

export const minesweeper: MiniGameDefinition = {
  info: MINESWEEPER,
  create: (ctx, modeId, options) => (modeId === 'turns' ? createMineTurns(ctx, options.puzzles) : new Minesweeper(ctx, options.puzzles)),
};
