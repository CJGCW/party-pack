import type { BoardsHostView, BoardsPlayerView } from '../boards';
import type { GameInfo } from '../protocol';

export const UNBLOCK_CAR: GameInfo = {
  id: 'unblock-car',
  name: 'Unblock Car',
  description: 'Slide the cars and trucks (each only along its length) until your red car can drive out. A chain of lots, getting harder. Most solved, in the fewest moves, wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: '90 seconds a round.' }],
};

// A side-by-side boards game (see shared/boards.ts) with the board on the phone: the server checks
// every move. Scored by the best. Everyone gets the same chain of puzzles (from the round's seed).

export const ROUND_MS = 90_000;
export const SIZE = 6;
/** The red car is always on this row, heading for the exit on the right. */
export const EXIT_ROW = 2;
/** A lot written as SIZE × SIZE letters, row by row: '.' is empty, 'A' the red car, other letters cars and trucks. */
export type Lot = string;
/** Solving a lot scores this, less MOVE_COST for each move beyond the fewest it takes (down to SOLVE_MIN). */
export const SOLVE_POINTS = 100;
export const MOVE_COST = 8;
export const SOLVE_MIN = 40;

export interface Vehicle {
  id: string;
  /** Its top-left cell, and whether it lies across (else up and down). */
  row: number;
  col: number;
  across: boolean;
  length: number;
}

/** The vehicles in a lot. */
export function vehiclesIn(lot: Lot): Vehicle[] {
  const seen = new Map<string, Vehicle>();
  for (let i = 0; i < SIZE * SIZE; i++) {
    const id = lot[i];
    if (id === '.' || seen.has(id)) continue;
    const row = Math.floor(i / SIZE);
    const col = i % SIZE;
    const across = col < SIZE - 1 && lot[i + 1] === id;
    let length = 1;
    while (across ? col + length < SIZE && lot[i + length] === id : row + length < SIZE && lot[i + length * SIZE] === id) length++;
    seen.set(id, { id, row, col, across, length });
  }
  return [...seen.values()];
}

/** The cells a vehicle covers. */
export function cellsOf(v: Vehicle) {
  return Array.from({ length: v.length }, (_, k) => (v.across ? v.row * SIZE + v.col + k : (v.row + k) * SIZE + v.col));
}

/**
 * Slides vehicle `id` so its top-left is at `to` (a column if it lies across, else a row), if the
 * way is clear. Returns the new lot, or null if it can't go there.
 */
export function slide(lot: Lot, id: string, to: number): Lot | null {
  const v = vehiclesIn(lot).find((o) => o.id === id);
  if (!v || !Number.isInteger(to) || to < 0 || to + v.length > SIZE) return null;
  const from = v.across ? v.col : v.row;
  if (to === from) return null;
  const cells = [...lot];
  for (const c of cellsOf(v)) cells[c] = '.';
  // Every cell it passes through on the way must be empty.
  const lo = Math.min(from, to);
  const hi = Math.max(from, to) + v.length - 1;
  for (let k = lo; k <= hi; k++) {
    const c = v.across ? v.row * SIZE + k : k * SIZE + v.col;
    if (cells[c] !== '.') return null;
  }
  for (let k = 0; k < v.length; k++) cells[v.across ? v.row * SIZE + to + k : (to + k) * SIZE + v.col] = id;
  return cells.join('');
}

/** The red car's at the exit. */
export function solved(lot: Lot) {
  return lot[EXIT_ROW * SIZE + SIZE - 1] === 'A';
}

/** Points for solving a lot in `moves` when it can be done in `fewest`. */
export function solvePoints(moves: number, fewest: number) {
  return Math.max(SOLVE_MIN, SOLVE_POINTS - MOVE_COST * Math.max(0, moves - fewest));
}

// ---- Views ---------------------------------------------------------------------------------

/** One player's lot, as the TV and their phone draw it. */
export interface UnblockState {
  lot: Lot;
  /** Which lot of the chain they're on (from 1), out of how many; how many moves on it, and the fewest it takes. */
  number: number;
  total: number;
  moves: number;
  fewest: number;
  /** Lots solved so far, and the points from them. */
  solved: number;
  points: number;
  /** The last move, so the TV can show it sliding (counts up). */
  moved: { n: number; id: string } | null;
}

export type UnblockHostView = BoardsHostView<UnblockState>;
export type UnblockPlayerView = BoardsPlayerView<UnblockState>;

/** Slide a vehicle so its top-left is at `to` (a column across, else a row). */
export type UnblockInput = { type: 'slide'; id: string; to: number; number: number };
