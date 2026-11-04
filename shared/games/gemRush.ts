import type { BoardsHostView, BoardsPlayerView } from '../boards';
import type { GameInfo } from '../protocol';

export const GEM_RUSH: GameInfo = {
  id: 'gem-rush',
  name: 'Gem Rush',
  description: 'Everyone gets the same board of gems on their phone. Swipe a gem to swap it with its neighbour: three or more in a line clear, and the ones above fall in. Chains score more. Most points in 90 seconds wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [
    { id: 'score', name: 'Score Attack', description: 'Most points in 90 seconds wins.' },
    { id: 'battle', name: 'Battle', description: 'Chains and big lines drop stones onto your rivals. Clear a line next to a stone to break it.' },
  ],
};

// A side-by-side boards game (see shared/boards.ts) with the board on the phone, scored by best
// score. Everyone's board starts the same, and new gems fall in from the same sequence. The
// grid's SIZE × SIZE, row by row from the top: a gem type (0 to GEM_TYPES - 1) or STONE.

export const ROUND_MS = 90_000;
export const SIZE = 8;
export const GEM_TYPES = 6;
export const STONE = GEM_TYPES;
export const GEM_COLORS = ['#ff5d73', '#ffd166', '#4cd37a', '#5ec8f2', '#b48cff', '#ff9f43'];
/** Breaking a stone (by clearing a line next to it) scores this. */
export const STONE_POINTS = 20;

/** A line of `length` cleared in step `chain` of a move (1 for the first). */
export function linePoints(length: number, chain: number) {
  const base = length * 10 + (length >= 5 ? 50 : length === 4 ? 20 : 0);
  return base * chain;
}

/** Battle: stones a line of `length` in step `chain` sends to a rival. */
export function lineStones(length: number, chain: number) {
  return chain - 1 + (length >= 4 ? 1 : 0) + (length >= 5 ? 1 : 0);
}

/** Every move that makes a line: [cell, cell to swap with], cells as row * SIZE + col. */
export function movesOn(grid: number[]): [number, number][] {
  const moves: [number, number][] = [];
  for (let c = 0; c < SIZE * SIZE; c++) {
    for (const d of [1, SIZE]) {
      const o = c + d;
      if ((d === 1 && c % SIZE === SIZE - 1) || o >= SIZE * SIZE || grid[c] === STONE || grid[o] === STONE) continue;
      const g = [...grid];
      [g[c], g[o]] = [g[o], g[c]];
      if (linesOn(g).length) moves.push([c, o]);
    }
  }
  return moves;
}

/** Every line of three or more of a gem (not stones), as lists of cells. */
export function linesOn(grid: number[]): number[][] {
  const lines: number[][] = [];
  // Rows, then columns.
  for (const [outer, inner] of [
    [SIZE, 1],
    [1, SIZE],
  ]) {
    for (let a = 0; a < SIZE; a++) {
      let run: number[] = [];
      for (let b = 0; b < SIZE; b++) {
        const c = a * outer + b * inner;
        if (run.length && grid[c] === grid[run[0]] && grid[c] !== STONE) run.push(c);
        else {
          if (run.length >= 3) lines.push(run);
          run = [c];
        }
      }
      if (run.length >= 3) lines.push(run);
    }
  }
  return lines;
}

/**
 * Each gem's outline (and a stone's), as points round a circle of radius 1: a round gem, a
 * diamond, a triangle, a hexagon, a square and a star, so they differ by shape as well as colour.
 */
export function gemOutline(type: number): [number, number][] {
  const ring = (n: number, r: (i: number) => number, turn = -Math.PI / 2) =>
    Array.from({ length: n }, (_, i) => [Math.cos(turn + (i / n) * Math.PI * 2) * r(i), Math.sin(turn + (i / n) * Math.PI * 2) * r(i)] as [number, number]);
  switch (type) {
    case 0:
      return ring(16, () => 0.9);
    case 1:
      return ring(4, () => 1);
    case 2:
      return ring(3, () => 1).map(([x, y]) => [x, y + 0.15]);
    case 3:
      return ring(6, () => 0.95, 0);
    case 4:
      return ring(4, () => 1.05, Math.PI / 4);
    case 5:
      return ring(10, (i) => (i % 2 ? 0.45 : 1));
    default:
      return ring(9, (i) => [0.9, 0.8, 0.95, 0.75, 0.9, 0.85, 0.8, 0.95, 0.85][i]);
  }
}

// ---- Views ---------------------------------------------------------------------------------

export interface GemBoardState {
  /** The grid, one character a cell: a digit for a gem, 'S' for a stone. */
  grid: string;
  score: number;
  /** Stones sent to rivals (battle). */
  stonesSent: number;
}

export interface GemPlayerState {
  grid: string;
  score: number;
  /** Counts up with each move tried (taken or not), so the phone knows when to play it. */
  moveId: number;
  /** The last move: the grid after each step (clear, fall, refill), to play through. Empty if it wasn't a move. */
  steps: string[];
  /** The cells cleared in each step (for the pop), and what the move scored. */
  cleared: number[][];
  gained: number;
  /** The last swap tried that made no line (to wiggle back). */
  rejected: [number, number] | null;
  battle: boolean;
  stonesSent: number;
}

export type GemHostView = BoardsHostView<GemBoardState>;
export type GemPlayerView = BoardsPlayerView<GemPlayerState>;

export type GemInput = { type: 'swap'; a: number; b: number };
