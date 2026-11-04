import type { BoardsHostView, BoardsPlayerView } from '../boards';
import type { GameInfo } from '../protocol';

export const POPPIT: GameInfo = {
  id: 'poppit',
  name: 'Poppit',
  description: 'Tap a bunch of two or more same-coloured balloons, then tap again to pop them. Balloons float up to fill the gaps. Bigger bunches score far more. Best score in 90 seconds wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [
    { id: 'standard', name: 'Score attack', description: 'Everyone gets the same balloons; 90 seconds.' },
    { id: 'duel', name: 'Duel', description: 'The same balloons, but pop a bunch of 8 or more and grey stones float into your rival’s board. Stones can’t be popped. Best with two.' },
  ],
};

// A side-by-side boards game (see shared/boards.ts) with the board on the phone: the server checks
// every pop. Scored by the best. Everyone gets the same balloons (from the round's seed).

export const ROUND_MS = 90_000;
export const COLS = 9;
export const ROWS = 12;
/** Balloon colours (indexes into this); EMPTY is no balloon. */
export const BALLOON_COLORS = ['#ff5d73', '#ffd166', '#4cd37a', '#5ec8f2'];
export const EMPTY = -1;
/** Duel: a stone. It floats with the balloons, but can't be popped. */
export const STONE = 4;
export const STONE_COLOR = '#8b8799';
/** Duel: a bunch this big sends stones, half its size, to a rival. */
export const DUEL_BUNCH = 8;
export const stonesFor = (n: number) => (n >= DUEL_BUNCH ? Math.floor(n / 2) : 0);
/** A balloon with a gift in it is worth this much extra when it pops. */
export const GIFT_POINTS = 20;
/** Clearing every balloon is worth this. */
export const CLEAR_BONUS = 500;

/** Each cell's balloon colour (EMPTY for none), row by row from the top: index = row * COLS + col. */
export type Grid = number[];

/** Points for popping a bunch of `n`. */
export function groupPoints(n: number) {
  return n * (n - 1);
}

/** The bunch of touching same-coloured balloons (up, down, left, right) that includes `cell`. */
export function groupAt(grid: Grid, cell: number): number[] {
  const color = grid[cell];
  if (color === EMPTY || color === STONE || color === undefined) return [];
  const seen = new Set([cell]);
  const stack = [cell];
  while (stack.length) {
    const c = stack.pop()!;
    const r = Math.floor(c / COLS);
    const col = c % COLS;
    const next = [r > 0 ? c - COLS : -1, r < ROWS - 1 ? c + COLS : -1, col > 0 ? c - 1 : -1, col < COLS - 1 ? c + 1 : -1];
    for (const n of next) {
      if (n >= 0 && !seen.has(n) && grid[n] === color) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return [...seen];
}

/**
 * Pops a bunch and lets the rest settle: balloons float up each column to fill the gaps, then
 * empty columns close up toward the left. Returns the new grid (and which cells had gifts move with them).
 */
export function popAndSettle(grid: Grid, gifts: boolean[], group: number[]): { grid: Grid; gifts: boolean[] } {
  const g = [...grid];
  const gf = [...gifts];
  for (const c of group) {
    g[c] = EMPTY;
    gf[c] = false;
  }
  const columns: { colors: number[]; gifts: boolean[] }[] = [];
  for (let col = 0; col < COLS; col++) {
    const colors: number[] = [];
    const colGifts: boolean[] = [];
    for (let r = 0; r < ROWS; r++) {
      const c = r * COLS + col;
      if (g[c] !== EMPTY) {
        colors.push(g[c]);
        colGifts.push(gf[c]);
      }
    }
    if (colors.length) columns.push({ colors, gifts: colGifts });
  }
  const out: Grid = new Array(COLS * ROWS).fill(EMPTY);
  const outGifts: boolean[] = new Array(COLS * ROWS).fill(false);
  columns.forEach((column, col) => {
    column.colors.forEach((color, r) => {
      out[r * COLS + col] = color;
      outGifts[r * COLS + col] = column.gifts[r];
    });
  });
  return { grid: out, gifts: outGifts };
}

/** Whether any bunch of two or more is left. */
export function hasMoves(grid: Grid) {
  for (let c = 0; c < grid.length; c++) {
    if (grid[c] === EMPTY || grid[c] === STONE) continue;
    const col = c % COLS;
    if ((col < COLS - 1 && grid[c + 1] === grid[c]) || (c + COLS < grid.length && grid[c + COLS] === grid[c])) return true;
  }
  return false;
}

// ---- Views ---------------------------------------------------------------------------------

/** One board, as the TV and its player's phone draw it. */
export interface PoppitState {
  grid: Grid;
  gifts: number[];
  score: number;
  /** Duel: big bunches send stones. */
  duel: boolean;
  /** Duel: stones on their way: they float in as there's room. */
  incoming: number;
  /** The last pop: which cells, for the TV to flash, counting up so each shows once. */
  popped: { n: number; cells: number[] } | null;
}

export type PoppitHostView = BoardsHostView<PoppitState>;
export type PoppitPlayerView = BoardsPlayerView<PoppitState>;

/** Pop the bunch including this cell (the phone has already shown it highlighted). */
export type PoppitInput = { type: 'pop'; cell: number };
