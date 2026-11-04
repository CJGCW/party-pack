import type { ArenaHostView, ArenaPlayerView } from '../arena';
import type { GameInfo } from '../protocol';

export const BLAST_GRID: GameInfo = {
  id: 'blast-grid',
  name: 'Blast Grid',
  description: 'Everyone starts in a corner of a yard full of crates. Drag to walk, tap to drop a bomb: it blasts in a cross, smashing crates (some hide power-ups) and anyone caught in it. Later on, blocks fall in from the edges. Last one standing wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'Last one standing wins.' }],
};

// A shared arena game (see shared/arena.ts), scored by survival. The yard's a grid of cells:
// 13 × 11 for up to four players, 17 × 13 for more. Positions are in cells (a cell's middle is a
// whole number); the TV draws each cell CELL units across.

export const ROUND_MS = 120_000;
export const TICK_HZ = 20;
export const CELL = 64;
/** Walking speed (cells a second), and how much each speed-up adds (up to MAX_SPEEDUPS of them). */
export const WALK_SPEED = 3.4;
export const SPEEDUP = 0.6;
export const MAX_SPEEDUPS = 3;
/** A bomb goes off this long after it's dropped; its flames last FLAME_MS. */
export const FUSE_MS = 2_400;
export const FLAME_MS = 500;
/** Start with one bomb at a time and a blast two cells long; power-ups add to both. */
export const START_BOMBS = 1;
export const START_RANGE = 2;
export const MAX_BOMBS = 6;
export const MAX_RANGE = 8;
/** A crate hides a power-up this often; this share of the yard's free cells start as crates. */
export const POWERUP_CHANCE = 0.32;
export const CRATE_CHANCE = 0.72;
/** From this point, blocks fall in from the edges, spiralling in, one every FALL_EVERY_MS. */
export const FALL_AT_MS = 75_000;
export const FALL_EVERY_MS = 300;

export function gridSize(players: number) {
  return players > 4 ? { cols: 17, rows: 13 } : { cols: 13, rows: 11 };
}

/** Walls: round the edge, and a pillar on every other cell each way. */
export function isWall(x: number, y: number, cols: number, rows: number) {
  return x <= 0 || y <= 0 || x >= cols - 1 || y >= rows - 1 || (x % 2 === 0 && y % 2 === 0);
}

/** Where everyone starts: the corners first, then the middles of the sides (all clear of pillars, being next to an edge). */
export function spawns(cols: number, rows: number): [number, number][] {
  const midX = Math.floor(cols / 2);
  const midY = Math.floor(rows / 2);
  return [
    [1, 1],
    [cols - 2, rows - 2],
    [cols - 2, 1],
    [1, rows - 2],
    [midX, 1],
    [midX, rows - 2],
    [1, midY],
    [cols - 2, midY],
  ];
}

/**
 * The cells, row by row, one character each: '#' wall, '+' crate, '.' open; power-ups lying
 * about are 'b' (another bomb), 'f' (bigger blast) and 's' (speed).
 */
export type Cell = '#' | '+' | '.' | 'b' | 'f' | 's';

// ---- Views ---------------------------------------------------------------------------------

export interface BomberView {
  playerId: string;
  color: string;
  x: number;
  y: number;
  alive: boolean;
}

export interface BlastWorld {
  cols: number;
  rows: number;
  cells: string;
  bombs: { id: number; x: number; y: number; ownerColor: string; fuse: number }[];
  /** Cells on fire (index = y * cols + x). */
  flames: number[];
  bombers: BomberView[];
}

export interface BlastPlayerState {
  bombs: number;
  range: number;
  speedups: number;
  crates: number;
}

export type BlastHostView = ArenaHostView<BlastWorld>;
export type BlastPlayerView = ArenaPlayerView<BlastPlayerState>;

export type StickInput = { type: 'stick'; x: number; y: number };
export type BlastInput = StickInput | { type: 'bomb' };
