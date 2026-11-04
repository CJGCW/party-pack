import type { GameInfo } from '../protocol';

export const CASTLE_SIEGE: GameInfo = {
  id: 'castle-siege',
  name: 'Castle Siege',
  description: 'Every castle starts walled in. Fire: tap your rivals’ land to shell their walls. Repair: fit block pieces into the gaps in your own wall. A castle that isn’t walled in all round when repairs end is out. Last castle standing wins. Best with two.',
  minPlayers: 2,
  maxPlayers: 4,
  modes: [{ id: 'standard', name: 'Standard', description: 'Last castle standing wins.' }],
};

// The map's a grid (COLS × ROWS cells): two players get a half each, three or four a quarter.
// Rounds go fire, repair, fire, repair… A castle's walled in if there's no way from the edge of
// its land to the castle except through wall (worked out by filling in from the edge).

export const COLS = 40;
export const ROWS = 24;
export const CELL = 24;
export const FIRE_MS = 18_000;
export const REPAIR_MS = 22_000;
export const CYCLES = 4;
/** A shell lands this long after it's fired, and you can fire again after RELOAD_MS. */
export const SHELL_MS = 800;
export const RELOAD_MS = 1_100;
export const RING = 4;

export type SiegePhase = 'fire' | 'repair' | 'result' | 'gameEnd';

/** Player `i` of `n`'s land: left, top, width, height (cells). */
export function landOf(i: number, n: number) {
  if (n <= 2) return { x: i * (COLS / 2), y: 0, w: COLS / 2, h: ROWS };
  return { x: (i % 2) * (COLS / 2), y: Math.floor(i / 2) * (ROWS / 2), w: COLS / 2, h: ROWS / 2 };
}

/** Where a castle sits (its top-left of 2 × 2 cells), in the middle of its land. */
export function castleOf(i: number, n: number) {
  const l = landOf(i, n);
  return { x: l.x + Math.floor(l.w / 2) - 1, y: l.y + Math.floor(l.h / 2) - 1 };
}

/** The pieces: cells relative to their first. */
export const PIECES: [number, number][][] = [
  [[0, 0]],
  [
    [0, 0],
    [1, 0],
  ],
  [
    [0, 0],
    [1, 0],
    [2, 0],
  ],
  [
    [0, 0],
    [1, 0],
    [0, 1],
  ],
  [
    [0, 0],
    [1, 0],
    [2, 0],
    [1, 1],
  ],
  [
    [0, 0],
    [1, 0],
    [1, 1],
    [2, 1],
  ],
  [
    [0, 0],
    [1, 0],
    [2, 0],
    [2, 1],
  ],
];

/** A piece turned `turns` quarter turns. */
export function turned(piece: [number, number][], turns: number): [number, number][] {
  let out = piece;
  for (let t = 0; t < ((turns % 4) + 4) % 4; t++) out = out.map(([x, y]) => [-y, x]);
  return out;
}

/** The round's pieces, in order (the same for everyone). */
export function piecesFor(seed: number, count = 200): number[] {
  let s = seed >>> 0 || 1;
  return Array.from({ length: count }, () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0), Math.floor((s / 2 ** 32) * PIECES.length)));
}

export interface SiegePlayer {
  id: string;
  name: string;
  color: string;
  index: number;
  out: boolean;
  /** Cells of land walled in (with the castle). */
  enclosed: number;
  points: number;
  gamePoints: number;
}

export interface SiegeView {
  phase: SiegePhase;
  puzzleNumber: number;
  totalPuzzles: number;
  cycle: number;
  /** Walls: a cell per character, the owner's index ('0'–'3') or '.'. */
  walls: string;
  /** Shells in flight: from (x, y) to (x, y), when they land (ms left). */
  shells: number[];
  players: SiegePlayer[];
  msLeft: number;
  you?: string;
  /** On a phone in the repair: the next piece, how it's turned, and how many placed. */
  piece?: number;
  turns?: number;
  /** On a phone in the fire: can fire again in this long. */
  reloadMs?: number;
}

export type SiegeInput = { type: 'fire'; x: number; y: number } | { type: 'place'; x: number; y: number } | { type: 'turn' };
