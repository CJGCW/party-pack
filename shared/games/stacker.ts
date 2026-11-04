import type { BoardsHostView, BoardsPlayerView } from '../boards';
import type { GameInfo } from '../protocol';

export const STACKER: GameInfo = {
  id: 'stacker',
  name: 'Stacker',
  description: 'A row of blocks slides back and forth: tap to drop it on the stack. Anything hanging over the edge falls off. Highest tower wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: '60 seconds a round.' }],
};

// A side-by-side boards game (see shared/boards.ts), scored by the best tower. Your tower is on
// your phone too, so you can time your taps exactly; the TV shows everyone's.

export const ROUND_MS = 60_000;
/** Columns across, and how wide the first row is. */
export const COLS = 7;
export const START_WIDTH = 3;
/** The sliding row moves a column every this many ms: slower low down, faster as the tower grows. */
const STEP_MS_START = 200;
const STEP_MS_PER_ROW = 8;
const STEP_MS_MIN = 60;

export function stepMsFor(row: number) {
  return Math.max(STEP_MS_MIN, STEP_MS_START - row * STEP_MS_PER_ROW);
}

/** Where a row `width` wide is (its left column), `ms` after it started sliding: from the left, back and forth. */
export function slidePosition(width: number, stepMs: number, ms: number) {
  const span = COLS - width;
  if (span <= 0) return 0;
  const k = Math.floor(Math.max(0, ms) / stepMs) % (span * 2);
  return k <= span ? k : span * 2 - k;
}

/** A row of the tower: its left column and how many blocks wide it is. */
export type Row = [col: number, width: number];

// ---- Views ---------------------------------------------------------------------------------

/** One tower, as the TV and its player's phone draw it. */
export interface StackState {
  /** The tower, from the bottom (the first row is the base). */
  rows: Row[];
  /** The row sliding back and forth: how wide, how fast, and how long it's been going (ms). */
  sliding: { width: number; stepMs: number; ms: number } | null;
  /** The last blocks to fall off the edge: which row, and the part that fell. Counts up so each fall shows once. */
  fell: { n: number; row: number; col: number; width: number } | null;
}

export type StackHostView = BoardsHostView<StackState>;
export type StackPlayerView = BoardsPlayerView<StackState>;

/**
 * Drop the sliding row where it is. `col` is where the phone saw it; the server checks it could
 * have been there a moment ago. `row` is which row it's for, so a double tap doesn't drop two.
 */
export type StackInput = { type: 'drop'; row: number; col: number };
