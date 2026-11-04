import type { BoardsHostView, BoardsPlayerView } from '../boards';
import type { GameInfo } from '../protocol';

export const SNOW_CHASE: GameInfo = {
  id: 'snow-chase',
  name: 'Snow Chase',
  description: 'Ski downhill by turning your phone, dodging trees and taking gates. After a minute the snow beast comes after you. Last one skiing wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: '90 seconds a round. Outrun the beast for the bonus.' }],
};

// A side-by-side boards game (see shared/boards.ts), scored by survival. Everyone skis the same
// slope (from the round's seed). Distances are down the slope (y down).

export const ROUND_MS = 90_000;
export const TICK_HZ = 30;
/** The board, in its own units: 700 wide, 1000 high; the skier stays this far down it. */
export const VIEW_W = 700;
export const VIEW_H = 1000;
export const SKIER_SCREEN_Y = 300;
export const SKIER_R = 18;
export const TREE_R = 26;
/** Turning the phone points the skis this many times as far, up to MAX_HEADING either way of straight down. */
export const HEADING_GAIN = 1.4;
export const MAX_HEADING = 1.25;
/** Speed straight down the hill: this at the start, up to SPEED_END by the end. Going across the slope is slower. */
export const SPEED_START = 520;
export const SPEED_END = 820;
/** Hitting a tree stops you this long. */
export const CRASH_MS = 1_000;
/**
 * The beast comes this far into the round, this far behind you, and runs at this share of the
 * speed straight down: clean skiing outruns it, but every crash and every wide turn lets it gain.
 */
export const BEAST_AT_MS = 60_000;
export const BEAST_START_BEHIND = 900;
export const BEAST_SHARE = 0.9;
/** Trees come in rows this far apart; gates every so many rows. */
export const ROW_GAP = 230;
export const GATE_EVERY_ROWS = 8;
export const GATE_WIDTH = 190;

/** A repeatable random number in [0, 1) for (seed, n). */
function hash(seed: number, n: number) {
  let t = (seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x85ebca6b);
  t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35);
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}

export interface Tree {
  id: number;
  x: number;
  y: number;
}

/** Row `n`'s trees (none in the first few rows, more further down), kept clear of its gate if it has one. */
export function treesInRow(seed: number, n: number): Tree[] {
  if (n < 4) return [];
  const y = n * ROW_GAP;
  const count = 1 + Math.floor(hash(seed, n * 9) * Math.min(2, 1 + n / 40));
  const gate = gateInRow(seed, n);
  const trees: Tree[] = [];
  for (let k = 0; k < count; k++) {
    const x = 40 + hash(seed, n * 9 + 1 + k) * (VIEW_W - 80);
    if (gate && x > gate.left - TREE_R && x < gate.left + GATE_WIDTH + TREE_R) continue;
    trees.push({ id: n * 10 + k, x, y: y + (hash(seed, n * 9 + 6 + k) - 0.5) * ROW_GAP * 0.5 });
  }
  return trees;
}

/** Row `n`'s gate, if it has one: two flags GATE_WIDTH apart. */
export function gateInRow(seed: number, n: number): { n: number; left: number; y: number } | null {
  if (n < 3 || n % GATE_EVERY_ROWS !== 0) return null;
  return { n, left: 50 + hash(seed, n * 9 + 99) * (VIEW_W - 100 - GATE_WIDTH), y: n * ROW_GAP };
}

/** How fast you go straight down `ms` into the round. */
export function speedAt(ms: number) {
  return SPEED_START + (SPEED_END - SPEED_START) * Math.min(1, ms / ROUND_MS);
}

// ---- Views ---------------------------------------------------------------------------------

/** One skier, as the TV draws them. */
export interface SnowBoardState {
  x: number;
  y: number;
  heading: number;
  crashed: boolean;
  /** How far behind the beast is (null before it comes). */
  beastBehind: number | null;
  gates: number;
}

export interface SnowPlayerState {
  gates: number;
  beastBehind: number | null;
}

export type SnowHostView = BoardsHostView<SnowBoardState>;
export type SnowPlayerView = BoardsPlayerView<SnowPlayerState>;
