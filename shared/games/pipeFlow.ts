import type { BoardsHostView, BoardsPlayerView } from '../boards';
import type { GameInfo } from '../protocol';

export const PIPE_FLOW: GameInfo = {
  id: 'pipe-flow',
  name: 'Pipe Flow',
  description: 'Tap squares to lay the next pipe piece and build a path from the tap. The water starts after 20 seconds and keeps coming: stay ahead of it. Longest flow wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: '90 seconds a round.' }],
};

// A side-by-side boards game (see shared/boards.ts) with the board on the phone: the server lays
// every piece and runs the water. Scored by the best. Everyone gets the same tap and the same
// pieces in the same order (from the round's seed).

export const ROUND_MS = 90_000;
export const TICK_HZ = 10;
export const COLS = 7;
export const ROWS = 9;
/** The water starts this far into the round, then fills a square every FLOW_MS (speeding up to FLOW_MS_END by the end). */
export const WATER_START_MS = 20_000;
export const FLOW_MS = 2_000;
export const FLOW_MS_END = 1_000;
/** Laying a piece over a dry one swaps it, but locks your board this long. */
export const REPLACE_MS = 1_500;
/** How many coming pieces the phone shows. */
export const QUEUE_SHOWN = 5;

// Sides, as bits.
export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;
export type Side = typeof N | typeof E | typeof S | typeof W;
const OPPOSITE: Record<number, Side> = { [N]: S, [E]: W, [S]: N, [W]: E };

/** The pieces, by the sides they open onto: straights, corners, and a crossing (water goes straight through it). */
export const PIECES = [E | W, N | S, N | E, S | E, S | W, N | W, N | E | S | W];
export const CROSS = 6;
export const NO_PIECE = -1;

/** A repeatable random number in [0, 1) for (seed, n). */
function hash(seed: number, n: number) {
  let t = (seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x85ebca6b);
  t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35);
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}

/** The round's tap: a square away from the edges, and the side the water comes out of (with room to go). */
export function sourceFor(seed: number): { cell: number; out: Side } {
  const row = 2 + Math.floor(hash(seed, 1) * (ROWS - 4));
  const col = 1 + Math.floor(hash(seed, 2) * (COLS - 2));
  const out = ([N, E, S, W] as Side[])[Math.floor(hash(seed, 3) * 4)];
  return { cell: row * COLS + col, out };
}

/** Piece number `n` in the round's queue: about a third straights, half corners, the rest crossings. */
export function pieceAt(seed: number, n: number) {
  const r = hash(seed, 100 + n);
  if (r < 0.32) return Math.floor(hash(seed, 5000 + n) * 2);
  if (r < 0.88) return 2 + Math.floor(hash(seed, 9000 + n) * 4);
  return CROSS;
}

/** The square next to `cell` through side `side`, or -1 off the grid. */
export function across(cell: number, side: Side) {
  const r = Math.floor(cell / COLS);
  const c = cell % COLS;
  if (side === N) return r > 0 ? cell - COLS : -1;
  if (side === S) return r < ROWS - 1 ? cell + COLS : -1;
  if (side === E) return c < COLS - 1 ? cell + 1 : -1;
  return c > 0 ? cell - 1 : -1;
}

/** Water coming into a piece through `inSide`: the side it leaves by, or null if the piece doesn't open there. */
export function flowThrough(piece: number, inSide: Side): Side | null {
  const open = PIECES[piece];
  if (piece === NO_PIECE || !(open & inSide)) return null;
  if (piece === CROSS) return OPPOSITE[inSide];
  return (open & ~inSide) as Side;
}

export function opposite(side: Side) {
  return OPPOSITE[side];
}

/** How long each square takes to fill `ms` into the round. */
export function flowMsAt(ms: number) {
  const f = Math.min(1, Math.max(0, (ms - WATER_START_MS) / (ROUND_MS - WATER_START_MS)));
  return FLOW_MS + (FLOW_MS_END - FLOW_MS) * f;
}

// ---- Views ---------------------------------------------------------------------------------

/** One grid, as the TV and its player's phone draw it. */
export interface PipeState {
  /** Each square's piece (NO_PIECE for none). */
  pieces: number[];
  source: { cell: number; out: Side };
  /** The squares the water's filled, in order, each with the side it came in by. */
  filled: { cell: number; in: Side }[];
  /** The next few pieces to lay. */
  queue: number[];
  /** ms until the water starts or fills its next square, and until the board's unlocked after a swap. */
  waterMs: number;
  lockedMs: number;
}

export type PipeHostView = BoardsHostView<PipeState>;
export type PipePlayerView = BoardsPlayerView<PipeState>;

/** Lay the next piece on a square. */
export type PipeInput = { type: 'lay'; cell: number };
