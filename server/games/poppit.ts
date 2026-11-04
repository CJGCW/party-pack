import {
  BALLOON_COLORS,
  CLEAR_BONUS,
  COLS,
  EMPTY,
  GIFT_POINTS,
  POPPIT,
  ROUND_MS,
  ROWS,
  STONE,
  groupAt,
  groupPoints,
  hasMoves,
  popAndSettle,
  stonesFor,
  type Grid,
  type PoppitInput,
  type PoppitState,
} from '../../shared/games/poppit';
import { BoardsGame } from './boards';
import type { GameContext, MiniGameDefinition } from './MiniGame';
import { seededRandom } from './spiralShot/board';

/** A balloon takes its neighbour's colour this often (so there are bunches to find). */
const CLUMPING = 0.42;
/** A board needs at least this many bunches of BIG or more, or it's made again. */
const BIG = 5;
const MIN_BIG = 4;
const GIFT_CHANCE = 0.06;

export interface Field {
  grid: Grid;
  gifts: boolean[];
  score: number;
  pops: number;
  lastPop: number[];
  /** Duel: stones on their way, waiting for room. */
  incoming: number;
}

/** Counts the bunches of at least `size`. */
export function bunches(grid: Grid, size: number) {
  const seen = new Set<number>();
  let count = 0;
  for (let c = 0; c < grid.length; c++) {
    if (seen.has(c) || grid[c] === EMPTY) continue;
    const group = groupAt(grid, c);
    group.forEach((g) => seen.add(g));
    if (group.length >= size) count++;
  }
  return count;
}

/** The round's balloons: clumped colours, with a few gifts, made again until there are enough big bunches. */
export function makeField(seed: number): Field {
  const random = seededRandom(seed);
  for (;;) {
    const grid: Grid = [];
    for (let c = 0; c < COLS * ROWS; c++) {
      const col = c % COLS;
      const neighbours = [col > 0 ? grid[c - 1] : -1, c >= COLS ? grid[c - COLS] : -1].filter((n) => n >= 0);
      grid.push(neighbours.length && random() < CLUMPING ? neighbours[Math.floor(random() * neighbours.length)] : Math.floor(random() * BALLOON_COLORS.length));
    }
    const gifts = grid.map(() => random() < GIFT_CHANCE);
    if (bunches(grid, BIG) >= MIN_BIG) return { grid, gifts, score: 0, pops: 0, lastPop: [], incoming: 0 };
  }
}

/** Pops the bunch at `cell` if it's two or more. Returns whether it popped. */
export function pop(f: Field, cell: number) {
  const group = groupAt(f.grid, cell);
  if (group.length < 2) return false;
  f.score += groupPoints(group.length) + group.filter((c) => f.gifts[c]).length * GIFT_POINTS;
  ({ grid: f.grid, gifts: f.gifts } = popAndSettle(f.grid, f.gifts, group));
  f.pops++;
  f.lastPop = group;
  if (f.grid.every((c) => c === EMPTY)) f.score += CLEAR_BONUS;
  f.incoming = addStones(f.grid, f.incoming);
  return true;
}

/** Stones arrive under the balloons, in columns picked at random (full or empty columns are left alone). Returns how many there was no room for. */
export function addStones(grid: Grid, count: number) {
  for (let i = 0; i < count; i++) {
    const open: number[] = [];
    for (let col = 0; col < COLS; col++) {
      const row = Array.from({ length: ROWS }, (_, r) => r).find((r) => grid[r * COLS + col] === EMPTY);
      if (row) open.push(row * COLS + col);
    }
    if (!open.length) return count - i;
    grid[open[Math.floor(Math.random() * open.length)]] = STONE;
  }
  return 0;
}

class Poppit extends BoardsGame<Field, PoppitState, PoppitState> {
  constructor(
    ctx: GameContext,
    totalPuzzles: number,
    private readonly duel: boolean,
  ) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'best', tickHz: 0 });
  }

  protected newBoard(seed: number) {
    return makeField(seed);
  }

  /** A pop; the board's done when no bunch of two is left. */
  protected boardInput(f: Field, raw: unknown) {
    const input = raw as PoppitInput;
    if (input.type !== 'pop' || this.phase !== 'play' || !Number.isInteger(input.cell) || input.cell < 0 || input.cell >= COLS * ROWS) return false;
    if (!pop(f, input.cell)) return false;
    if (this.duel) this.sendGarbage(f, stonesFor(f.lastPop.length));
    return hasMoves(f.grid) ? true : 'ended';
  }

  protected receiveGarbage(f: Field, amount: number) {
    f.incoming = addStones(f.grid, f.incoming + amount);
  }

  protected boardScore(f: Field) {
    return f.score;
  }

  private state(f: Field): PoppitState {
    return {
      grid: f.grid,
      gifts: f.gifts.flatMap((g, i) => (g ? [i] : [])),
      score: f.score,
      duel: this.duel,
      incoming: f.incoming,
      popped: f.pops ? { n: f.pops, cells: f.lastPop } : null,
    };
  }

  protected hostState(f: Field) {
    return this.state(f);
  }

  protected playerState(f: Field) {
    return this.state(f);
  }
}

export const poppit: MiniGameDefinition = {
  info: POPPIT,
  create: (ctx, modeId, options) => new Poppit(ctx, options.puzzles, modeId === 'duel'),
};
