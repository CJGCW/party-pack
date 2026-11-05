import type { GameInfo } from '../protocol';

export const CASTLE_SIEGE: GameInfo = {
  id: 'castle-siege',
  name: 'Castle Siege',
  description: 'Every castle starts walled in. Cannons: place what you’ve earned inside your walls; more land walled in earns more. Fire: tap your rivals’ land, and your loaded cannons shell it. Repair: fit block pieces into the gaps in your own wall. A castle that isn’t walled in all round when repairs end is out. Last castle standing wins. Best with two.',
  minPlayers: 2,
  maxPlayers: 4,
  modes: [{ id: 'standard', name: 'Standard', description: 'Last castle standing wins.' }],
};

// The map's a grid (COLS × ROWS cells): two players get a half each, three or four a quarter.
// Rounds go cannons, fire, repair, cannons… A castle's walled in if there's no way from the edge of
// its land to the castle except through wall (worked out by filling in from the edge).

export const COLS = 40;
export const ROWS = 24;
export const CELL = 24;
export const CANNON_MS = 8_000;
export const FIRE_MS = 18_000;
export const REPAIR_MS = 22_000;
export const CYCLES = 4;
/** A shell lands this long after it's fired, and a cannon can fire again after RELOAD_MS. */
export const SHELL_MS = 800;
export const RELOAD_MS = 2_400;
export const RING = 4;
/** Each cannon phase earns one cannon, plus one for every this many cells walled in. */
export const LAND_PER_CANNON = 40;
/** A cannon takes this many direct hits. It's 2 × 2 cells, like a castle. */
export const CANNON_HP = 3;

export const cannonsEarned = (enclosed: number) => 1 + Math.floor(enclosed / LAND_PER_CANNON);

export type SiegePhase = 'cannons' | 'fire' | 'repair' | 'result' | 'gameEnd';

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
  /** Cannons: owner's index, x, y, hits left, flat. */
  cannons: number[];
  players: SiegePlayer[];
  msLeft: number;
  you?: string;
  /** On a phone in the repair: the next piece, how it's turned, and how many placed. */
  piece?: number;
  turns?: number;
  /** On a phone in the fire: can fire again in this long. */
  reloadMs?: number;
  /** On a phone in the cannon phase: cannons still to place. */
  toPlace?: number;
}

export type SiegeInput = { type: 'fire'; x: number; y: number } | { type: 'place'; x: number; y: number } | { type: 'cannon'; x: number; y: number } | { type: 'turn' };
